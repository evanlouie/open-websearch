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

// Execute search for a single query
const executeSearch = async (
  query: string,
  engines: string[],
  limit: number,
): Promise<SearchResult[]> => {
  // Clean up the query string to ensure it won't cause issues due to spaces or special characters
  const cleanQuery = query.trim();
  console.error(
    `[DEBUG] Executing search, query: "${cleanQuery}", engines: ${engines.join(", ")}, limit: ${limit}`,
  );

  if (!cleanQuery) {
    console.error("Query string is empty");
    throw new Error("Query string cannot be empty");
  }

  const limits = distributeLimit(limit, engines.length);

  const searchTasks = engines.map((engine, index) => {
    const engineLimit = limits[index];
    const searchFn = engineMap[engine as SupportedEngine];

    if (!searchFn) {
      console.error(`Unsupported search engine: ${engine}`);
      return Promise.resolve([]);
    }

    return searchFn(query, engineLimit).catch((error) => {
      console.error(`Search failed for engine ${engine}:`, error);
      return [];
    });
  });

  try {
    const results = await Promise.all(searchTasks);
    return results.flat().slice(0, limit);
  } catch (error) {
    console.error("Search execution failed:", error);
    throw error;
  }
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

  server.tool(
    "search",
    getSearchDescription(),
    {
      query: z.union([
        z.string().min(1, "Search query must not be empty"),
        z
          .array(z.string().min(1))
          .min(1, "At least one query is required")
          .max(10, "Maximum 10 queries allowed"),
      ]),
      limit: z.number().min(1).max(50).default(10),
      engines: z
        .array(getEnginesEnum())
        .min(1)
        .default([config.defaultSearchEngine])
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
    async ({ query, limit = 10, engines = ["bing"] }) => {
      try {
        // Check if query is an array or a single string
        const isMultiQuery = Array.isArray(query);

        if (isMultiQuery) {
          console.error(
            `Searching for multiple queries: [${query.map((q) => `"${q}"`).join(", ")}] using engines: ${engines.join(", ")}`,
          );

          const results = await executeMultiQuerySearch(query, engines, limit);

          return {
            content: [
              {
                type: "text",
                text: `Completed search for ${query.length} ${query.length === 1 ? "query" : "queries"} using ${engines.join(", ")}`,
              },
              {
                type: "resource",
                resource: {
                  uri: `search://multi-query/${Date.now()}`,
                  mimeType: "application/json",
                  text: JSON.stringify(
                    {
                      results,
                    },
                    null,
                    2,
                  ),
                },
              },
            ],
          };
        } else {
          console.error(
            `Searching for "${query}" using engines: ${engines.join(", ")}`,
          );

          const results = await executeSearch(query.trim(), engines, limit);
          const cleanQuery = query.trim();

          return {
            content: [
              {
                type: "text",
                text: `Found ${results.length} result${results.length === 1 ? "" : "s"} for "${cleanQuery}" using ${engines.join(", ")}`,
              },
              {
                type: "resource",
                resource: {
                  uri: `search://query/${encodeURIComponent(cleanQuery)}/${Date.now()}`,
                  mimeType: "application/json",
                  text: JSON.stringify(
                    {
                      query: cleanQuery,
                      engines: engines,
                      totalResults: results.length,
                      results: results,
                    },
                    null,
                    2,
                  ),
                },
              },
            ],
          };
        }
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
