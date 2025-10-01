import { describe, test, expect, afterEach } from "bun:test";
import { bingEngine } from "../../engines/bing.js";
import { duckduckgoEngine } from "../../engines/duckduckgo.js";
import { browserPool } from "../../browser/BrowserPool.js";
import { BrowserPool } from "../../browser/BrowserPool.js";

/**
 * Performance Benchmarks
 *
 * These tests establish performance baselines and ensure the system
 * meets performance requirements specified in the PRD.
 */

describe("Performance Benchmarks", () => {
  afterEach(async () => {
    // Clean up browser pool between tests
    await browserPool.close();
  });

  describe("Cold Start Performance", () => {
    test(
      "cold start search completes within 4 seconds",
      async () => {
        const startTime = Date.now();

        // First search will initialize the browser
        const results = await bingEngine.search("test", 5);

        const duration = Date.now() - startTime;

        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(4000); // 4 seconds

        console.error(`Cold start time: ${duration}ms`);
      },
      { timeout: 10000 },
    );
  });

  describe("Warm Search Performance", () => {
    test(
      "warm search completes within 2 seconds",
      async () => {
        // Warm up the browser with first search
        await bingEngine.search("warmup", 5);

        // Measure second search (warm)
        const startTime = Date.now();
        const results = await bingEngine.search("test", 5);
        const duration = Date.now() - startTime;

        expect(results).toBeDefined();
        expect(results.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(2000); // 2 seconds

        console.error(`Warm search time: ${duration}ms`);
      },
      { timeout: 15000 },
    );

    test(
      "average of 10 warm searches under 2 seconds",
      async () => {
        // Warm up
        await bingEngine.search("warmup", 5);

        // Run 10 searches and measure average time
        const durations: number[] = [];

        for (let i = 0; i < 10; i++) {
          const startTime = Date.now();
          await bingEngine.search(`test ${i}`, 5);
          const duration = Date.now() - startTime;
          durations.push(duration);
        }

        const averageDuration =
          durations.reduce((a, b) => a + b, 0) / durations.length;

        expect(averageDuration).toBeLessThan(2000); // 2 seconds average

        console.error(
          `Average warm search time: ${averageDuration.toFixed(0)}ms`,
        );
        console.error(
          `Min: ${Math.min(...durations)}ms, Max: ${Math.max(...durations)}ms`,
        );
      },
      { timeout: 60000 },
    );
  });

  describe("Concurrent Search Performance", () => {
    test(
      "handles 5 simultaneous searches",
      async () => {
        const startTime = Date.now();

        // Execute 5 searches in parallel
        const searchPromises = Array.from({ length: 5 }, (_, i) =>
          bingEngine.search(`concurrent test ${i}`, 5),
        );

        const results = await Promise.all(searchPromises);
        const duration = Date.now() - startTime;

        // All searches should succeed
        expect(results).toHaveLength(5);
        results.forEach((result) => {
          expect(result.length).toBeGreaterThan(0);
        });

        // Concurrent searches should not take much longer than a single search
        // Allow up to 15 seconds for 5 concurrent searches
        expect(duration).toBeLessThan(15000);

        console.error(`5 concurrent searches completed in: ${duration}ms`);
      },
      { timeout: 30000 },
    );

    test(
      "pool mode handles concurrent searches efficiently",
      async () => {
        const pool = new BrowserPool({
          mode: "pool",
          poolSize: 3,
          headless: true,
        });

        try {
          const startTime = Date.now();

          // Execute 6 searches (more than pool size)
          const searchPromises = Array.from({ length: 6 }, async (_, i) => {
            const page = await pool.getPage();
            try {
              await page.goto("https://www.bing.com");
              return true;
            } finally {
              await pool.releasePage(page);
            }
          });

          const results = await Promise.all(searchPromises);
          const duration = Date.now() - startTime;

          expect(results).toHaveLength(6);
          expect(results.every((r) => r === true)).toBe(true);

          console.error(`Pool mode 6 concurrent operations: ${duration}ms`);
        } finally {
          await pool.close();
        }
      },
      { timeout: 30000 },
    );
  });

  describe("Engine Comparison", () => {
    test(
      "compare performance across engines",
      async () => {
        const engines = [
          { name: "bing", engine: bingEngine },
          { name: "duckduckgo", engine: duckduckgoEngine },
        ];

        const results: Record<string, number> = {};

        for (const { name, engine } of engines) {
          const startTime = Date.now();
          await engine.search("performance test", 5);
          const duration = Date.now() - startTime;
          results[name] = duration;
        }

        console.error("Engine performance comparison:");
        Object.entries(results).forEach(([name, duration]) => {
          console.error(`  ${name}: ${duration}ms`);
        });

        // All engines should complete within reasonable time
        Object.values(results).forEach((duration) => {
          expect(duration).toBeLessThan(5000);
        });
      },
      { timeout: 30000 },
    );
  });
});
