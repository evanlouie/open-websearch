import { Effect } from "effect";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SearchEngineError, type SearchResult } from "../types.js";
import { searchBing } from "../engines/bing.js";
import { searchDuckDuckGo } from "../engines/duckduckgo.js";
import { searchBrave } from "../engines/brave.js";
import {
  AppConfig,
  AppConfigTag,
  getConfig,
  supportedSearchEngines,
  type SupportedEngine,
} from "../config.js";
import { StderrLoggerLayer } from "../logging.js";

const SUPPORTED_ENGINES = supportedSearchEngines;

const engineMap: Record<
  SupportedEngine,
  (
    query: string,
    limit: number,
  ) => Effect.Effect<SearchResult[], SearchEngineError, AppConfig>
> = {
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
};

const distributeLimit = (totalLimit: number, engineCount: number): number[] => {
  const base = Math.floor(totalLimit / engineCount);
  const remainder = totalLimit % engineCount;

  return Array.from(
    { length: engineCount },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
};

interface EngineQueryResult {
  query: string;
  engine: string;
  results: SearchResult[];
}

interface AggregatedQueryResult {
  query: string;
  engines: SupportedEngine[];
  totalResults: number;
  results: SearchResult[];
}

const executeMultiQuerySearch = (
  queries: string[],
  engines: SupportedEngine[],
  limit: number,
  config: AppConfig,
): Effect.Effect<AggregatedQueryResult[], never, never> =>
  Effect.gen(function* (_) {
    const cleanedQueries = queries.map((query) => query.trim());
    const uniqueQueries = [...new Set(cleanedQueries)];
    const limits = distributeLimit(limit, engines.length);

    yield* _(
      Effect.logDebug("Executing multi-query search.").pipe(
        Effect.annotateLogs({
          originalQueries: queries,
          uniqueQueries,
          engines,
          limit,
        }),
      ),
    );

    const engineEffects = engines.map((engine, engineIndex) => {
      const searchFn = engineMap[engine];
      const engineLimit = limits[engineIndex];

      return Effect.forEach(uniqueQueries, (query) => {
        if (!query) {
          return Effect.succeed<EngineQueryResult>({
            query,
            engine,
            results: [],
          });
        }

        const effect = searchFn(query, engineLimit).pipe(
          Effect.provideService(AppConfigTag, config),
          Effect.provide(StderrLoggerLayer),
          Effect.map(
            (results): EngineQueryResult => ({
              query,
              engine,
              results,
            }),
          ),
          Effect.tapError((error) =>
            Effect.logError("Search failed.").pipe(
              Effect.annotateLogs({
                engine,
                query,
                error: error instanceof Error ? error.message : String(error),
                stack:
                  error instanceof Error && error.stack
                    ? error.stack
                    : undefined,
              }),
            ),
          ),
          Effect.orElseSucceed(() => ({
            query,
            engine,
            results: [],
          })),
        );

        return effect;
      });
    });

    const allEngineResults = yield* _(
      Effect.all(engineEffects, { concurrency: "unbounded" }),
    );

    return cleanedQueries.map<AggregatedQueryResult>((originalQuery) => {
      const aggregatedResults: SearchResult[] = [];

      for (const engineResults of allEngineResults) {
        const match = engineResults.find(
          (result) => result.query === originalQuery,
        );
        if (match) {
          aggregatedResults.push(...match.results);
        }
      }

      return {
        query: originalQuery,
        engines,
        totalResults: aggregatedResults.length,
        results: aggregatedResults.slice(0, limit),
      };
    });
  });

const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  description: z.string(),
  source: z.string(),
  engine: z.string(),
});

const SearchOutputSchema = {
  results: z.array(
    z.object({
      query: z.string(),
      engines: z.array(z.string()),
      totalResults: z.number(),
      results: z.array(SearchResultSchema),
    }),
  ),
};

const resolveAllowedEngines = (config: AppConfig): SupportedEngine[] =>
  config.allowedSearchEngines.length > 0
    ? (config.allowedSearchEngines as SupportedEngine[])
    : [...SUPPORTED_ENGINES];

const toEngineEnum = (engines: SupportedEngine[]) =>
  z.enum(engines as [SupportedEngine, ...SupportedEngine[]]);

const buildSearchDescription = (config: AppConfig): string => {
  const bingWarning =
    "⚠️ WARNING: Bing is currently experiencing issues and may not return results. Recommended engines: Brave or DuckDuckGo. ";
  const engines = resolveAllowedEngines(config);

  if (config.allowedSearchEngines.length === 0) {
    return (
      bingWarning +
      "Search the web using Bing, Brave, or DuckDuckGo. Supports single or multiple queries (max 10). No API key required."
    );
  }

  const enginesText = engines
    .map((engine) => engine.charAt(0).toUpperCase() + engine.slice(1))
    .join(", ");
  const hasBing = engines.includes("bing");

  return (
    (hasBing ? bingWarning : "") +
    `Search the web using these engines: ${enginesText}. Supports single or multiple queries (max 10). No API key required.`
  );
};

export const setupTools = (server: McpServer) =>
  Effect.gen(function* (_) {
    const config = yield* _(getConfig);
    const allowedEngines = resolveAllowedEngines(config);
    const enginesEnum = toEngineEnum(allowedEngines);

    yield* _(
      Effect.sync(() => {
        server.registerTool(
          "search",
          {
            description: buildSearchDescription(config),
            inputSchema: {
              query: z
                .array(z.string().min(1, "Search query must not be empty"))
                .min(1, "At least one query is required")
                .max(10, "Maximum 10 queries allowed")
                .describe(
                  'Array of search queries. For single query, use ["query text"]. For multiple queries, use ["query1", "query2", "query3"]. Maximum 10 queries per request.',
                ),
              limit: z
                .number()
                .min(1)
                .max(50)
                .default(10)
                .describe(
                  "Number type: Maximum number of results to return per query (default: 10, range: 1-50)",
                ),
              engines: z
                .array(enginesEnum)
                .min(1)
                .default([config.defaultSearchEngine])
                .describe(
                  `Array of strings: Search engines to use. Example: ["brave", "duckduckgo"]. Default: ["${config.defaultSearchEngine}"]`,
                )
                .transform((requestedEngines) => {
                  if (config.allowedSearchEngines.length > 0) {
                    const filtered = requestedEngines.filter((engine) =>
                      config.allowedSearchEngines.includes(engine),
                    );

                    return filtered.length > 0
                      ? filtered
                      : [config.defaultSearchEngine];
                  }
                  return requestedEngines;
                }),
            },
            outputSchema: SearchOutputSchema,
          },
          async ({
            query,
            limit = 10,
            engines = [config.defaultSearchEngine],
          }) => {
            const effectiveEngines = engines as SupportedEngine[];

            const effect = executeMultiQuerySearch(
              query,
              effectiveEngines,
              limit,
              config,
            ).pipe(Effect.provide(StderrLoggerLayer));

            try {
              const results = await Effect.runPromise(effect);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({ results }, null, 2),
                  },
                ],
                structuredContent: { results },
              };
            } catch (error) {
              const message =
                error instanceof Error ? error.message : "Unknown error";
              await Effect.runPromise(
                Effect.logError("Search tool execution failed.").pipe(
                  Effect.annotateLogs({
                    error: message,
                    stack:
                      error instanceof Error && error.stack
                        ? error.stack
                        : undefined,
                  }),
                  Effect.provide(StderrLoggerLayer),
                ),
              );

              return {
                content: [
                  {
                    type: "text",
                    text: `Search failed: ${message}`,
                  },
                ],
                isError: true,
              };
            }
          },
        );
      }),
    );
  });
