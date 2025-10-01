import { describe, test, expect, afterEach } from 'bun:test';
import { bingEngine } from '../../engines/bing.js';
import { duckduckgoEngine } from '../../engines/duckduckgo.js';
import { braveEngine } from '../../engines/brave.js';
import { googleEngine } from '../../engines/google.js';
import { browserPool } from '../../browser/BrowserPool.js';

/**
 * E2E Tests - Real Search Scenarios
 *
 * These tests make actual network requests to search engines.
 * They may be slower and can occasionally fail due to network issues or bot detection.
 */

describe('E2E: Real Search Scenarios', () => {
    afterEach(async () => {
        // Clean up browser pool between tests
        await browserPool.close();
    });

    describe('Bing Search', () => {
        test('search for "typescript" returns relevant results', async () => {
            const results = await bingEngine.search('typescript', 10);

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            expect(results.length).toBeLessThanOrEqual(10);

            // Verify result structure
            const firstResult = results[0];
            expect(firstResult).toHaveProperty('title');
            expect(firstResult).toHaveProperty('url');
            expect(firstResult).toHaveProperty('description');
            expect(firstResult).toHaveProperty('source');
            expect(firstResult).toHaveProperty('engine');
            expect(firstResult.engine).toBe('bing');

            // Verify URLs are valid
            expect(firstResult.url).toMatch(/^https?:\/\//);
        }, { timeout: 30000 });

        test('search respects limit parameter', async () => {
            const results = await bingEngine.search('javascript', 3);

            expect(results.length).toBeGreaterThan(0);
            expect(results.length).toBeLessThanOrEqual(3);
        }, { timeout: 30000 });
    });

    describe('DuckDuckGo Search', () => {
        test('search for "playwright" returns relevant results', async () => {
            const results = await duckduckgoEngine.search('playwright', 10);

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            expect(results.length).toBeLessThanOrEqual(10);

            // Verify result structure
            const firstResult = results[0];
            expect(firstResult.engine).toBe('duckduckgo');
            expect(firstResult.url).toMatch(/^https?:\/\//);
        }, { timeout: 30000 });

        test('healthCheck returns true', async () => {
            const isHealthy = await duckduckgoEngine.healthCheck();
            expect(isHealthy).toBe(true);
        }, { timeout: 15000 });
    });

    describe('Brave Search', () => {
        test('search for "web browser" returns relevant results', async () => {
            const results = await braveEngine.search('web browser', 10);

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
            expect(results.length).toBeGreaterThan(0);
            expect(results.length).toBeLessThanOrEqual(10);

            // Verify result structure
            const firstResult = results[0];
            expect(firstResult.engine).toBe('brave');
            expect(firstResult.url).toMatch(/^https?:\/\//);
        }, { timeout: 30000 });

        test('healthCheck returns true', async () => {
            const isHealthy = await braveEngine.healthCheck();
            expect(isHealthy).toBe(true);
        }, { timeout: 15000 });
    });

    describe('Google Search', () => {
        test.skip('search for "python" returns relevant results or CAPTCHA error - SKIPPED: Google blocks automated requests', async () => {
            try {
                const results = await googleEngine.search('python', 10);

                expect(results).toBeDefined();
                expect(Array.isArray(results)).toBe(true);
                expect(results.length).toBeGreaterThan(0);
                expect(results.length).toBeLessThanOrEqual(10);

                // Verify result structure
                const firstResult = results[0];
                expect(firstResult.engine).toBe('google');
                expect(firstResult.url).toMatch(/^https?:\/\//);
            } catch (error) {
                // CAPTCHA is expected for Google - verify error message
                expect(error).toBeInstanceOf(Error);
                expect((error as Error).message).toContain('CAPTCHA');
            }
        }, { timeout: 30000 });
    });

    describe('Multi-Engine Search', () => {
        test('search across multiple engines returns results', async () => {
            const engines = [bingEngine, duckduckgoEngine, braveEngine];
            const query = 'open source';
            const limit = 5;

            const searchPromises = engines.map(engine => engine.search(query, limit));
            const results = await Promise.all(searchPromises);

            // Verify all engines returned results
            expect(results).toHaveLength(3);

            results.forEach((engineResults, index) => {
                expect(Array.isArray(engineResults)).toBe(true);
                expect(engineResults.length).toBeGreaterThan(0);
                expect(engineResults.length).toBeLessThanOrEqual(limit);
                expect(engineResults[0].engine).toBe(engines[index].name);
            });
        }, { timeout: 60000 });

        test('concurrent searches handle parallel execution', async () => {
            // Execute 3 searches in parallel
            const [results1, results2, results3] = await Promise.all([
                bingEngine.search('nodejs', 5),
                bingEngine.search('deno', 5),
                bingEngine.search('bun', 5)
            ]);

            expect(results1.length).toBeGreaterThan(0);
            expect(results2.length).toBeGreaterThan(0);
            expect(results3.length).toBeGreaterThan(0);
        }, { timeout: 60000 });
    });

    describe('Error Handling', () => {
        test('handles empty query gracefully', async () => {
            // Empty queries should still work (search engine will show default results)
            const results = await bingEngine.search('', 5);

            expect(Array.isArray(results)).toBe(true);
            // May return 0 results or default results depending on engine
        }, { timeout: 30000 });

        test('handles large limit gracefully', async () => {
            // Engines should respect their own limits
            const results = await bingEngine.search('test', 100);

            expect(Array.isArray(results)).toBe(true);
            // May return fewer results than requested
            expect(results.length).toBeLessThanOrEqual(100);
        }, { timeout: 30000 });
    });
});
