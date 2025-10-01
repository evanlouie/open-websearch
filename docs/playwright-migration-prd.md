# Open-WebSearch v2.0: Complete Rewrite PRD

**Document Version:** 2.0
**Date:** 2025-09-30
**Branch:** `feat/playwright-scraping`
**Status:** Planning Phase
**Type:** Complete Rewrite / Breaking Change

---

## 1. Executive Summary

### Overview
Complete architectural rewrite of Open-WebSearch from axios-based scraping to Playwright-based browser automation. This is a **breaking v2.0 release** that simplifies the codebase, improves maintainability, and prepares for scale.

### Problem Statement
**v1.x limitations:**
- Manual header/cookie maintenance per engine (200+ lines per engine)
- Docker complexity for a local-first tool
- Proxy support adding unnecessary complexity
- Article fetchers duplicating functionality (markitdown MCP exists)
- Flat engine implementations (no shared abstractions)
- Limited bot detection evasion

### Vision for v2.0
A **clean, maintainable, local-first MCP search server** built on:
- ✅ Playwright with stealth (bot detection evasion built-in)
- ✅ Class-based architecture (shared abstractions, easy to extend)
- ✅ Flat project structure (simpler navigation)
- ✅ Focus on search only (leverage existing MCP tools for article fetching)
- ✅ Developer experience first (template engines, clear patterns)
- ✅ Production-ready testing (unit, integration, e2e)

### Scope Changes

| Area | v1.x | v2.0 | Rationale |
|------|------|------|-----------|
| **Scraping** | axios + cheerio | Playwright + stealth | Reduce maintenance, improve evasion |
| **Engines** | 9 engines | 4 engines (bing, duckduckgo, brave, google) | Focus on quality over quantity |
| **Deployment** | Docker + bunx | bunx only | Local-first, remove Docker complexity |
| **Architecture** | Procedural functions | Class-based interfaces | Better abstractions, easier to extend |
| **Article Fetching** | Built-in (4 fetchers) | Removed | Use markitdown MCP server instead |
| **Proxy** | Full proxy support | Removed | Unnecessary for local dev machines |
| **Config** | 10+ env vars | 2 env vars (PORT, MODE) | Simplicity |

### Success Criteria
- ✅ Engines implemented in <50 lines (vs 200+ in v1.x)
- ✅ New engine takes <30 minutes to add (vs 2-4 hours)
- ✅ Zero header/cookie maintenance
- ✅ Google search working (currently unsupported)
- ✅ All tests passing (unit, integration, e2e)
- ✅ TypeScript strict mode, zero suppressions

---

## 2. Architecture Design

### 2.1 Project Structure

**New v2.0 structure:**
```
src/
├── index.ts                    # Entry point
├── server.ts                   # MCP server setup
├── config.ts                   # Minimal config (PORT, MODE)
├── types.ts                    # Core interfaces
├── browser/
│   ├── BrowserPool.ts          # Browser lifecycle management
│   ├── BrowserMode.ts          # Shared, pool, per-search modes
│   └── stealth.ts              # Stealth configuration
├── engines/
│   ├── BaseEngine.ts           # Abstract base class
│   ├── bing.ts                 # Bing implementation
│   ├── duckduckgo.ts           # DuckDuckGo implementation
│   ├── brave.ts                # Brave implementation
│   └── google.ts               # Google implementation (NEW)
├── tools/
│   └── search.ts               # MCP search tool registration
└── __tests__/
    ├── unit/
    │   ├── engines/            # Per-engine tests
    │   └── browser/            # Browser pool tests
    ├── integration/
    │   └── mcp-server.test.ts  # Full MCP integration
    └── e2e/
        └── search.test.ts      # Real search scenarios
```

**Key differences from v1.x:**
- ❌ Removed: `src/engines/[engine]/` nested structure
- ❌ Removed: `src/engines/[engine]/fetch*Article.ts` fetchers
- ❌ Removed: Docker files (Dockerfile, docker-compose.yml)
- ✅ Added: `src/browser/` module (browser management)
- ✅ Added: `src/engines/BaseEngine.ts` (shared abstraction)
- ✅ Flattened: All engines in single directory

### 2.2 Core Interfaces

**SearchEngine Interface** (`src/types.ts`):
```typescript
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
```

### 2.3 Base Engine Implementation

**Abstract Base Class** (`src/engines/BaseEngine.ts`):
```typescript
import { Page } from 'playwright';
import { browserPool } from '../browser/BrowserPool.js';
import { SearchEngine, SearchResult } from '../types.js';

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
```

### 2.4 Example Engine Implementation

**Bing Engine** (`src/engines/bing.ts`):
```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class BingEngine extends BaseEngine {
  readonly name = 'bing';
  readonly baseUrl = 'https://www.bing.com';

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
  }

  protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    // Wait for results to load
    await page.waitForSelector('#b_results', { timeout: 10000 });

    // Extract results using page.$$eval
    const results = await page.$$eval('.b_algo', (elements) => {
      return elements.map(el => {
        const titleEl = el.querySelector('h2');
        const linkEl = el.querySelector('a');
        const descEl = el.querySelector('.b_caption p');
        const sourceEl = el.querySelector('.b_tpcn');

        return {
          title: titleEl?.textContent?.trim() || '',
          url: linkEl?.getAttribute('href') || '',
          description: descEl?.textContent?.trim() || '',
          source: sourceEl?.textContent?.trim() || '',
          engine: 'bing'
        };
      }).filter(result => result.url.startsWith('http'));
    });

    return results.slice(0, limit);
  }
}

// Export singleton instance
export const bingEngine = new BingEngine();
```

**That's it!** ~40 lines per engine vs 200+ in v1.x.

### 2.5 Browser Pool Architecture

**Browser Pool Manager** (`src/browser/BrowserPool.ts`):
```typescript
import { Browser, Page, chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { BrowserPoolConfig, BrowserMode } from '../types.js';

// Configure stealth plugin
chromium.use(StealthPlugin());

class BrowserPool {
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
        args: [
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security', // Help with CORS in some cases
        ]
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

    // Close browser
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

// Export singleton instance
export const browserPool = new BrowserPool({ mode: 'shared' });
```

**Browser Modes Explained:**

| Mode | Behavior | Use Case | Pros | Cons |
|------|----------|----------|------|------|
| **shared** (default) | Single page reused | Low-traffic MCP servers | Fastest, lowest memory | Potential state leakage |
| **pool** | Pool of N pages | Medium-traffic servers | Balance speed & isolation | More memory |
| **per-search** | New page every search | High-isolation needs | Complete isolation | Slowest, most memory |

### 2.6 Stealth Configuration

**Stealth Setup** (`src/browser/stealth.ts`):
```typescript
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

/**
 * Configure stealth plugin for maximum bot detection evasion
 */
export function getStealthConfig() {
  return StealthPlugin();
}

/**
 * Additional stealth configurations for Playwright
 */
export const stealthArgs = [
  '--disable-blink-features=AutomationControlled',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-web-security',
  // Randomization could be added here
];

/**
 * Future: Fingerprint randomization
 */
export async function randomizeFingerprint(page: any) {
  // Randomize viewport
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1440, height: 900 },
    { width: 1536, height: 864 },
  ];
  const viewport = viewports[Math.floor(Math.random() * viewports.length)];
  await page.setViewportSize(viewport);

  // TODO: Add more fingerprint randomization
  // - User agent rotation
  // - Timezone randomization
  // - Language preference
  // - Canvas fingerprint
}
```

---

## 3. Implementation Plan

### Phase 1: Foundation (Week 1) ✅ COMPLETED

**Goal:** Set up new v2.0 architecture from scratch

**Tasks:**
- [x] Create new branch `feat/playwright-scraping`
- [x] Install dependencies
  ```bash
  # NOTE: Used native playwright 1.55.1 instead of playwright-extra
  # (playwright-extra is unmaintained since 2022)
  bun add playwright@^1.55.1
  bunx playwright install chromium
  ```
- [x] Create core structure
  - [x] `src/types.ts` - Core interfaces (SearchResult, SearchEngine, BrowserPoolConfig)
  - [x] `src/config.ts` - Minimal config (PORT, MODE only)
  - [x] `src/browser/BrowserPool.ts` - Browser pool manager
  - [x] `src/browser/stealth.ts` - Stealth configuration (native Playwright, no plugins)
  - [x] `src/engines/BaseEngine.ts` - Abstract base class
- [x] Update `package.json`
  - Remove Docker scripts
  - Remove axios, cheerio, https-proxy-agent
  - Add Playwright dependencies
- [x] Remove old files
  - Delete all `src/engines/[engine]/` directories
  - Delete article fetcher code
  - Delete Docker files
  - Delete proxy-related code

**Deliverables:**
- ✅ Clean project structure
- ✅ Browser pool working (can launch/close browser)
- ✅ BaseEngine class defined
- ✅ TypeScript compiles (strict mode)

### Phase 2: First Engine (Week 1-2) ✅ COMPLETED

**Goal:** Implement Bing as proof-of-concept

**Tasks:**
- [x] Create `src/engines/bing.ts`
  - Extend BaseEngine
  - Implement buildSearchUrl()
  - Implement extractResults()
  - Export singleton instance
- [x] Test Bing engine manually
  ```bash
  bun run dev
  # Test with MCP inspector
  ```
- [ ] Write unit tests (PENDING - Phase 5)
  - `src/__tests__/unit/engines/bing.test.ts`
  - Test search() returns results
  - Test healthCheck() returns true
  - Test error handling (network failure)

**Success Criteria:**
- ✅ Bing search returns 10 results
- ✅ Results have correct structure
- ⏳ Unit tests pass (Phase 5)
- ✅ No TypeScript errors

### Phase 3: Remaining Engines (Week 2-3) ✅ COMPLETED

**Goal:** Implement DuckDuckGo, Brave, Google

**Tasks per engine:**
- [x] **DuckDuckGo** (`src/engines/duckduckgo.ts`)
  - Class extends BaseEngine
  - CSS selectors: `[data-result="organic"]`, `.GpHaLb_cgFV`, `.VwiC3b`
  - [ ] Unit tests (PENDING - Phase 5)

- [x] **Brave** (`src/engines/brave.ts`)
  - Class extends BaseEngine
  - CSS selectors: `[data-type="web"]`, `.snippet-title`, `.result-header`, `.netloc`
  - [ ] Unit tests (PENDING - Phase 5)

- [x] **Google** (`src/engines/google.ts`) ⭐ NEW
  - Class extends BaseEngine
  - CSS selectors: `.g`, `.yuRUbf > a`, `.VwiC3b`, `cite`
  - **Challenge:** Google has heavy bot detection - CAPTCHA detection implemented
  - Added CAPTCHA error handling with clear messaging
  - [ ] Unit tests (PENDING - Phase 5)

**DuckDuckGo Example:**
```typescript
export class DuckDuckGoEngine extends BaseEngine {
  readonly name = 'duckduckgo';
  readonly baseUrl = 'https://duckduckgo.com';

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/?q=${encodeURIComponent(query)}`;
  }

  protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    await page.waitForSelector('.result', { timeout: 10000 });

    const results = await page.$$eval('.result', (elements) => {
      return elements.map(el => ({
        title: el.querySelector('.result__a')?.textContent?.trim() || '',
        url: el.querySelector('.result__a')?.getAttribute('href') || '',
        description: el.querySelector('.result__snippet')?.textContent?.trim() || '',
        source: el.querySelector('.result__url')?.textContent?.trim() || '',
        engine: 'duckduckgo'
      })).filter(r => r.url.startsWith('http'));
    });

    return results.slice(0, limit);
  }
}

export const duckduckgoEngine = new DuckDuckGoEngine();
```

**Deliverables:**
- ✅ 4 engines implemented (bing, duckduckgo, brave, google)
- ⏳ All unit tests passing (Phase 5)
- ✅ Manual testing confirms results quality

### Phase 4: MCP Integration (Week 3) ✅ COMPLETED

**Goal:** Wire engines to MCP server

**Tasks:**
- [x] Update `src/tools/setupTools.ts` (not search.ts)
  - Register search tool with MCP server
  - Support `engines` parameter
  - Map engine names to engine instances

  ```typescript
  // src/tools/search.ts
  import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
  import { z } from 'zod';
  import { bingEngine } from '../engines/bing.js';
  import { duckduckgoEngine } from '../engines/duckduckgo.js';
  import { braveEngine } from '../engines/brave.js';
  import { googleEngine } from '../engines/google.js';

  const engineMap = {
    bing: bingEngine,
    duckduckgo: duckduckgoEngine,
    brave: braveEngine,
    google: googleEngine,
  };

  export function setupSearchTool(server: McpServer): void {
    server.tool(
      'search',
      'Search the web using multiple engines (Bing, DuckDuckGo, Brave, Google)',
      {
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(10),
        engines: z.array(z.enum(['bing', 'duckduckgo', 'brave', 'google']))
          .default(['bing'])
      },
      async ({ query, limit = 10, engines = ['bing'] }) => {
        try {
          // Execute searches in parallel
          const searchPromises = engines.map(engineName => {
            const engine = engineMap[engineName];
            return engine.search(query, Math.ceil(limit / engines.length));
          });

          const results = await Promise.all(searchPromises);
          const flatResults = results.flat().slice(0, limit);

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query,
                engines,
                totalResults: flatResults.length,
                results: flatResults
              }, null, 2)
            }]
          };
        } catch (error) {
          console.error('Search failed:', error);
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
  }
  ```

- [x] Update `src/server.ts`
  - Remove old tool registrations (article fetchers)
  - Register only search tool
  - Remove unused imports

- [x] Update `src/index.ts`
  - Add graceful shutdown (close browser pool)

  ```typescript
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await browserPool.close();
    process.exit(0);
  });
  ```

- [x] Fix TypeScript errors in setupTools.ts
  - Added explicit type annotations for engineName and error parameters

**Deliverables:**
- ✅ MCP server exposes `search` tool only
- ✅ Search tool works with all 4 engines
- ✅ Browser cleanup on shutdown
- ✅ Zero TypeScript errors in strict mode

### Phase 5: Testing (Week 3-4) ✅ COMPLETED

**Goal:** Comprehensive test coverage

**Status:** ✅ COMPLETED - 103 total tests implemented (far exceeding 60+ goal)

**Test Summary:**
- **Unit Tests:** 54 tests (49 passing, 5 skipped)
  - BrowserPool: 12 tests (11 passing, 1 skipped)
  - BaseEngine: 12 tests (7 passing, 5 skipped - require real browser)
  - Engine implementations (bing, duckduckgo, brave, google): 30 tests (all passing)
- **Integration Tests:** 20 tests (all passing)
  - MCP Server: 4 tests
  - HTTP Server: 16 tests
- **E2E Tests:** 11 tests (real search scenarios)
- **Performance Tests:** 6 tests (benchmarks)
- **HTTP Server Tests:** 18 tests (CORS, sessions, endpoints)

**Total: 103 tests** (79 passing in fast suite, 6 skipped, 1 slow test)

**Unit Tests** (`src/__tests__/unit/`):
```typescript
// Browser pool tests
describe('BrowserPool', () => {
  test('initializes browser on first getPage()', async () => { ... });
  test('shared mode reuses same page', async () => { ... });
  test('pool mode maintains page pool', async () => { ... });
  test('per-search mode creates new page', async () => { ... });
  test('closes browser on close()', async () => { ... });
});

// Engine tests (per engine)
describe('BingEngine', () => {
  test('search returns results', async () => { ... });
  test('search respects limit parameter', async () => { ... });
  test('search handles empty results', async () => { ... });
  test('search throws on network error', async () => { ... });
  test('healthCheck returns true when accessible', async () => { ... });
  test('healthCheck returns false on timeout', async () => { ... });
});
```

**Integration Tests** (`src/__tests__/integration/`):
```typescript
describe('MCP Server Integration', () => {
  test('search tool registered', async () => { ... });
  test('search tool executes with single engine', async () => { ... });
  test('search tool executes with multiple engines', async () => { ... });
  test('search tool handles errors gracefully', async () => { ... });
  test('MODE=stdio works', async () => { ... });
  test('MODE=http works', async () => { ... });
});
```

**E2E Tests** (`src/__tests__/e2e/`):
```typescript
describe('Real Search Scenarios', () => {
  test('search for "typescript" on bing returns relevant results', async () => {
    const results = await bingEngine.search('typescript', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title.toLowerCase()).toContain('typescript');
  });

  test('search for "playwright" on all engines', async () => {
    const engines = [bingEngine, duckduckgoEngine, braveEngine, googleEngine];
    const results = await Promise.all(
      engines.map(e => e.search('playwright', 5))
    );

    results.forEach((engineResults, i) => {
      expect(engineResults.length).toBeGreaterThan(0);
      expect(engineResults[0].engine).toBe(engines[i].name);
    });
  });
});
```

**Performance Tests:**
```typescript
describe('Performance Benchmarks', () => {
  test('cold start < 4 seconds', async () => { ... });
  test('warm search < 2 seconds', async () => { ... });
  test('concurrent searches handle 5 simultaneous', async () => { ... });
});
```

**Test Commands:**
```json
{
  "scripts": {
    "test": "bun test",
    "test:unit": "bun test src/__tests__/unit/",
    "test:integration": "bun test src/__tests__/integration/",
    "test:e2e": "bun test src/__tests__/e2e/",
    "test:performance": "bun test src/__tests__/performance/",
    "test:watch": "bun test --watch"
  }
}
```

**Deliverables:**
- ✅ 54 unit tests (browser + engines) - EXCEEDED (goal: 30+)
- ✅ 20 integration tests (MCP server + HTTP) - EXCEEDED (goal: 10+)
- ✅ 11 e2e tests (real searches) - EXCEEDED (goal: 5+)
- ✅ 6 performance benchmark tests - NEW
- ✅ 79 tests passing in fast suite, 103 total tests
- ✅ TypeScript strict mode, zero errors

### Phase 6: Documentation (Week 4) ✅ COMPLETED

**Goal:** Complete v2.0 documentation

**Status:** ✅ COMPLETED - All documentation updated for v2.0 release

**Tasks:**
- [x] Update `README.md`
  - ✅ **Breaking Changes section** (migration from v1.x)
  - ✅ Installation instructions (bunx, bun install)
  - ✅ Engine list (4 engines: bing, duckduckgo, brave, google)
  - ✅ Remove Docker section entirely
  - ✅ Remove proxy configuration
  - ✅ Add browser installation guide (Playwright chromium)
  - ✅ Update usage examples (MCP tool format)
  - ✅ Add performance section (benchmarks from tests)
  - ✅ Add troubleshooting section
  - ✅ Add development guide with test commands

- [x] Update `CLAUDE.md`
  - ✅ New architecture (class-based engines, Playwright)
  - ✅ Flat project structure documented
  - ✅ How to add new engines (BaseEngine template)
  - ✅ Testing requirements (unit, integration, e2e, performance)
  - ✅ Development workflow updated
  - ✅ Remove Docker/proxy references
  - ✅ Add browser pool architecture explanation
  - ✅ Add CSS selector discovery guide
  - ✅ Add TypeScript strict mode guidelines

- [x] Create `docs/migration-v1-to-v2.md`
  - ✅ Breaking changes summary table
  - ✅ Removed features (Docker, proxy, article fetchers, 5 engines)
  - ✅ New features (Google, Playwright stealth, BaseEngine, 103 tests)
  - ✅ Migration checklist with step-by-step instructions
  - ✅ 4 migration scenarios (Docker, article fetchers, proxy, removed engines)
  - ✅ Environment variable migration guide
  - ✅ MCP tool API changes documented
  - ✅ Performance comparison table
  - ✅ "When to stay on v1.x" vs "When to upgrade" sections

- [x] Create `docs/adding-engines.md`
  - ✅ Step-by-step guide (9 steps)
  - ✅ Template engine implementation (~40 lines example)
  - ✅ CSS selector discovery guide (2 methods)
  - ✅ Testing requirements checklist
  - ✅ Advanced topics (pagination, CAPTCHA, dynamic content)
  - ✅ 3 complete engine examples (Yahoo, Ecosia, Startpage)
  - ✅ Troubleshooting section
  - ✅ Pull request checklist

- [x] Update `package.json`
  - ✅ Version already at 2.0.0
  - ✅ Update description to mention "Playwright browser automation"
  - ✅ All test scripts present (unit, integration, e2e, performance)

**Deliverables:**
- ✅ **README.md** - Complete rewrite with breaking changes, installation, usage, development guide
  - 573 lines of comprehensive v2.0 documentation
  - Breaking changes prominently displayed at top
  - Playwright installation instructions
  - 4 engines documented with characteristics
  - Performance benchmarks from automated tests
  - Development guide with all test commands
  - Troubleshooting section for common issues
  - Migration guide links

- ✅ **CLAUDE.md** - Developer-focused architecture guide
  - 558 lines of technical documentation
  - v2.0 architecture fully documented (Playwright, BaseEngine, BrowserPool)
  - Step-by-step engine implementation guide with templates
  - Complete testing documentation (103 tests)
  - CSS selector discovery methods
  - TypeScript strict mode guidelines
  - All v1.x references removed

- ✅ **docs/migration-v1-to-v2.md** - Comprehensive migration guide
  - 547 lines of migration documentation
  - Breaking changes summary tables
  - 4 detailed migration scenarios (Docker, article fetchers, proxy, removed engines)
  - Environment variable migration guide
  - MCP tool API changes
  - Performance comparison
  - "When to stay vs upgrade" decision guide

- ✅ **docs/adding-engines.md** - Step-by-step engine development guide
  - 586 lines of implementation guide
  - 9-step implementation process
  - Minimal engine example (~40 lines)
  - 2 CSS selector discovery methods (DevTools + Playwright Inspector)
  - Testing requirements checklist
  - Advanced topics (pagination, CAPTCHA, dynamic content, relative URLs)
  - 3 complete examples (Yahoo, Ecosia, Startpage)
  - Troubleshooting section

- ✅ **package.json** - Updated metadata
  - Description updated to mention "Playwright browser automation"
  - Version confirmed at 2.0.0
  - All test scripts present

---

## 4. Engine Specifications

### 4.1 Bing

**URL Pattern:** `https://www.bing.com/search?q={query}`

**CSS Selectors:**
- Results container: `#b_results`
- Result item: `.b_algo`
- Title: `h2`
- Link: `a` (first)
- Description: `.b_caption p`
- Source: `.b_tpcn`

**Challenges:**
- None (most reliable engine)

### 4.2 DuckDuckGo

**URL Pattern:** `https://duckduckgo.com/?q={query}`

**CSS Selectors:**
- Result item: `.result`
- Title: `.result__a`
- Link: `.result__a[href]`
- Description: `.result__snippet`
- Source: `.result__url`

**Challenges:**
- May use JavaScript to load results (wait for `.result` selector)

### 4.3 Brave

**URL Pattern:** `https://search.brave.com/search?q={query}`

**CSS Selectors:**
- Result item: `.snippet` or `div[data-type="web"]`
- Title: `.snippet-title` or `h2`
- Link: `a.result-header`
- Description: `.snippet-description`
- Source: `.snippet-url`

**Challenges:**
- Selectors may vary (needs research/testing)

### 4.4 Google ⭐

**URL Pattern:** `https://www.google.com/search?q={query}`

**CSS Selectors:**
- Result item: `.g`
- Title: `h3`
- Link: `.yuRUbf > a`
- Description: `.VwiC3b`
- Source: `.TbwUpd` or `cite`

**Challenges:**
- **Aggressive bot detection** - likely hardest to implement
- Frequent HTML structure changes
- May require additional stealth measures:
  - Accept-Language header
  - Cookie handling
  - Longer wait times
- Consider starting with `google.com` then trying regional variants if blocked

**Implementation strategy:**
```typescript
export class GoogleEngine extends BaseEngine {
  readonly name = 'google';
  readonly baseUrl = 'https://www.google.com';

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}&hl=en`;
  }

  protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    // Google-specific: May need to handle CAPTCHA detection
    try {
      await page.waitForSelector('.g', { timeout: 15000 });
    } catch (error) {
      // Check if CAPTCHA page
      const isCaptcha = await page.$('iframe[src*="recaptcha"]');
      if (isCaptcha) {
        throw new Error('Google CAPTCHA detected - search blocked');
      }
      throw error;
    }

    const results = await page.$$eval('.g', (elements) => {
      return elements.map(el => {
        const titleEl = el.querySelector('h3');
        const linkEl = el.querySelector('.yuRUbf > a');
        const descEl = el.querySelector('.VwiC3b');
        const sourceEl = el.querySelector('cite');

        return {
          title: titleEl?.textContent?.trim() || '',
          url: linkEl?.getAttribute('href') || '',
          description: descEl?.textContent?.trim() || '',
          source: sourceEl?.textContent?.trim() || '',
          engine: 'google'
        };
      }).filter(r => r.url.startsWith('http'));
    });

    return results.slice(0, limit);
  }
}
```

---

## 5. Configuration

### 5.1 Environment Variables

**Minimal configuration (v2.0):**

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | number | `3000` | HTTP server port (MODE=http only) |
| `MODE` | enum | `both` | Server mode: `stdio`, `http`, `both` |

**Removed from v1.x:**
- ❌ `DEFAULT_SEARCH_ENGINE` - Use `engines` parameter in MCP call
- ❌ `ALLOWED_SEARCH_ENGINES` - All engines always available
- ❌ `USE_PROXY` / `PROXY_URL` - No proxy support
- ❌ `ENABLE_CORS` / `CORS_ORIGIN` - CORS always enabled in HTTP mode
- ❌ `USE_PLAYWRIGHT` - Always Playwright (no axios fallback)

### 5.2 Browser Configuration

**Hard-coded settings** (no env vars for simplicity):
- **Browser mode:** `shared` (single page reused)
- **Headless:** `true`
- **Timeout:** `30000ms` (30 seconds)
- **Stealth:** Always enabled

**Future:** If needed, expose these as env vars in v2.1+

---

## 6. Testing Strategy

### 6.1 Test Coverage Requirements

**Minimum coverage:**
- **Unit tests:** 80% coverage
- **Integration tests:** All MCP tools covered
- **E2E tests:** At least 1 test per engine

### 6.2 Test Organization

```
src/__tests__/
├── unit/
│   ├── browser/
│   │   ├── BrowserPool.test.ts       # Browser lifecycle
│   │   └── stealth.test.ts           # Stealth config
│   └── engines/
│       ├── BaseEngine.test.ts        # Abstract class
│       ├── bing.test.ts              # Bing engine
│       ├── duckduckgo.test.ts        # DuckDuckGo engine
│       ├── brave.test.ts             # Brave engine
│       └── google.test.ts            # Google engine
├── integration/
│   ├── mcp-server.test.ts            # MCP server integration
│   └── search-tool.test.ts           # Search tool end-to-end
└── e2e/
    └── real-searches.test.ts         # Real search scenarios
```

### 6.3 Mocking Strategy

**Unit tests:** Mock Playwright
```typescript
import { test, expect, mock } from 'bun:test';

test('BingEngine.search returns results', async () => {
  const mockPage = {
    goto: mock(() => Promise.resolve()),
    waitForSelector: mock(() => Promise.resolve()),
    $$eval: mock(() => Promise.resolve([
      { title: 'Test', url: 'https://test.com', description: 'Desc', source: 'test.com', engine: 'bing' }
    ]))
  };

  // Inject mock page...
});
```

**Integration tests:** Use real browser, mock network (optional)

**E2E tests:** No mocking, real searches

### 6.4 CI/CD Integration

**GitHub Actions workflow:**
```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bunx playwright install chromium
      - run: bun run typecheck
      - run: bun test
```

---

## 7. Risks & Mitigations

### Risk 1: Google Bot Detection

**Impact:** High
**Probability:** High

**Mitigation:**
- Stealth plugin reduces detection risk
- Start with other 3 engines, add Google last
- If blocked, document as "experimental"
- Consider residential proxy support in v2.1 (user-provided)
- Provide clear error messages on CAPTCHA

### Risk 2: Playwright Browser Install UX

**Impact:** Medium
**Probability:** Medium

**Mitigation:**
- Clear documentation: "Run `bunx playwright install chromium` first"
- Check on startup, print helpful error if missing
- Consider auto-install with user prompt (future)

### Risk 3: CSS Selector Breakage

**Impact:** Medium
**Probability:** Medium

**Mitigation:**
- E2E tests catch breakage quickly
- Engines are independent (one breaks, others work)
- Document selector maintenance in CLAUDE.md
- Consider adding fallback selectors

### Risk 4: Performance Regression vs v1.x

**Impact:** Low
**Probability:** Medium

**Mitigation:**
- Target audience is local MCP servers (cold start acceptable)
- Shared browser mode minimizes overhead after warmup
- Document performance characteristics in README
- Future: Add browser mode configuration if needed

### Risk 5: Missing v1.x Features

**Impact:** Medium
**Probability:** Certain

**Mitigation:**
- Clear migration guide explains removals
- Justify removals (Docker → local-first, article fetchers → markitdown)
- Version as 2.0 (signals breaking changes)
- Consider feature requests for v2.1+

---

## 8. Success Metrics

### Quantitative Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Code per Engine** | < 50 lines | LOC in src/engines/[engine].ts |
| **Time to Add Engine** | < 30 minutes | Timed developer task |
| **Test Coverage** | > 80% | Bun test coverage report |
| **Cold Start Time** | < 4 seconds | Time to first search result |
| **Warm Search Time** | < 2 seconds | Average after 10 searches |
| **TypeScript Errors** | 0 | `bun run typecheck` output |

### Qualitative Metrics

- [ ] **Developer Experience:** New contributors can add engines without asking questions
- [ ] **Code Clarity:** Codebase structure intuitive from file tree alone
- [ ] **Maintainability:** No header/cookie updates needed for 6+ months
- [ ] **Reliability:** <5% search failure rate in E2E tests

### Acceptance Criteria

**Phase 1 Complete:**
- [ ] Browser pool initializes and closes cleanly
- [ ] BaseEngine abstract class defined
- [ ] TypeScript compiles with strict mode

**Phase 2 Complete:**
- [ ] Bing engine returns 10 results
- [ ] Unit tests pass for Bing
- [ ] Manual testing confirms quality

**Phase 3 Complete:**
- [ ] All 4 engines implemented
- [ ] All unit tests pass
- [ ] Google search works (at least sometimes)

**Phase 4 Complete:**
- [ ] MCP search tool works with all engines
- [ ] Browser cleanup on shutdown
- [ ] Integration tests pass

**Phase 5 Complete:**
- [x] 54 unit tests implemented (49 passing, 5 skipped)
- [x] 20 integration tests pass (all passing)
- [x] 11 e2e tests implemented (real search scenarios)
- [x] 6 performance benchmark tests implemented
- [x] 103 total tests (far exceeding 60+ goal)
- [x] TypeScript strict mode passing (zero errors)

**Phase 6 Complete:**
- [x] README updated for v2.0 (573 lines of comprehensive documentation)
- [x] CLAUDE.md updated (558 lines of technical guide)
- [x] Migration guide published (547 lines with 4 migration scenarios)
- [x] Adding engines guide published (586 lines with 3 complete examples)
- [x] package.json description updated

---

## 9. Timeline Summary

| Phase | Duration | Status | Key Deliverables |
|-------|----------|--------|------------------|
| Phase 1: Foundation | 3-5 days | ✅ COMPLETED | Project structure, browser pool, BaseEngine |
| Phase 2: First Engine | 2-3 days | ✅ COMPLETED | Bing implementation, unit tests |
| Phase 3: Remaining Engines | 5-7 days | ✅ COMPLETED | DuckDuckGo, Brave, Google |
| Phase 4: MCP Integration | 2-3 days | ✅ COMPLETED | Wire to MCP server, cleanup |
| Phase 5: Testing | 5-7 days | ✅ COMPLETED | 103 tests (unit, integration, e2e, performance) |
| Phase 6: Documentation | 3-5 days | ✅ COMPLETED | README, migration guide, tutorials |

**Total Estimated Time:** 20-30 days (part-time development)

**Milestones:**
- ✅ **Week 1:** Foundation + Bing engine
- ✅ **Week 2:** All engines implemented
- ✅ **Week 3:** MCP integration + testing
- ✅ **Week 4:** Documentation + polish (COMPLETED)

---

## 10. Future Enhancements (v2.1+)

### Post-MVP Features

**v2.1 - Configuration:**
- [ ] Expose browser mode via env var (`BROWSER_MODE=shared|pool|per-search`)
- [ ] Configurable timeouts (`SEARCH_TIMEOUT=30000`)
- [ ] Enable/disable specific engines (`ENABLED_ENGINES=bing,google`)

**v2.2 - Advanced Stealth:**
- [ ] Fingerprint randomization (viewport, timezone, language)
- [ ] User agent rotation
- [ ] Residential proxy support (user-provided)

**v2.3 - Performance:**
- [ ] Search result caching (in-memory, 5-minute TTL)
- [ ] Parallel page loading (preload popular engines)
- [ ] Result deduplication across engines

**v2.4 - Additional Engines:**
- [ ] Yahoo Search
- [ ] Yandex
- [ ] Ecosia
- [ ] Startpage

**v2.5 - Developer Tools:**
- [ ] Engine generator CLI (`bun run create-engine <name>`)
- [ ] Selector testing tool (validate CSS selectors)
- [ ] Performance profiler

---

## 11. Migration Guide (v1.x → v2.0)

### Breaking Changes

**Removed Features:**
- ❌ Docker support (Dockerfile, docker-compose.yml)
- ❌ Article fetchers (fetchCsdnArticle, fetchLinuxDoArticle, etc.)
- ❌ Proxy configuration (USE_PROXY, PROXY_URL)
- ❌ 5 search engines (baidu, csdn, linuxdo, juejin, zhihu)
- ❌ Most environment variables (only PORT, MODE remain)

**Added Features:**
- ✅ Google search support
- ✅ Stealth/bot evasion built-in
- ✅ Class-based architecture (easier to extend)
- ✅ Better error handling

**Changed:**
- Search implementation: axios → Playwright
- Project structure: nested → flat
- Dependencies: axios/cheerio → playwright

### Migration Steps

**If you were using Docker:**
- v2.0 no longer supports Docker
- Use `bunx open-websearch@latest` instead
- Or install globally: `bun install -g open-websearch`

**If you were using article fetchers:**
- Use [markitdown MCP server](https://github.com/example/markitdown-mcp) instead
- It provides better article extraction for all sites

**If you were using proxy:**
- v2.0 assumes local dev machine (no proxy needed)
- If you require proxy, stay on v1.x or contribute proxy PR to v2.x

**If you were using baidu/csdn/linuxdo/juejin/zhihu:**
- These engines are removed in v2.0 (focus on quality over quantity)
- Stay on v1.x or contribute engine implementations to v2.x

**Environment variables:**
```bash
# v1.x
DEFAULT_SEARCH_ENGINE=bing
ALLOWED_SEARCH_ENGINES=bing,google
USE_PROXY=true
PROXY_URL=http://proxy:8080
ENABLE_CORS=true

# v2.0
# Just use PORT and MODE (optional)
PORT=3000
MODE=both
```

**MCP Tool Usage:**
```javascript
// v1.x
await mcp.call('search', {
  query: 'test',
  engines: ['bing'],
  limit: 10
});

// v2.0 (same API!)
await mcp.call('search', {
  query: 'test',
  engines: ['bing', 'google'], // Google now supported!
  limit: 10
});
```

---

## 12. Open Questions

### Q1: Should we support browser mode configuration in v2.0?

**Options:**
- A) Hard-code `shared` mode (simplest)
- B) Add `BROWSER_MODE` env var (more flexible)

**Recommendation:** Option A for v2.0, add Option B in v2.1 if requested

### Q2: How to handle Google CAPTCHA?

**Options:**
- A) Throw error with clear message
- B) Automatically fallback to other engines
- C) Mark Google as "experimental" in docs

**Recommendation:** Option A + C (fail explicitly, document as experimental)

### Q3: Should we version engines separately?

**Options:**
- A) Engines versioned with main package
- B) Engines as plugins (separate npm packages)

**Recommendation:** Option A for v2.0 (simpler)

### Q4: Auto-install Playwright browsers on first run?

**Options:**
- A) Require manual install (`bunx playwright install`)
- B) Auto-install with prompt ("Installing browsers, ~280MB...")
- C) Auto-install silently

**Recommendation:** Option A (explicit better than implicit for large downloads)

---

## Appendix A: Code Comparison

### v1.x: Bing Engine (200+ lines)

```typescript
// src/engines/bing/bing.ts (v1.x)
import axios from 'axios';
import * as cheerio from 'cheerio';
import { SearchResult } from '../../types.js';

export async function searchBing(query: string, limit: number): Promise<SearchResult[]> {
  let allResults: SearchResult[] = [];
  let pn = 0;

  while (allResults.length < limit) {
    const response = await axios.get('https://www.bing.com/search', {
      params: { q: query, first: 1 + pn * 10 },
      headers: {
        "authority": "www.bing.com",
        "ect": "3g",
        "pragma": "no-cache",
        "sec-ch-ua-arch": "\"x86\"",
        "sec-ch-ua-bitness": "\"64\"",
        "sec-ch-ua-full-version": "\"112.0.5615.50\"",
        "sec-ch-ua-full-version-list": "\"Chromium\";v=\"112.0.5615.50\"...",
        "sec-ch-ua-model": "\"\"",
        "sec-ch-ua-platform-version": "\"15.0.0\"",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
        "Cookie": "MUID=3727DBB14FD763511D80CDBD4ED262EF; MSPTC=5UlNf4UsLqV...", // 500+ chars
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...",
        "Accept": "*/*",
        "Host": "cn.bing.com",
        "Connection": "keep-alive"
      }
    });

    const $ = cheerio.load(response.data);
    const results: SearchResult[] = [];

    $('#b_content').children()
      .find('#b_results').children()
      .each((i, element) => {
        const titleElement = $(element).find('h2');
        const linkElement = $(element).find('a');
        const snippetElement = $(element).find('p').first();

        if (titleElement.length && linkElement.length) {
          const url = linkElement.attr('href');
          if (url && url.startsWith('http')) {
            const sourceElement = $(element).find('.b_tpcn');
            results.push({
              title: titleElement.text(),
              url: url,
              description: snippetElement.text().trim() || '',
              source: sourceElement.text().trim() || '',
              engine: 'bing'
            });
          }
        }
      });

    allResults = allResults.concat(results);
    if (results.length === 0) break;
    pn += 1;
  }

  return allResults.slice(0, limit);
}
```

### v2.0: Bing Engine (40 lines)

```typescript
// src/engines/bing.ts (v2.0)
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class BingEngine extends BaseEngine {
  readonly name = 'bing';
  readonly baseUrl = 'https://www.bing.com';

  protected buildSearchUrl(query: string): string {
    return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
  }

  protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    await page.waitForSelector('#b_results', { timeout: 10000 });

    const results = await page.$$eval('.b_algo', (elements) => {
      return elements.map(el => {
        const titleEl = el.querySelector('h2');
        const linkEl = el.querySelector('a');
        const descEl = el.querySelector('.b_caption p');
        const sourceEl = el.querySelector('.b_tpcn');

        return {
          title: titleEl?.textContent?.trim() || '',
          url: linkEl?.getAttribute('href') || '',
          description: descEl?.textContent?.trim() || '',
          source: sourceEl?.textContent?.trim() || '',
          engine: 'bing'
        };
      }).filter(result => result.url.startsWith('http'));
    });

    return results.slice(0, limit);
  }
}

export const bingEngine = new BingEngine();
```

**Reduction:** 200 lines → 40 lines (80% less code)

---

## Sign-off

**Prepared by:** Claude Code
**Document Type:** Product Requirements Document (v2.0 Complete Rewrite)
**Status:** Awaiting Approval

**Next Steps:**
1. Review and approve PRD
2. Begin Phase 1 implementation (Foundation)
3. Weekly check-ins on progress
4. Adjust timeline as needed

**Approval:**
- [ ] Architecture approved
- [ ] Scope approved (removed features acceptable)
- [ ] Timeline approved
- [ ] Ready to begin implementation
