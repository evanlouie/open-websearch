import { describe, test, expect } from 'bun:test';
import { createMcpServer } from '../../server.js';
import { bingEngine } from '../../engines/bing.js';
import { duckduckgoEngine } from '../../engines/duckduckgo.js';
import { braveEngine } from '../../engines/brave.js';
import { googleEngine } from '../../engines/google.js';

describe('MCP Server Integration', () => {
    test('server initializes successfully', () => {
        const server = createMcpServer();
        expect(server).toBeDefined();
        // Server is an MCP instance, name/version not exposed as properties
    });

    test('all search engines are exported', () => {
        expect(bingEngine).toBeDefined();
        expect(bingEngine.name).toBe('bing');

        expect(duckduckgoEngine).toBeDefined();
        expect(duckduckgoEngine.name).toBe('duckduckgo');

        expect(braveEngine).toBeDefined();
        expect(braveEngine.name).toBe('brave');

        expect(googleEngine).toBeDefined();
        expect(googleEngine.name).toBe('google');
    });

    test('engines implement SearchEngine interface', () => {
        // Check that all engines have required methods
        expect(typeof bingEngine.search).toBe('function');
        expect(typeof bingEngine.healthCheck).toBe('function');

        expect(typeof duckduckgoEngine.search).toBe('function');
        expect(typeof duckduckgoEngine.healthCheck).toBe('function');

        expect(typeof braveEngine.search).toBe('function');
        expect(typeof braveEngine.healthCheck).toBe('function');

        expect(typeof googleEngine.search).toBe('function');
        expect(typeof googleEngine.healthCheck).toBe('function');
    });

    test('engine base URLs are correct', () => {
        expect(bingEngine.baseUrl).toBe('https://www.bing.com');
        expect(duckduckgoEngine.baseUrl).toBe('https://duckduckgo.com');
        expect(braveEngine.baseUrl).toBe('https://search.brave.com');
        expect(googleEngine.baseUrl).toBe('https://www.google.com');
    });
});
