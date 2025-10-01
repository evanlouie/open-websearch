import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Browser, Page } from "playwright";
import { BrowserPool } from "../../../browser/BrowserPool.js";

describe("BrowserPool", () => {
  let browserPool: BrowserPool;

  beforeEach(() => {
    browserPool = new BrowserPool({ mode: "shared", headless: true });
  });

  afterEach(async () => {
    await browserPool.close();
  });

  describe("Initialization", () => {
    test("initializes browser on first getPage() call", async () => {
      const page = await browserPool.getPage();
      expect(page).toBeDefined();
      expect(page.url()).toBeDefined();
      await browserPool.releasePage(page);
    });

    test("browser instance is reused across multiple getPage() calls in shared mode", async () => {
      const page1 = await browserPool.getPage();
      await browserPool.releasePage(page1);

      const page2 = await browserPool.getPage();
      await browserPool.releasePage(page2);

      // In shared mode, the same page instance should be reused
      expect(page1).toBe(page2);
    });
  });

  describe("Shared Mode", () => {
    test("returns same page after release", async () => {
      const pool = new BrowserPool({ mode: "shared", headless: true });

      const page1 = await pool.getPage();
      await pool.releasePage(page1);

      const page2 = await pool.getPage();

      // In shared mode, subsequent borrowers receive the same page instance
      expect(page1).toBe(page2);

      await pool.releasePage(page2);
      await pool.close();
    });

    test("clears cookies when releasing page", async () => {
      const pool = new BrowserPool({ mode: "shared", headless: true });

      const page = await pool.getPage();

      // Set a cookie
      await page.context().addCookies([
        {
          name: "test",
          value: "value",
          url: "https://example.com",
        },
      ]);

      const cookiesBefore = await page.context().cookies("https://example.com");
      expect(cookiesBefore.length).toBeGreaterThan(0);

      // Release page (should clear cookies)
      await pool.releasePage(page);

      const page2 = await pool.getPage();
      const cookiesAfter = await page2.context().cookies("https://example.com");
      expect(cookiesAfter.length).toBe(0);

      await pool.releasePage(page2);
      await pool.close();
    });

    test(
      "resets lock when page creation fails",
      async () => {
        const pool = new BrowserPool({ mode: "shared", headless: true });
        const originalCreate = (pool as any).createConfiguredPage.bind(pool);
        let attempts = 0;

        (pool as any).createConfiguredPage = async () => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error("Test page creation failure");
          }
          return originalCreate();
        };

        try {
          await expect(pool.getPage()).rejects.toThrow(
            "Test page creation failure",
          );

          const page = await pool.getPage();
          expect(page).toBeDefined();
          await pool.releasePage(page);
        } finally {
          (pool as any).createConfiguredPage = originalCreate;
          await pool.close();
        }
      },
      { timeout: 15000 },
    );
  });

  describe("Pool Mode", () => {
    test(
      "maintains pool of pages up to poolSize",
      async () => {
        const pool = new BrowserPool({
          mode: "pool",
          poolSize: 3,
          headless: true,
        });

        const pages: Page[] = [];

        // Get 3 pages
        for (let i = 0; i < 3; i++) {
          pages.push(await pool.getPage());
        }

        // All pages should be different
        expect(pages[0]).not.toBe(pages[1]);
        expect(pages[1]).not.toBe(pages[2]);

        // Release all pages
        for (const page of pages) {
          await pool.releasePage(page);
        }

        await pool.close();
      },
      { timeout: 15000 },
    );

    test(
      "enforces pool size limit and queues excess requests",
      async () => {
        const pool = new BrowserPool({
          mode: "pool",
          poolSize: 2,
          headless: true,
        });

        try {
          // Get 2 pages (fills the pool to capacity)
          const page1 = await pool.getPage();
          const page2 = await pool.getPage();

          // Try to get a third page - this should block until a page is released
          let page3Resolved = false;
          const page3Promise = pool.getPage().then((page) => {
            page3Resolved = true;
            return page;
          });

          // Give it a moment to ensure page3 is waiting
          await new Promise((resolve) => setTimeout(resolve, 100));
          expect(page3Resolved).toBe(false);

          // Release page1 - this should unblock page3
          await pool.releasePage(page1);

          // page3 should now resolve
          const page3 = await page3Promise;
          expect(page3Resolved).toBe(true);
          expect(page3).toBeDefined();

          // Clean up
          await pool.releasePage(page2);
          await pool.releasePage(page3);
        } finally {
          await pool.close();
        }
      },
      { timeout: 15000 },
    );
  });

  describe("Per-Search Mode", () => {
    test("creates new page for every getPage() call", async () => {
      const pool = new BrowserPool({ mode: "per-search", headless: true });

      const page1 = await pool.getPage();
      const page2 = await pool.getPage();

      // In per-search mode, pages should be different
      expect(page1).not.toBe(page2);

      await pool.releasePage(page1);
      await pool.releasePage(page2);
      await pool.close();
    });

    test(
      "closes page immediately when released",
      async () => {
        const pool = new BrowserPool({ mode: "per-search", headless: true });

        try {
          const page = await pool.getPage();
          expect(page.isClosed()).toBe(false);

          await pool.releasePage(page);

          // Page should be closed after release in per-search mode
          expect(page.isClosed()).toBe(true);
        } finally {
          await pool.close();
        }
      },
      { timeout: 15000 },
    );
  });

  describe("Cleanup", () => {
    test.skip(
      "closes all pages on close() - SKIPPED: slow in test environment",
      async () => {
        const pool = new BrowserPool({ mode: "shared", headless: true });

        const page = await pool.getPage();
        await pool.releasePage(page);
        await pool.close();

        // If we get here, close() completed successfully
        expect(true).toBe(true);
      },
      { timeout: 15000 },
    );

    test(
      "closes browser on close()",
      async () => {
        const pool = new BrowserPool({ mode: "shared", headless: true });

        const page = await pool.getPage();
        const browser = page.context().browser();

        await pool.releasePage(page);
        await pool.close();

        // Browser should be closed
        expect(browser?.isConnected()).toBe(false);
      },
      { timeout: 15000 },
    );

    test("handles close() when no browser initialized", async () => {
      const pool = new BrowserPool({ mode: "shared", headless: true });

      // Should not throw when closing without initializing
      await pool.close();
      // If we get here without throwing, the test passes
      expect(true).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test(
      "handles browser disconnect gracefully",
      async () => {
        const pool = new BrowserPool({ mode: "shared", headless: true });

        try {
          const page = await pool.getPage();
          const browser = page.context().browser();

          // Force disconnect
          await browser?.close();

          // Pool should reinitialize on next getPage()
          const newPage = await pool.getPage();
          expect(newPage).toBeDefined();
          expect(newPage.isClosed()).toBe(false);

          await pool.releasePage(newPage);
        } finally {
          await pool.close();
        }
      },
      { timeout: 15000 },
    );
  });
});
