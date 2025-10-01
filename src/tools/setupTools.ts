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

// Execute search
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

export const setupTools = (server: McpServer): void => {
  // Search tool
  // Generate dynamic description for search tool
  const getSearchDescription = () => {
    if (config.allowedSearchEngines.length === 0) {
      return "Search the web using Bing, Brave, or DuckDuckGo (no API key required)";
    } else {
      const enginesText = config.allowedSearchEngines
        .map((e) => e.charAt(0).toUpperCase() + e.slice(1))
        .join(", ");
      return `Search the web using these engines: ${enginesText} (no API key required)`;
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
      query: z.string().min(1, "Search query must not be empty"),
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
        console.error(
          `Searching for "${query}" using engines: ${engines.join(", ")}`,
        );

        const results = await executeSearch(query.trim(), engines, limit);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: query.trim(),
                  engines: engines,
                  totalResults: results.length,
                  results: results,
                },
                null,
                2,
              ),
            },
          ],
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
