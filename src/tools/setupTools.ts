// tools/setupTools.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { bingEngine } from '../engines/bing.js';
import { duckduckgoEngine } from '../engines/duckduckgo.js';
import { braveEngine } from '../engines/brave.js';
import { googleEngine } from '../engines/google.js';

// Engine mapping
const engineMap = {
    bing: bingEngine,
    duckduckgo: duckduckgoEngine,
    brave: braveEngine,
    google: googleEngine,
};

export const setupTools = (server: McpServer): void => {
    // Search tool
    server.tool(
        'search',
        'Search the web using multiple engines (Bing, DuckDuckGo, Brave, Google) with no API key required',
        {
            query: z.string().min(1, "Search query must not be empty"),
            limit: z.number().min(1).max(50).default(10),
            engines: z.array(z.enum(['bing', 'duckduckgo', 'brave', 'google']))
                .min(1)
                .default(['bing'])
        },
        async ({ query, limit = 10, engines = ['bing'] }) => {
            try {
                console.error(`Searching for "${query}" using engines: ${engines.join(', ')}`);

                // Execute searches in parallel
                const searchPromises = engines.map((engineName: keyof typeof engineMap) => {
                    const engine = engineMap[engineName];
                    return engine.search(query, Math.ceil(limit / engines.length))
                        .catch((error: unknown) => {
                            console.error(`Search failed for engine ${engineName}:`, error);
                            return [];
                        });
                });

                const results = await Promise.all(searchPromises);
                const flatResults = results.flat().slice(0, limit);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            query: query.trim(),
                            engines: engines,
                            totalResults: flatResults.length,
                            results: flatResults
                        }, null, 2)
                    }]
                };
            } catch (error) {
                console.error('Search tool execution failed:', error);
                return {
                    content: [{
                        type: 'text',
                        text: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                    isError: true
                };
            }
        }
    );
};
