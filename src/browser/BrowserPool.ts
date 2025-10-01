import { Browser, Page, chromium } from "playwright";
import { BrowserPoolConfig } from "../types.js";
import { getStealthArgs } from "./stealth.js";

type PoolWaiter = {
  resolve: (page: Page) => void;
  reject: (error: unknown) => void;
};

export class BrowserPool {
  private browser: Browser | null = null;
  private pagePool: Page[] = [];
  private config: BrowserPoolConfig;
  private sharedPage: Page | null = null;
  private sharedInUse = false;
  private sharedWaitQueue: Array<{
    resolve: (page: Page) => void;
    reject: (error: unknown) => void;
  }> = [];
  private poolWaitQueue: PoolWaiter[] = [];
  private activePooledPages = 0;

  constructor(config?: Partial<BrowserPoolConfig>) {
    this.config = {
      mode: config?.mode || "pool",
      poolSize: Math.max(1, config?.poolSize || 5),
      timeout: config?.timeout || 30000,
      headless: config?.headless ?? true,
    };
  }

  /**
   * Initialize browser instance
   */
  private async initBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        args: getStealthArgs(),
      });

      // Handle unexpected browser crashes
      this.browser.on("disconnected", () => {
        console.error(
          "⚠️ Browser disconnected unexpectedly — resetting pool state",
        );

        const disconnectError = new Error("Browser disconnected");

        for (const waiter of this.poolWaitQueue.splice(0)) {
          waiter.reject(disconnectError);
        }

        for (const waiter of this.sharedWaitQueue.splice(0)) {
          waiter.reject(disconnectError);
        }

        this.browser = null;
        this.pagePool = [];
        this.activePooledPages = 0;
        this.sharedPage = null;
        this.sharedInUse = false;
        this.poolWaitQueue = [];
        this.sharedWaitQueue = [];
      });
    }

    return this.browser;
  }

  private applyPageDefaults(page: Page): void {
    try {
      page.setDefaultTimeout(this.config.timeout || 30000);
      page.setDefaultNavigationTimeout(this.config.timeout || 30000);
    } catch (error) {
      console.error("⚠️ Failed to apply default timeouts to page", error);
    }
  }

  private async createConfiguredPage(): Promise<Page> {
    const browser = await this.initBrowser();
    const page = await browser.newPage();
    this.applyPageDefaults(page);
    return page;
  }

  /**
   * Get a page based on configured mode
   */
  async getPage(): Promise<Page> {
    switch (this.config.mode) {
      case "shared":
        return this.getSharedPage();
      case "pool":
        return this.getPooledPage();
      case "per-search":
        return this.getNewPage();
      default:
        return this.getSharedPage();
    }
  }

  /**
   * Shared mode: Single page reused for all searches
   */
  private async getSharedPage(): Promise<Page> {
    if (!this.sharedInUse) {
      this.sharedInUse = true;
      try {
        if (!this.sharedPage || this.sharedPage.isClosed()) {
          this.sharedPage = await this.createConfiguredPage();
        }

        this.applyPageDefaults(this.sharedPage);
        return this.sharedPage;
      } catch (error) {
        this.sharedInUse = false;
        const pending = this.sharedWaitQueue.splice(0);
        for (const waiter of pending) {
          waiter.reject(error);
        }
        throw error;
      }
    }

    return await new Promise<Page>((resolve, reject) => {
      this.sharedWaitQueue.push({ resolve, reject });
    });
  }

  /**
   * Pool mode: Maintain pool of pages, reuse from pool
   */
  private async getPooledPage(): Promise<Page> {
    if (this.pagePool.length > 0) {
      const page = this.pagePool.pop()!;
      if (page.isClosed()) {
        this.activePooledPages = Math.max(0, this.activePooledPages - 1);
        return this.getPooledPage();
      }
      this.applyPageDefaults(page);
      return page;
    }

    if (this.activePooledPages < (this.config.poolSize || 5)) {
      this.activePooledPages += 1;
      try {
        const page = await this.createConfiguredPage();
        return page;
      } catch (error) {
        this.activePooledPages -= 1;
        throw error;
      }
    }

    return await new Promise<Page>((resolve, reject) => {
      this.poolWaitQueue.push({ resolve, reject });
    });
  }

  /**
   * Per-search mode: New page for every search
   */
  private async getNewPage(): Promise<Page> {
    const page = await this.createConfiguredPage();
    return page;
  }

  /**
   * Release page back to pool or close it
   */
  async releasePage(page: Page): Promise<void> {
    switch (this.config.mode) {
      case "shared":
        await this.resetPage(page);

        const nextSharedWaiter = this.sharedWaitQueue.shift();
        if (nextSharedWaiter) {
          try {
            if (!this.sharedPage || this.sharedPage.isClosed()) {
              this.sharedPage = await this.createConfiguredPage();
            }
            this.applyPageDefaults(this.sharedPage);
            this.sharedInUse = true;
            nextSharedWaiter.resolve(this.sharedPage);
          } catch (error) {
            this.sharedInUse = false;
            nextSharedWaiter.reject(error);
            const remaining = this.sharedWaitQueue.splice(0);
            for (const waiter of remaining) {
              waiter.reject(error);
            }
            throw error;
          }
        } else {
          this.sharedInUse = false;
          if (page.isClosed()) {
            this.sharedPage = null;
          }
        }
        break;

      case "pool":
        await this.resetPage(page);

        if (page.isClosed()) {
          this.activePooledPages = Math.max(0, this.activePooledPages - 1);
        }

        const waiter = this.poolWaitQueue.shift();
        if (waiter) {
          if (!page.isClosed()) {
            waiter.resolve(page);
            return;
          }

          try {
            const replacement = await this.createConfiguredPage();
            this.activePooledPages += 1;
            waiter.resolve(replacement);
          } catch (error) {
            waiter.reject(error);
            const remainingWaiters = this.poolWaitQueue.splice(0);
            for (const pending of remainingWaiters) {
              pending.reject(error);
            }
            throw error;
          }
          return;
        }

        if (!page.isClosed()) {
          if (this.pagePool.length < (this.config.poolSize || 5)) {
            this.pagePool.push(page);
          } else {
            await page.close().catch(() => {});
            this.activePooledPages = Math.max(0, this.activePooledPages - 1);
          }
        }
        break;

      case "per-search":
        // Always close
        await page.close().catch(() => {});
        break;
    }
  }

  private async resetPage(page: Page): Promise<void> {
    if (page.isClosed()) {
      return;
    }

    try {
      await page.context().clearCookies();
    } catch (error) {
      console.error("⚠️ Failed to clear cookies for page", error);
      try {
        await page.close();
      } catch {
        // ignore secondary failures
      }
    }
  }

  /**
   * Cleanup all resources
   */
  async close(): Promise<void> {
    // Close all pages
    for (const waiter of this.poolWaitQueue.splice(0)) {
      waiter.reject(new Error("Browser pool shut down"));
    }

    for (const waiter of this.sharedWaitQueue.splice(0)) {
      waiter.reject(new Error("Browser pool shut down"));
    }

    for (const page of this.pagePool) {
      await page.close().catch(() => {});
    }
    this.pagePool = [];
    this.sharedPage = null;
    this.sharedInUse = false;
    this.activePooledPages = 0;
    this.poolWaitQueue = [];
    this.sharedWaitQueue = [];

    // Close browser with timeout to prevent hanging
    if (this.browser) {
      const closePromise = this.browser.close().catch(() => {});
      const timeoutPromise = new Promise<void>((resolve) =>
        setTimeout(resolve, 5000),
      );
      await Promise.race([closePromise, timeoutPromise]);
      this.browser = null;
    }
  }

  getNavigationTimeout(): number {
    return this.config.timeout || 30000;
  }
}

// Export singleton instance
export const browserPool = new BrowserPool({ mode: "pool" });
