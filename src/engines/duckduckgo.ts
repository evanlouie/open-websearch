import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class DuckDuckGoEngine extends BaseEngine {
    readonly name = 'duckduckgo';
    readonly baseUrl = 'https://duckduckgo.com';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/?q=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        // Wait for results to load (DuckDuckGo uses JavaScript)
        await page.waitForSelector('[data-result="organic"]', { timeout: 10000 });

        // Extract results using page.$$eval
        const results = await page.$$eval('[data-result="organic"]', (elements) => {
            return elements.map(el => {
                const titleEl = el.querySelector('h2');
                const linkEl = el.querySelector('a[href]');
                const descEl = el.querySelector('[data-result="snippet"]');

                // Extract source from URL
                let source = '';
                const href = linkEl?.getAttribute('href') || '';
                try {
                    const url = new URL(href);
                    source = url.hostname;
                } catch {
                    // If URL parsing fails, leave source empty
                }

                return {
                    title: titleEl?.textContent?.trim() || '',
                    url: href,
                    description: descEl?.textContent?.trim() || '',
                    source: source,
                    engine: 'duckduckgo'
                };
            }).filter(result => result.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

// Export singleton instance
export const duckduckgoEngine = new DuckDuckGoEngine();
