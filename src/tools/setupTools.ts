// tools/setupTools.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fetchLinuxDoArticle } from '../engines/linuxdo/fetchLinuxDoArticle.js';
import { searchBaidu } from '../engines/baidu/baidu.js';
import { searchBing } from '../engines/bing/bing.js';
import { searchLinuxDo } from "../engines/linuxdo/linuxdo.js";
import { searchCsdn } from "../engines/csdn/csdn.js";
import { fetchCsdnArticle } from "../engines/csdn/fetchCsdnArticle.js";
import { SearchResult } from '../types.js';
import { z } from 'zod';
import {searchDuckDuckGo} from "../engines/duckduckgo/index.js";
import {config} from "../config.js";
import {searchExa} from "../engines/exa/index.js";
import {searchBrave} from "../engines/brave/index.js";
import {fetchGithubReadme} from "../engines/github/index.js";
import { fetchJuejinArticle } from "../engines/juejin/fetchJuejinArticle.js";
import { searchJuejin } from "../engines/juejin/index.js";

// 支持的搜索引擎
const SUPPORTED_ENGINES = ['baidu', 'bing', 'linuxdo', 'csdn', 'duckduckgo','exa','brave','juejin'] as const;
type SupportedEngine = typeof SUPPORTED_ENGINES[number];

// 搜索引擎调用函数映射
const engineMap: Record<SupportedEngine, (query: string, limit: number) => Promise<SearchResult[]>> = {
    baidu: searchBaidu,
    bing: searchBing,
    linuxdo: searchLinuxDo,
    csdn: searchCsdn,
    duckduckgo: searchDuckDuckGo,
    exa: searchExa,
    brave: searchBrave,
    juejin: searchJuejin,
};

// 分配搜索结果数量
const distributeLimit = (totalLimit: number, engineCount: number): number[] => {
    const base = Math.floor(totalLimit / engineCount);
    const remainder = totalLimit % engineCount;

    return Array.from({ length: engineCount }, (_, i) =>
        base + (i < remainder ? 1 : 0)
    );
};

// 执行搜索
const executeSearch = async (query: string, engines: string[], limit: number): Promise<SearchResult[]> => {
    // Clean up the query string to ensure it won't cause issues due to spaces or special characters
    const cleanQuery = query.trim();
    console.error(`[DEBUG] Executing search, query: "${cleanQuery}", engines: ${engines.join(', ')}, limit: ${limit}`);

    if (!cleanQuery) {
        console.error('Query string is empty');
        throw new Error('Query string cannot be empty');

    }

    const limits = distributeLimit(limit, engines.length);

    const searchTasks = engines.map((engine, index) => {
        const engineLimit = limits[index];
        const searchFn = engineMap[engine as SupportedEngine];

        if (!searchFn) {
            console.error(`Unsupported search engine: ${engine}`);
            return Promise.resolve([]);
        }

        return searchFn(query, engineLimit).catch(error => {
            console.error(`Search failed for engine ${engine}:`, error);
            return [];
        });
    });

    try {
        const results = await Promise.all(searchTasks);
        return results.flat().slice(0, limit);
    } catch (error) {
        console.error('Search execution failed:', error);
        throw error;
    }
};

// 验证文章 URL
const validateArticleUrl = (url: string, type: 'linuxdo' | 'csdn' | 'juejin'): boolean => {
    try {
        const urlObj = new URL(url);

        switch (type) {
            case 'linuxdo':
                return urlObj.hostname === 'linux.do' && url.includes('.json');
            case 'csdn':
                return urlObj.hostname === 'blog.csdn.net' && url.includes('/article/details/');
            case 'juejin':
                return urlObj.hostname === 'juejin.cn' && url.includes('/post/');
            default:
                return false;
        }
    } catch {
        return false;
    }
};

// 验证 GitHub URL
const validateGithubUrl = (url: string): boolean => {
    try {

        const isSshGithub = /^git@github\.com:/.test(url);

        if (isSshGithub) {
            // SSH 格式: git@github.com:owner/repo.git
            return /^git@github\.com:[^\/]+\/[^\/]+/.test(url);
        }

        const urlObj = new URL(url);

        // 支持多种 GitHub URL 格式
        const isHttpsGithub = urlObj.hostname === 'github.com' || urlObj.hostname === 'www.github.com';

        if (isHttpsGithub) {
            // 检查路径格式: /owner/repo
            const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
            return pathParts.length >= 2;
        }

        return false;
    } catch {
        return false;
    }
};

export const setupTools = (server: McpServer): void => {
    // 搜索工具
    // 生成搜索工具的动态描述
    const getSearchDescription = () => {
        if (config.allowedSearchEngines.length === 0) {
            return "Search the web using multiple engines (e.g., Baidu, Bing, DuckDuckGo, CSDN, Exa, Brave, Juejin(掘金)) with no API key required";
        } else {
            const enginesText = config.allowedSearchEngines.map(e => {
                switch (e) {
                    case 'juejin':
                        return 'Juejin(掘金)';
                    default:
                        return e.charAt(0).toUpperCase() + e.slice(1);
                }
            }).join(', ');
            return `Search the web using these engines: ${enginesText} (no API key required)`;
        }
    };

    // 生成搜索引擎选项的枚举
    const getEnginesEnum = () => {
        // 如果没有限制，使用所有支持的引擎
        const allowedEngines = config.allowedSearchEngines.length > 0
            ? config.allowedSearchEngines
            : [...SUPPORTED_ENGINES];

        return z.enum(allowedEngines as [string, ...string[]]);
    };

    server.tool(
        'search',
        getSearchDescription(),
        {
            query: z.string().min(1, "Search query must not be empty"),
            limit: z.number().min(1).max(50).default(10),
            engines: z.array(getEnginesEnum()).min(1).default([config.defaultSearchEngine])
                .transform(requestedEngines => {
                    // 如果有配置允许的搜索引擎，过滤请求的引擎
                    if (config.allowedSearchEngines.length > 0) {
                        const filteredEngines = requestedEngines.filter(engine =>
                            config.allowedSearchEngines.includes(engine));

                        // 如果所有请求的引擎都被过滤掉，使用默认引擎
                        return filteredEngines.length > 0 ?
                            filteredEngines :
                            [config.defaultSearchEngine];
                    }
                    return requestedEngines;
                })
        },
        async ({query, limit = 10, engines = ['bing']}) => {
            try {
                console.error(`Searching for "${query}" using engines: ${engines.join(', ')}`);

                const results = await executeSearch(query.trim(), engines, limit);

                return {
                    content: [{
                        type: 'text',
                        text: JSON.stringify({
                            query: query.trim(),
                            engines: engines,
                            totalResults: results.length,
                            results: results
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

    // 获取 Linux.do 文章工具
    server.tool(
        'fetchLinuxDoArticle',
        "Fetch full article content from a linux.do post URL",
        {
            url: z.string().url().refine(
                (url) => validateArticleUrl(url, 'linuxdo'),
                "URL must be from linux.do and end with .json"
            )
        },
        async ({url}) => {
            try {
                console.error(`Fetching Linux.do article: ${url}`);
                const result = await fetchLinuxDoArticle(url);

                return {
                    content: [{
                        type: 'text',
                        text: result.content
                    }]
                };
            } catch (error) {
                console.error('Failed to fetch Linux.do article:', error);
                return {
                    content: [{
                        type: 'text',
                        text: `Failed to fetch article: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                    isError: true
                };
            }
        }
    );

    // 获取 CSDN 文章工具
    server.tool(
        'fetchCsdnArticle',
        "Fetch full article content from a csdn post URL",
        {
            url: z.string().url().refine(
                (url) => validateArticleUrl(url, 'csdn'),
                "URL must be from blog.csdn.net contains /article/details/ path"
            )
        },
        async ({url}) => {
            try {
                console.error(`Fetching CSDN article: ${url}`);
                const result = await fetchCsdnArticle(url);

                return {
                    content: [{
                        type: 'text',
                        text: result.content
                    }]
                };
            } catch (error) {
                console.error('Failed to fetch CSDN article:', error);
                return {
                    content: [{
                        type: 'text',
                        text: `Failed to fetch article: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                    isError: true
                };
            }
        }
    );

    // 获取 GitHub README 工具
    server.tool(
        'fetchGithubReadme',
        "Fetch README content from a GitHub repository URL",
        {
            url: z.string().min(1).refine(
                (url) => validateGithubUrl(url),
                "URL must be a valid GitHub repository URL (supports HTTPS, SSH formats)"
            )
        },
        async ({url}) => {
            try {
                console.error(`Fetching GitHub README: ${url}`);
                const result = await fetchGithubReadme(url);

                if (result) {
                    return {
                        content: [{
                            type: 'text',
                            text: result
                        }]
                    };
                } else {
                    return {
                        content: [{
                            type: 'text',
                            text: 'README not found or repository does not exist'
                        }],
                        isError: true
                    };
                }
            } catch (error) {
                console.error('Failed to fetch GitHub README:', error);
                return {
                    content: [{
                        type: 'text',
                        text: `Failed to fetch README: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                    isError: true
                };
            }
        }
    );

    // 获取掘金文章工具
    server.tool(
        'fetchJuejinArticle',
        "Fetch full article content from a Juejin(掘金) post URL",
        {
            url: z.string().url().refine(
                (url) => validateArticleUrl(url, 'juejin'),
                "URL must be from juejin.cn and contain /post/ path"
            )
        },
        async ({url}) => {
            try {
                console.error(`Fetching Juejin article: ${url}`);
                const result = await fetchJuejinArticle(url);

                return {
                    content: [{
                        type: 'text',
                        text: result.content
                    }]
                };
            } catch (error) {
                console.error('Failed to fetch Juejin article:', error);
                return {
                    content: [{
                        type: 'text',
                        text: `Failed to fetch article: ${error instanceof Error ? error.message : 'Unknown error'}`
                    }],
                    isError: true
                };
            }
        }
    );
};

