import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { Page } from "playwright";
import { BaseEngine } from "../../../engines/BaseEngine.js";
import { SearchResult } from "../../../types.js";
import { browserPool } from "../../../browser/BrowserPool.js";

// Mock implementation for testing
class MockEngine extends BaseEngine {
  readonly name = "mock";
  readonly baseUrl = "https://mock.example.com";

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
  }

  protected async extractResults(
    page: Page,
    limit: number,
  ): Promise<SearchResult[]> {
    // Mock extraction - returns dummy results
    return [
      {
        title: "Mock Result 1",
        url: "https://example.com/1",
        description: "First mock result",
        source: "example.com",
        engine: "mock",
      },
      {
        title: "Mock Result 2",
        url: "https://example.com/2",
        description: "Second mock result",
        source: "example.com",
        engine: "mock",
      },
    ].slice(0, limit);
  }
}

describe("BaseEngine", () => {
  let mockEngine: MockEngine;

  beforeEach(() => {
    mockEngine = new MockEngine();
  });

  afterEach(async () => {
    // Ensure browser pool is cleaned up between tests
    await browserPool.close();
  });

  describe("Abstract Properties", () => {
    test("has name property", () => {
      expect(mockEngine.name).toBe("mock");
    });

    test("has baseUrl property", () => {
      expect(mockEngine.baseUrl).toBe("https://mock.example.com");
    });
  });

  describe("buildSearchUrl", () => {
    test("builds search URL with encoded query", () => {
      const url = (mockEngine as any).buildSearchUrl("test query");
      expect(url).toBe("https://mock.example.com/search?q=test%20query");
    });

    test("encodes special characters in query", () => {
      const url = (mockEngine as any).buildSearchUrl("test & query!");
      expect(url).toContain(encodeURIComponent("test & query!"));
    });
  });

  describe("search", () => {
    test.skip(
      "executes search and returns results - SKIPPED: requires real browser",
      async () => {
        const results = await mockEngine.search("test", 10);

        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(10);
      },
      { timeout: 20000 },
    );

    test.skip(
      "respects limit parameter - SKIPPED: requires real browser",
      async () => {
        const results = await mockEngine.search("test", 1);

        expect(results.length).toBe(1);
        expect(results[0].title).toBe("Mock Result 1");
      },
      { timeout: 20000 },
    );

    test.skip(
      "releases page after search - SKIPPED: requires real browser",
      async () => {
        // This is implicitly tested by the fact that subsequent searches work
        // The page must be released properly for the pool to function
        const results1 = await mockEngine.search("test1", 5);
        const results2 = await mockEngine.search("test2", 5);

        expect(results1).toBeDefined();
        expect(results2).toBeDefined();
      },
      { timeout: 20000 },
    );
  });

  describe("healthCheck", () => {
    test.skip(
      "returns true when engine is accessible - SKIPPED: requires real browser",
      async () => {
        const isHealthy = await mockEngine.healthCheck();

        // Mock engine should fail health check since it's not a real URL
        expect(typeof isHealthy).toBe("boolean");
      },
      { timeout: 10000 },
    );

    test.skip(
      "returns false on timeout - SKIPPED: requires real browser",
      async () => {
        // Create engine with non-existent URL
        class BadEngine extends BaseEngine {
          readonly name = "bad";
          readonly baseUrl = "https://definitely-does-not-exist-12345.com";

          protected buildSearchUrl(query: string): string {
            return `${this.baseUrl}/search?q=${query}`;
          }

          protected async extractResults(
            page: Page,
            limit: number,
          ): Promise<SearchResult[]> {
            return [];
          }
        }

        const badEngine = new BadEngine();
        const isHealthy = await badEngine.healthCheck();

        expect(isHealthy).toBe(false);
      },
      { timeout: 10000 },
    );
  });

  describe("Interface Compliance", () => {
    test("implements SearchEngine interface", () => {
      expect(typeof mockEngine.search).toBe("function");
      expect(typeof mockEngine.healthCheck).toBe("function");
      expect(typeof mockEngine.name).toBe("string");
      expect(typeof mockEngine.baseUrl).toBe("string");
    });

    test("search returns Promise<SearchResult[]>", () => {
      const result = mockEngine.search("test", 10);
      expect(result).toBeInstanceOf(Promise);
    });

    test("healthCheck returns Promise<boolean>", () => {
      const result = mockEngine.healthCheck();
      expect(result).toBeInstanceOf(Promise);
    });
  });
});
