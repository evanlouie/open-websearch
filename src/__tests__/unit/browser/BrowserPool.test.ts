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
    test("reuses single page for all searches", async () => {
      const pool = new BrowserPool({ mode: "shared", headless: true });

      const page1 = await pool.getPage();
      const page2 = await pool.getPage();

      // In shared mode, should return the same page
      expect(page1).toBe(page2);

      await pool.releasePage(page1);
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
      "closes pages when pool exceeds poolSize",
      async () => {
        const pool = new BrowserPool({
          mode: "pool",
          poolSize: 2,
          headless: true,
        });

        try {
          // Get 3 pages
          const page1 = await pool.getPage();
          const page2 = await pool.getPage();
          const page3 = await pool.getPage();

          // Release all pages
          await pool.releasePage(page1);
          await pool.releasePage(page2);
          // page3 should be closed when released because pool is full
          await pool.releasePage(page3);

          // Verify page3 is closed
          expect(page3.isClosed()).toBe(true);
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
