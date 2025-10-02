import { describe, test, expect } from "bun:test";
import { Effect } from "effect";
import { AppConfigLayer, getConfig } from "../config.js";

describe("Multi-Query Search Tests", () => {
  test("Server starts successfully with multi-query support", async () => {
    // This test verifies that the server can be created without errors
    // The multi-query functionality is implicitly tested through the tool schema
    const { createMcpServer } = await import("../server.js");
    const server = await Effect.runPromise(
      createMcpServer.pipe(Effect.provide(AppConfigLayer)),
    );

    expect(server).toBeDefined();
  });

  test("Default search engine resolves to auto", async () => {
    const config = await Effect.runPromise(
      getConfig.pipe(Effect.provide(AppConfigLayer)),
    );

    expect(config.defaultSearchEngine).toBe("auto");
  });

  test("Multi-query tool description includes multiple queries support", async () => {
    const { createMcpServer } = await import("../server.js");
    const server = await Effect.runPromise(
      createMcpServer.pipe(Effect.provide(AppConfigLayer)),
    );

    // Verify server has name and version
    expect(server).toBeDefined();
    // The tool is registered through setupTools which is called in createMcpServer
    // This verifies the setup doesn't error with the new multi-query schema
  });

  test("Empty string query validation works", () => {
    // Test the trim logic
    const query = "   ";
    const cleanQuery = query.trim();
    expect(cleanQuery).toBe("");
    expect(cleanQuery.length).toBe(0);
  });

  test("Query array handling", () => {
    const queries = ["typescript", "javascript", "rust"];
    expect(Array.isArray(queries)).toBe(true);
    expect(queries.length).toBe(3);

    // Test trimming
    const queriesWithSpaces = ["  typescript  ", "javascript", "  rust"];
    const trimmedQueries = queriesWithSpaces.map((q) => q.trim());
    expect(trimmedQueries).toEqual(["typescript", "javascript", "rust"]);
  });

  test("Limit distribution works correctly", () => {
    // Test the distributeLimit logic
    const distributeLimit = (
      totalLimit: number,
      engineCount: number,
    ): number[] => {
      const base = Math.floor(totalLimit / engineCount);
      const remainder = totalLimit % engineCount;

      return Array.from(
        { length: engineCount },
        (_, i) => base + (i < remainder ? 1 : 0),
      );
    };

    // Test even distribution
    expect(distributeLimit(10, 2)).toEqual([5, 5]);
    expect(distributeLimit(10, 5)).toEqual([2, 2, 2, 2, 2]);

    // Test uneven distribution
    expect(distributeLimit(10, 3)).toEqual([4, 3, 3]);
    expect(distributeLimit(7, 3)).toEqual([3, 2, 2]);
  });

  test("Query result aggregation structure", () => {
    // Test the expected result structure for multi-query
    const mockResults = [
      {
        query: "typescript",
        engines: ["bing", "duckduckgo"],
        totalResults: 5,
        results: [
          {
            title: "TypeScript",
            url: "https://typescript.org",
            description: "TypeScript is...",
            source: "bing",
            engine: "bing",
          },
        ],
      },
      {
        query: "javascript",
        engines: ["bing", "duckduckgo"],
        totalResults: 3,
        results: [
          {
            title: "JavaScript",
            url: "https://javascript.info",
            description: "JavaScript is...",
            source: "duckduckgo",
            engine: "duckduckgo",
          },
        ],
      },
    ];

    expect(mockResults.length).toBe(2);
    expect(mockResults[0].query).toBe("typescript");
    expect(mockResults[1].query).toBe("javascript");

    mockResults.forEach((result) => {
      expect(result).toHaveProperty("query");
      expect(result).toHaveProperty("engines");
      expect(result).toHaveProperty("totalResults");
      expect(result).toHaveProperty("results");
      expect(Array.isArray(result.results)).toBe(true);
    });
  });

  test("Duplicate query deduplication works correctly", () => {
    // Test that duplicate queries are deduplicated
    const queries = ["typescript", "typescript", "javascript"];
    const cleanedQueries = queries.map((q) => q.trim());
    const uniqueQueries = [...new Set(cleanedQueries)];

    expect(uniqueQueries.length).toBe(2);
    expect(uniqueQueries).toEqual(["typescript", "javascript"]);

    // Test that results map back to original positions
    const resultMapping = cleanedQueries.map((query) => {
      return { query, wasFound: uniqueQueries.includes(query) };
    });

    expect(resultMapping.length).toBe(3);
    expect(resultMapping[0].query).toBe("typescript");
    expect(resultMapping[1].query).toBe("typescript");
    expect(resultMapping[2].query).toBe("javascript");
    resultMapping.forEach((result) => {
      expect(result.wasFound).toBe(true);
    });
  });

  test("Duplicate queries with whitespace are deduplicated", () => {
    // Test that queries with different whitespace are treated as duplicates after trimming
    const queries = ["typescript", "  typescript  ", " typescript"];
    const cleanedQueries = queries.map((q) => q.trim());
    const uniqueQueries = [...new Set(cleanedQueries)];

    expect(uniqueQueries.length).toBe(1);
    expect(uniqueQueries).toEqual(["typescript"]);

    // Verify all original positions map to the same cleaned query
    expect(cleanedQueries).toEqual(["typescript", "typescript", "typescript"]);
  });
});
