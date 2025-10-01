import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { BrowserPool } from "../../browser/BrowserPool.js";
import { chromium } from "playwright";

type MockHooks = {
  pages: TestPage[];
  disconnect: () => void;
};

class TestPage {
  public readonly id: number;
  private closed = false;
  private clearThrows = false;

  constructor(id: number) {
    this.id = id;
  }

  enableClearFailure(): void {
    this.clearThrows = true;
  }

  context() {
    return {
      clearCookies: async () => {
        if (this.clearThrows) {
          throw new Error("clear failed");
        }
      },
    };
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  isClosed(): boolean {
    return this.closed;
  }

  setDefaultTimeout(): void {
    // no-op for tests
  }

  setDefaultNavigationTimeout(): void {
    // no-op for tests
  }
}

function createMockBrowser(): { browser: unknown; hooks: MockHooks } {
  let pageCounter = 0;
  const pages: TestPage[] = [];
  const listeners: Record<string, Array<() => void>> = {};

  const browser = {
    newPage: async () => {
      const page = new TestPage(pageCounter++);
      pages.push(page);
      return page as unknown as import("playwright").Page;
    },
    close: async () => {
      listeners["disconnected"]?.forEach((cb) => cb());
    },
    on: (event: string, cb: () => void) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
      return browser;
    },
  };

  return {
    browser,
    hooks: {
      pages,
      disconnect: () => {
        listeners["disconnected"]?.forEach((cb) => cb());
      },
    },
  };
}

describe("BrowserPool concurrency", () => {
  let originalLaunch: typeof chromium.launch;

  beforeEach(() => {
    originalLaunch = chromium.launch;
  });

  afterEach(() => {
    (chromium as unknown as { launch: typeof chromium.launch }).launch =
      originalLaunch;
  });

  test("shared mode serializes access to the single page", async () => {
    const { browser, hooks } = createMockBrowser();
    (chromium as unknown as { launch: typeof chromium.launch }).launch =
      async () => browser as import("playwright").Browser;

    const pool = new BrowserPool({ mode: "shared", poolSize: 1 });

    const firstPage = await pool.getPage();

    let secondResolved = false;
    const secondPromise = pool.getPage().then((page) => {
      secondResolved = true;
      return page;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(secondResolved).toBe(false);

    await pool.releasePage(firstPage);
    const secondPage = await secondPromise;
    expect(secondResolved).toBe(true);
    expect(secondPage).toBe(hooks.pages[0] as unknown as import("playwright").Page);

    await pool.releasePage(secondPage);
    await pool.close();
  });

  test("pool mode enforces pool size limit before opening new pages", async () => {
    const { browser, hooks } = createMockBrowser();
    (chromium as unknown as { launch: typeof chromium.launch }).launch =
      async () => browser as import("playwright").Browser;

    const pool = new BrowserPool({ mode: "pool", poolSize: 1 });

    const firstPage = await pool.getPage();
    const waiter = pool.getPage();

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(hooks.pages.length).toBe(1);

    await pool.releasePage(firstPage);
    const secondPage = await waiter;
    expect(secondPage).toBe(hooks.pages[0] as unknown as import("playwright").Page);

    await pool.releasePage(secondPage);
    await pool.close();
  });

  test("clearing cookies failures do not leak pages", async () => {
    const { browser, hooks } = createMockBrowser();
    (chromium as unknown as { launch: typeof chromium.launch }).launch =
      async () => browser as import("playwright").Browser;

    const pool = new BrowserPool({ mode: "pool", poolSize: 1 });

    const page = (await pool.getPage()) as unknown as TestPage;
    // Force clearCookies to throw once
    page.enableClearFailure();
    await pool.releasePage(page as unknown as import("playwright").Page);

    expect(page.isClosed()).toBe(true);
    expect(hooks.pages.length).toBe(1);

    // Next borrower gets a fresh page
    const replacement = await pool.getPage();
    expect(replacement).not.toBe(page as unknown as import("playwright").Page);

    await pool.releasePage(replacement);
    await pool.close();
  });
});
