// tools/setupTools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { searchBing } from "../engines/bing/bing.js";
import { SearchResult } from "../types.js";
import { z } from "zod";
import { searchDuckDuckGo } from "../engines/duckduckgo/index.js";
import { config } from "../config.js";
import { searchBrave } from "../engines/brave/index.js";

// Supported search engines
const SUPPORTED_ENGINES = ["bing", "duckduckgo", "brave"] as const;
type SupportedEngine = (typeof SUPPORTED_ENGINES)[number];

// Search engine function mapping
const engineMap: Record<
  SupportedEngine,
  (query: string, limit: number) => Promise<SearchResult[]>
> = {
  bing: searchBing,
  duckduckgo: searchDuckDuckGo,
  brave: searchBrave,
};

// Distribute search result limits
const distributeLimit = (totalLimit: number, engineCount: number): number[] => {
  const base = Math.floor(totalLimit / engineCount);
  const remainder = totalLimit % engineCount;

  return Array.from(
    { length: engineCount },
    (_, i) => base + (i < remainder ? 1 : 0),
  );
};

// Execute multi-query search with per-engine sequential, cross-engine parallel execution
const executeMultiQuerySearch = async (
  queries: string[],
  engines: string[],
  limit: number,
): Promise<
  Array<{
    query: string;
    engines: string[];
    totalResults: number;
    results: SearchResult[];
  }>
> => {
  // Deduplicate queries after trimming to avoid redundant searches
  const cleanedQueries = queries.map((q) => q.trim());
  const uniqueQueries = [...new Set(cleanedQueries)];

  console.error(
    `[DEBUG] Executing multi-query search, original queries: [${queries.map((q) => `"${q}"`).join(", ")}], unique queries after deduplication: [${uniqueQueries.map((q) => `"${q}"`).join(", ")}], engines: ${engines.join(", ")}, limit: ${limit}`,
  );

  const limits = distributeLimit(limit, engines.length);

  // For each engine, process all unique queries sequentially
  const engineTasks = engines.map(async (engine, engineIndex) => {
    const engineLimit = limits[engineIndex];
    const searchFn = engineMap[engine as SupportedEngine];

    if (!searchFn) {
      console.error(`Unsupported search engine: ${engine}`);
      return uniqueQueries.map((q) => ({
        query: q,
        engine,
        results: [] as SearchResult[],
      }));
    }

    const engineResults: Array<{
      query: string;
      engine: string;
      results: SearchResult[];
    }> = [];

    // Process unique queries sequentially for this engine
    for (const query of uniqueQueries) {
      if (!query) {
        console.error(`Query string is empty after trimming`);
        engineResults.push({ query, engine, results: [] });
        continue;
      }

      try {
        const results = await searchFn(query, engineLimit);
        engineResults.push({ query, engine, results });
      } catch (error) {
        console.error(
          `Search failed for engine ${engine}, query "${query}":`,
          error,
        );
        engineResults.push({ query, engine, results: [] });
      }
    }

    return engineResults;
  });

  // Run all engine tasks in parallel
  const allEngineResults = await Promise.all(engineTasks);

  // Map results back to original query positions (preserving order and duplicates)
  return cleanedQueries.map((originalQuery) => {
    const queryResults: SearchResult[] = [];

    // Collect results from all engines for this query
    for (const engineResults of allEngineResults) {
      const engineQueryResult = engineResults.find(
        (r) => r.query === originalQuery,
      );
      if (engineQueryResult) {
        queryResults.push(...engineQueryResult.results);
      }
    }

    return {
      query: originalQuery,
      engines,
      totalResults: queryResults.length,
      results: queryResults.slice(0, limit),
    };
  });
};

// Define output schema for search tool
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

export const setupTools = (server: McpServer): void => {
  // Search tool
  // Generate dynamic description for search tool
  const getSearchDescription = () => {
    const bingWarning =
      "⚠️ WARNING: Bing is currently experiencing issues and may not return results. Recommended engines: Brave or DuckDuckGo. ";
    if (config.allowedSearchEngines.length === 0) {
      return (
        bingWarning +
        "Search the web using Bing, Brave, or DuckDuckGo. Supports single or multiple queries (max 10). No API key required."
      );
    } else {
      const enginesText = config.allowedSearchEngines
        .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
        .join(", ");
      const hasBing = config.allowedSearchEngines.includes("bing");
      return (
        (hasBing ? bingWarning : "") +
        `Search the web using these engines: ${enginesText}. Supports single or multiple queries (max 10). No API key required.`
      );
    }
  };

  // Generate enumeration of search engine options
  const getEnginesEnum = () => {
    // If no restrictions, use all supported engines
    const allowedEngines =
      config.allowedSearchEngines.length > 0
        ? config.allowedSearchEngines
        : [...SUPPORTED_ENGINES];

    return z.enum(allowedEngines as [string, ...string[]]);
  };

  server.registerTool(
    "search",
    {
      description: getSearchDescription(),
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
          .array(getEnginesEnum())
          .min(1)
          .default([config.defaultSearchEngine])
          .describe(
            `Array of strings: Search engines to use. Example: ["brave", "duckduckgo"]. Default: ["${config.defaultSearchEngine}"]`,
          )
          .transform((requestedEngines) => {
            // If allowed search engines are configured, filter requested engines
            if (config.allowedSearchEngines.length > 0) {
              const filteredEngines = requestedEngines.filter((engine) =>
                config.allowedSearchEngines.includes(engine),
              );

              // If all requested engines are filtered out, use default engine
              return filteredEngines.length > 0
                ? filteredEngines
                : [config.defaultSearchEngine];
            }
            return requestedEngines;
          }),
      },
      outputSchema: SearchOutputSchema,
    },
    async ({ query, limit = 10, engines = ["bing"] }) => {
      try {
        console.error(
          `Searching for ${query.length} ${query.length === 1 ? "query" : "queries"}: [${query.map((q: string) => `"${q}"`).join(", ")}] using engines: ${engines.join(", ")}`,
        );

        const results = await executeMultiQuerySearch(query, engines, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ results }, null, 2),
            },
          ],
          structuredContent: {
            results,
          },
        };
      } catch (error) {
        console.error("Search tool execution failed:", error);
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
};
