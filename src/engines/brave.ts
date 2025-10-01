import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class BraveEngine extends BaseEngine {
    readonly name = 'brave';
    readonly baseUrl = 'https://search.brave.com';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        // Wait for results to load
        await page.waitForSelector('[data-type="web"]', { timeout: 10000 });

        // Extract results using page.$$eval
        const results = await page.$$eval('[data-type="web"]', (elements) => {
            return elements.map(el => {
                const titleEl = el.querySelector('.snippet-title');
                const linkEl = el.querySelector('.result-header');
                const descEl = el.querySelector('.snippet-description');
                const sourceEl = el.querySelector('.netloc');

                return {
                    title: titleEl?.textContent?.trim() || '',
                    url: linkEl?.getAttribute('href') || '',
                    description: descEl?.textContent?.trim() || '',
                    source: sourceEl?.textContent?.trim() || '',
                    engine: 'brave'
                };
            }).filter(result => result.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

// Export singleton instance
export const braveEngine = new BraveEngine();
