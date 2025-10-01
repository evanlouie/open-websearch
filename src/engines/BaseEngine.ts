import { Page } from 'playwright';
import { browserPool } from '../browser/BrowserPool.js';
import { SearchEngine, SearchResult } from '../types.js';
import { applyStealthConfig } from '../browser/stealth.js';

export abstract class BaseEngine implements SearchEngine {
    abstract readonly name: string;
    abstract readonly baseUrl: string;

    /**
     * Build search URL for this engine
     * @param query Search query
     * @returns Full search URL
     */
    protected abstract buildSearchUrl(query: string): string;

    /**
     * Extract search results from page
     * @param page Playwright page instance
     * @param limit Maximum results to extract
     * @returns Array of search results
     */
    protected abstract extractResults(page: Page, limit: number): Promise<SearchResult[]>;

    /**
     * Execute search (template method)
     */
    async search(query: string, limit: number): Promise<SearchResult[]> {
        const page = await browserPool.getPage();

        try {
            // Apply stealth configuration to the page
            await applyStealthConfig(page);

            const searchUrl = this.buildSearchUrl(query);
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded' });

            return await this.extractResults(page, limit);
        } finally {
            await browserPool.releasePage(page);
        }
    }

    /**
     * Health check implementation
     */
    async healthCheck(): Promise<boolean> {
        const page = await browserPool.getPage();
        try {
            const response = await page.goto(this.baseUrl, { timeout: 5000 });
            return response?.ok() ?? false;
        } catch {
            return false;
        } finally {
            await browserPool.releasePage(page);
        }
    }
}
