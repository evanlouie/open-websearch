export interface SearchResult {
    title: string;
    url: string;
    description: string;
    source: string;        // Domain name or source identifier
    engine: string;        // Engine that produced this result

    // Optional enhanced metadata
    publishDate?: string;  // ISO 8601 format
    author?: string;       // If available
    language?: string;     // Language code (en, zh, etc.)
}

export interface SearchEngine {
    readonly name: string;
    readonly baseUrl: string;

    /**
     * Execute search query and return results
     * @param query Search query string
     * @param limit Maximum number of results to return
     * @returns Array of search results
     * @throws Error if search fails
     */
    search(query: string, limit: number): Promise<SearchResult[]>;

    /**
     * Health check - verify engine is accessible
     * @returns true if engine is responding
     */
    healthCheck(): Promise<boolean>;
}

export type BrowserMode = 'shared' | 'pool' | 'per-search';

export interface BrowserPoolConfig {
    mode: BrowserMode;
    poolSize?: number;      // Only used in 'pool' mode
    timeout?: number;       // Page navigation timeout (ms)
    headless?: boolean;     // Run headless (default: true)
}
