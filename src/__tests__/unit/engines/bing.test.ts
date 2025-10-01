import { describe, test, expect, afterEach } from 'bun:test';
import { bingEngine, BingEngine } from '../../../engines/bing.js';
import { browserPool } from '../../../browser/BrowserPool.js';

describe('BingEngine', () => {
    afterEach(async () => {
        // Clean up browser pool between tests
        await browserPool.close();
    });

    describe('Configuration', () => {
        test('has correct name', () => {
            expect(bingEngine.name).toBe('bing');
        });

        test('has correct baseUrl', () => {
            expect(bingEngine.baseUrl).toBe('https://www.bing.com');
        });

        test('is a singleton instance', () => {
            expect(bingEngine).toBeInstanceOf(BingEngine);
        });
    });

    describe('buildSearchUrl', () => {
        test('builds correct search URL', () => {
            const url = (bingEngine as any).buildSearchUrl('test query');
            expect(url).toBe('https://www.bing.com/search?q=test%20query');
        });

        test('encodes special characters', () => {
            const url = (bingEngine as any).buildSearchUrl('test & query with spaces!');
            expect(url).toContain(encodeURIComponent('test & query with spaces!'));
            expect(url).not.toContain('&');
            expect(url).not.toContain(' ');
        });

        test('handles empty query', () => {
            const url = (bingEngine as any).buildSearchUrl('');
            expect(url).toBe('https://www.bing.com/search?q=');
        });
    });

    describe('search (unit)', () => {
        test('search method exists and returns Promise', () => {
            const result = bingEngine.search('test', 10);
            expect(result).toBeInstanceOf(Promise);
        });

        test('healthCheck method exists and returns Promise', () => {
            const result = bingEngine.healthCheck();
            expect(result).toBeInstanceOf(Promise);
        });
    });

    describe('Interface Compliance', () => {
        test('implements all SearchEngine methods', () => {
            expect(typeof bingEngine.search).toBe('function');
            expect(typeof bingEngine.healthCheck).toBe('function');
        });

        test('has required properties', () => {
            expect(typeof bingEngine.name).toBe('string');
            expect(typeof bingEngine.baseUrl).toBe('string');
        });
    });
});
