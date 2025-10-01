import { describe, test, expect, afterEach } from 'bun:test';
import { duckduckgoEngine, DuckDuckGoEngine } from '../../../engines/duckduckgo.js';
import { browserPool } from '../../../browser/BrowserPool.js';

describe('DuckDuckGoEngine', () => {
    afterEach(async () => {
        // Clean up browser pool between tests
        await browserPool.close();
    });

    describe('Configuration', () => {
        test('has correct name', () => {
            expect(duckduckgoEngine.name).toBe('duckduckgo');
        });

        test('has correct baseUrl', () => {
            expect(duckduckgoEngine.baseUrl).toBe('https://duckduckgo.com');
        });

        test('is a singleton instance', () => {
            expect(duckduckgoEngine).toBeInstanceOf(DuckDuckGoEngine);
        });
    });

    describe('buildSearchUrl', () => {
        test('builds correct search URL', () => {
            const url = (duckduckgoEngine as any).buildSearchUrl('test query');
            expect(url).toBe('https://duckduckgo.com/?q=test%20query');
        });

        test('encodes special characters', () => {
            const url = (duckduckgoEngine as any).buildSearchUrl('privacy & security!');
            expect(url).toContain(encodeURIComponent('privacy & security!'));
            expect(url).not.toContain('&');
            expect(url).not.toContain(' ');
        });

        test('handles empty query', () => {
            const url = (duckduckgoEngine as any).buildSearchUrl('');
            expect(url).toBe('https://duckduckgo.com/?q=');
        });
    });

    describe('search (unit)', () => {
        test('search method exists and returns Promise', () => {
            const result = duckduckgoEngine.search('test', 10);
            expect(result).toBeInstanceOf(Promise);
        });

        test('healthCheck method exists and returns Promise', () => {
            const result = duckduckgoEngine.healthCheck();
            expect(result).toBeInstanceOf(Promise);
        });
    });

    describe('Interface Compliance', () => {
        test('implements all SearchEngine methods', () => {
            expect(typeof duckduckgoEngine.search).toBe('function');
            expect(typeof duckduckgoEngine.healthCheck).toBe('function');
        });

        test('has required properties', () => {
            expect(typeof duckduckgoEngine.name).toBe('string');
            expect(typeof duckduckgoEngine.baseUrl).toBe('string');
        });
    });
});
