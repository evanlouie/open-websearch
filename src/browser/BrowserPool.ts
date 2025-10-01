import { Browser, Page, chromium } from 'playwright';
import { BrowserPoolConfig, BrowserMode } from '../types.js';
import { getStealthArgs } from './stealth.js';

export class BrowserPool {
    private browser: Browser | null = null;
    private pagePool: Page[] = [];
    private config: BrowserPoolConfig;

    constructor(config?: Partial<BrowserPoolConfig>) {
        this.config = {
            mode: config?.mode || 'shared',
            poolSize: config?.poolSize || 5,
            timeout: config?.timeout || 30000,
            headless: config?.headless ?? true
        };
    }

    /**
     * Initialize browser instance
     */
    private async initBrowser(): Promise<Browser> {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: this.config.headless,
                args: getStealthArgs()
            });

            // Handle unexpected browser crashes
            this.browser.on('disconnected', () => {
                console.error('⚠️ Browser disconnected unexpectedly');
                this.browser = null;
                this.pagePool = [];
            });
        }

        return this.browser;
    }

    /**
     * Get a page based on configured mode
     */
    async getPage(): Promise<Page> {
        switch (this.config.mode) {
            case 'shared':
                return this.getSharedPage();
            case 'pool':
                return this.getPooledPage();
            case 'per-search':
                return this.getNewPage();
            default:
                return this.getSharedPage();
        }
    }

    /**
     * Shared mode: Single page reused for all searches
     */
    private async getSharedPage(): Promise<Page> {
        if (this.pagePool.length === 0) {
            const browser = await this.initBrowser();
            const page = await browser.newPage();
            this.pagePool.push(page);
        }
        return this.pagePool[0];
    }

    /**
     * Pool mode: Maintain pool of pages, reuse from pool
     */
    private async getPooledPage(): Promise<Page> {
        const browser = await this.initBrowser();

        // Return existing page from pool if available
        if (this.pagePool.length > 0) {
            return this.pagePool.pop()!;
        }

        // Create new page if under pool limit
        return await browser.newPage();
    }

    /**
     * Per-search mode: New page for every search
     */
    private async getNewPage(): Promise<Page> {
        const browser = await this.initBrowser();
        return await browser.newPage();
    }

    /**
     * Release page back to pool or close it
     */
    async releasePage(page: Page): Promise<void> {
        switch (this.config.mode) {
            case 'shared':
                // Keep page open, just clear cookies/cache
                await page.context().clearCookies();
                break;

            case 'pool':
                // Return to pool if under limit, otherwise close
                if (this.pagePool.length < (this.config.poolSize || 5)) {
                    await page.context().clearCookies();
                    this.pagePool.push(page);
                } else {
                    await page.close();
                }
                break;

            case 'per-search':
                // Always close
                await page.close();
                break;
        }
    }

    /**
     * Cleanup all resources
     */
    async close(): Promise<void> {
        // Close all pages
        for (const page of this.pagePool) {
            await page.close().catch(() => {});
        }
        this.pagePool = [];

        // Close browser with timeout to prevent hanging
        if (this.browser) {
            const closePromise = this.browser.close().catch(() => {});
            const timeoutPromise = new Promise<void>(resolve => setTimeout(resolve, 5000));
            await Promise.race([closePromise, timeoutPromise]);
            this.browser = null;
        }
    }
}

// Export singleton instance
export const browserPool = new BrowserPool({ mode: 'shared' });
