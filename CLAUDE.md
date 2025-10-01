# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Open-WebSearch v2.0** is a Model Context Protocol (MCP) server that provides multi-engine web search capabilities without requiring API keys. It uses Playwright browser automation for scraping search results from Bing, DuckDuckGo, Brave, and Google.

**Repository:** https://github.com/evanlouie/open-websearch (fork of Aas-ee/open-webSearch)

**Architecture:** v2.0 uses Playwright-based browser automation with a class-based engine pattern (`BaseEngine`). This is a complete rewrite from v1.x which used axios + cheerio.

**Key Differences from v1.x:**
- ❌ Removed: Docker, article fetchers, proxy support, 5 engines (baidu, csdn, linuxdo, juejin, zhihu)
- ✅ Added: Google search, Playwright stealth mode, BaseEngine pattern, comprehensive testing (103 tests)

---

## Common Development Commands

**Note:** This project uses Bun runtime and executes TypeScript directly without a compilation step.

### Build and Development

```bash
# Install dependencies
bun install

# Install Playwright browsers (required first-time setup)
bunx playwright install chromium

# Start the server (STDIO mode)
bun start

# Development mode
bun dev

# Run MCP inspector for testing
bun inspector

# Type checking (TypeScript strict mode)
bun run typecheck
```

### Testing

```bash
# Run all tests
bun test

# Run specific test suites
bun test:unit             # 54 unit tests (fast)
bun test:integration      # 20 integration tests (fast)
bun test:e2e              # 11 e2e tests (slow, real searches)
bun test:performance      # 6 performance benchmarks (slow)

# Run only fast tests (unit + integration)
bun test src/__tests__/unit src/__tests__/integration

# Watch mode
bun test:watch
```

### Running Different Transport Modes

```bash
# STDIO mode (for MCP clients)
bun start

# HTTP mode (for API access)
MODE=http bun start

# Both modes simultaneously
MODE=both bun start
```

### bunx Usage (for testing as end user)

```bash
# Basic usage (STDIO mode)
bunx github:evanlouie/open-websearch

# With environment variables
MODE=http PORT=3000 bunx github:evanlouie/open-websearch
```

---

## Architecture

### Transport Modes

The server supports three operational modes via the `MODE` environment variable:
- **`both`** (default): Runs both HTTP server and STDIO transport
- **`http`**: HTTP server only (SSE and StreamableHTTP endpoints)
- **`stdio`**: STDIO transport only (for direct process communication)

### Entry Point

- **`src/index.ts`**: Main server initialization (thin entry point)
  - Creates MCP server using `createMcpServer()` from server.ts
  - Configures STDIO transport if enabled
  - Creates HTTP server using `createHttpServer()` if enabled
  - Manages server startup based on MODE environment variable
  - Implements graceful shutdown with browser pool cleanup

### Configuration System

- **`src/config.ts`**: Minimal configuration via environment variables
  - Server mode (HTTP, STDIO, or both)
  - HTTP server port

**v2.0 Configuration Variables:**
- `MODE`: Server mode (`both`, `http`, `stdio`) - default: `both`
- `PORT`: HTTP server port (default: `3000`, use `0` for auto-assign)

**Removed from v1.x:**
- ❌ `DEFAULT_SEARCH_ENGINE` - Use `engines` parameter in search tool
- ❌ `ALLOWED_SEARCH_ENGINES` - All engines always available
- ❌ `USE_PROXY` / `PROXY_URL` - Proxy support removed
- ❌ `ENABLE_CORS` / `CORS_ORIGIN` - CORS always enabled in HTTP mode

### MCP Tools Registration

- **`src/tools/setupTools.ts`**: Registers MCP tools with the server
  - `search`: Multi-engine web search (only tool in v2.0)
  - Handles search result distribution across multiple engines
  - Implements error handling for CAPTCHA detection and network failures

**Removed from v1.x:**
- ❌ `fetchLinuxDoArticle` - Article fetching removed
- ❌ `fetchCsdnArticle` - Article fetching removed
- ❌ `fetchGithubReadme` - Article fetching removed
- ❌ `fetchJuejinArticle` - Article fetching removed

### Search Engine Architecture (v2.0)

**Class-based pattern using BaseEngine:**

Each search engine extends the `BaseEngine` abstract class and implements two methods:
1. **`buildSearchUrl(query: string): string`** - Constructs the search URL
2. **`extractResults(page: Page, limit: number): Promise<SearchResult[]>`** - Extracts results from page

All engines are in `src/engines/` directory (flat structure, not nested):
- **`BaseEngine.ts`**: Abstract base class with template method pattern
- **`bing.ts`**: Bing implementation (~40 lines)
- **`duckduckgo.ts`**: DuckDuckGo implementation
- **`brave.ts`**: Brave implementation
- **`google.ts`**: Google implementation (includes CAPTCHA detection)

**Engine Implementation Pattern:**
```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class ExampleEngine extends BaseEngine {
    readonly name = 'example';
    readonly baseUrl = 'https://example.com';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        await page.waitForSelector('.result', { timeout: 10000 });

        const results = await page.$$eval('.result', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('.title')?.textContent?.trim() || '',
                url: el.querySelector('a')?.getAttribute('href') || '',
                description: el.querySelector('.desc')?.textContent?.trim() || '',
                source: el.querySelector('.source')?.textContent?.trim() || '',
                engine: 'example'
            })).filter(r => r.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

// Export singleton instance
export const exampleEngine = new ExampleEngine();
```

**Key Features:**
- Playwright page automation for browser-like behavior
- Stealth configuration applied automatically (via `BaseEngine.search()`)
- Browser pool management handles page lifecycle
- CSS selectors used for result extraction (no cheerio)
- Template method pattern provides consistent search flow

### Browser Pool Architecture

- **`src/browser/BrowserPool.ts`**: Browser lifecycle management
  - Singleton pattern with configurable modes
  - **Modes:**
    - `shared` (default): Single page reused across all searches (fastest)
    - `pool`: Maintain pool of pages (balanced performance/isolation)
    - `per-search`: New page for every search (maximum isolation)
  - Handles browser crashes and reconnection
  - Automatic cleanup on page release

- **`src/browser/stealth.ts`**: Stealth configuration
  - Applies stealth techniques to evade bot detection
  - User agent randomization
  - Viewport size randomization
  - WebGL vendor/renderer spoofing
  - Browser fingerprint modifications

### Type Definitions

- **`src/types.ts`**: Core TypeScript interfaces
  - `SearchResult`: Standard search result format
    ```typescript
    interface SearchResult {
      title: string;
      url: string;
      description: string;
      source: string;        // Domain name
      engine: string;        // Engine that produced this result
      publishDate?: string;  // ISO 8601 format
      author?: string;
      language?: string;
    }
    ```
  - `SearchEngine`: Interface that all engines implement
    ```typescript
    interface SearchEngine {
      readonly name: string;
      readonly baseUrl: string;
      search(query: string, limit: number): Promise<SearchResult[]>;
      healthCheck(): Promise<boolean>;
    }
    ```
  - `BrowserPoolConfig`: Configuration for browser pool
  - `BrowserMode`: Type for browser modes (`'shared' | 'pool' | 'per-search'`)

### HTTP Server Architecture

HTTP server implementation is split across:
- **`src/server.ts`**: Server creation and configuration (exported for testing)
  - `createMcpServer()`: Creates and configures MCP server with tools
  - `createHttpServer()`: Creates HTTP server with transport handlers
  - Helper functions: `parseBody()`, `addCorsHeaders()`
- **`src/index.ts`**: Main entry point that uses server.ts exports

When HTTP mode is enabled:
- Uses Node.js `http.createServer()` from `node:http` module
  - Fully compatible with Bun runtime (Bun implements node:http natively)
  - No Express dependency - uses native Node.js HTTP APIs
  - Better performance and smaller dependency footprint
- **StreamableHTTP transport** (`/mcp` endpoint): Modern MCP protocol with session management
- **SSE transport** (`/sse` and `/messages` endpoints): Legacy support for older MCP clients
- Session management tracks transports by session ID
- CORS enabled by default (no configuration needed)
- All MCP SDK transports receive native `IncomingMessage`/`ServerResponse` objects

---

## Adding a New Search Engine

**Time estimate:** <30 minutes
**Code estimate:** <50 lines

### Step-by-Step Guide

1. **Create engine file:** `src/engines/[engine-name].ts`

2. **Implement class extending BaseEngine:**
   ```typescript
   import { Page } from 'playwright';
   import { BaseEngine } from './BaseEngine.js';
   import { SearchResult } from '../types.js';

   export class YourEngine extends BaseEngine {
       readonly name = 'yourengine';
       readonly baseUrl = 'https://yourengine.com';

       protected buildSearchUrl(query: string): string {
           return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
       }

       protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
           // Wait for results to load
           await page.waitForSelector('.result-selector', { timeout: 10000 });

           // Extract results using page.$$eval
           const results = await page.$$eval('.result-selector', (elements) => {
               return elements.map(el => ({
                   title: el.querySelector('.title')?.textContent?.trim() || '',
                   url: el.querySelector('a')?.getAttribute('href') || '',
                   description: el.querySelector('.description')?.textContent?.trim() || '',
                   source: el.querySelector('.source')?.textContent?.trim() || '',
                   engine: 'yourengine'
               })).filter(result => result.url.startsWith('http'));
           });

           return results.slice(0, limit);
       }
   }

   // Export singleton instance
   export const yourEngine = new YourEngine();
   ```

3. **Register engine in `src/tools/setupTools.ts`:**
   - Add import: `import { yourEngine } from '../engines/yourengine.js';`
   - Add to `engineMap`:
     ```typescript
     const engineMap = {
         // ... existing engines
         yourengine: yourEngine,
     };
     ```
   - Update Zod schema to include new engine:
     ```typescript
     engines: z.array(z.enum(['bing', 'duckduckgo', 'brave', 'google', 'yourengine']))
     ```

4. **Create tests:**
   - Unit tests: `src/__tests__/unit/engines/yourengine.test.ts`
   - E2E test: Add to `src/__tests__/e2e/search.test.ts`
   - See existing engine tests for examples

5. **Update documentation:**
   - Add engine to README.md engine list
   - Update this file (CLAUDE.md)

### CSS Selector Discovery

Use browser DevTools to find CSS selectors:

1. Open the search engine in a browser
2. Perform a test search
3. Open DevTools (F12)
4. Inspect a search result element
5. Find unique selectors for title, URL, description, source
6. Test selectors in console: `document.querySelectorAll('.your-selector')`

**Tips:**
- Prefer class selectors over IDs (more stable)
- Avoid overly specific selectors (brittle)
- Test selectors with multiple queries
- Use `page.$$eval()` for extracting multiple elements
- Filter results to ensure valid HTTP URLs

---

## Testing

### Test Organization

The project has comprehensive test coverage (103 tests):

```
src/__tests__/
├── unit/                    # 54 unit tests
│   ├── browser/             # BrowserPool tests (12 tests)
│   │   └── BrowserPool.test.ts
│   └── engines/             # Engine tests (42 tests)
│       ├── BaseEngine.test.ts      # 12 tests
│       ├── bing.test.ts            # 7 tests
│       ├── duckduckgo.test.ts      # 7 tests
│       ├── brave.test.ts           # 7 tests
│       └── google.test.ts          # 7 tests
├── integration/             # 20 integration tests
│   ├── mcp-server.test.ts   # MCP server integration (4 tests)
│   └── http-server.test.ts  # HTTP endpoints, CORS, sessions (16 tests)
├── e2e/                     # 11 e2e tests
│   └── search.test.ts       # Real search scenarios (Bing, DDG, Brave, Google)
└── performance/             # 6 performance tests
    └── benchmarks.test.ts   # Cold start, warm search, concurrent
```

### Unit Tests

Unit tests verify individual components in isolation:

**What to test:**
- Engine URL building (buildSearchUrl)
- Engine configuration (name, baseUrl)
- Interface compliance (methods exist)
- Browser pool modes (shared, pool, per-search)
- Stealth configuration

**Example:**
```typescript
import { describe, test, expect } from 'bun:test';
import { yourEngine } from '../../engines/yourengine.js';

describe('YourEngine', () => {
    test('has correct name', () => {
        expect(yourEngine.name).toBe('yourengine');
    });

    test('builds correct search URL', () => {
        const url = (yourEngine as any).buildSearchUrl('test query');
        expect(url).toBe('https://yourengine.com/search?q=test%20query');
    });

    test('implements SearchEngine interface', () => {
        expect(typeof yourEngine.search).toBe('function');
        expect(typeof yourEngine.healthCheck).toBe('function');
    });
});
```

### Integration Tests

Integration tests verify MCP server and HTTP server functionality:

**What to test:**
- Tool registration
- Search tool execution
- Multi-engine search
- Error handling
- HTTP endpoints (StreamableHTTP, SSE)
- CORS headers
- Session management

### E2E Tests

E2E tests make real network requests to search engines:

**What to test:**
- Real search queries return results
- Result structure is correct
- Multi-engine searches work
- Concurrent searches work
- Error handling (empty queries, CAPTCHA)

**Note:** E2E tests are slower and may occasionally fail due to network issues or bot detection.

### Performance Tests

Performance tests establish benchmarks:

**Benchmarks:**
- Cold start search: <4 seconds
- Warm search: <2 seconds
- Concurrent searches (5): <15 seconds
- Engine comparison across all engines

### Development Workflow

**IMPORTANT:** After making any code changes:

1. **Type check:** Run `bun run typecheck` to ensure TypeScript strict mode compliance
2. **Test:** Run `bun test` (or fast suite: `bun test src/__tests__/unit src/__tests__/integration`)
3. **Manual test:** Use `bun inspector` to test MCP tool manually if needed

The project MUST maintain:
- ✅ Zero TypeScript errors in strict mode (`strict: true` in tsconfig.json)
- ✅ Zero `any` types in source code (use `unknown`, proper interfaces, or type guards)
- ✅ Zero TypeScript suppressions (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`)
- ✅ All unit and integration tests passing

**Type Safety Guidelines:**
- Use proper interfaces for Page, Browser, BrowserContext from Playwright
- Use `SearchResult` type for all search results
- Use `unknown` for JSON parsing results, not `any`
- Use `error instanceof Error` checks in catch blocks
- Define interfaces for external API responses if needed

---

## Important Notes

### Browser Automation Limitations

- **Bot Detection:** Search engines (especially Google) use bot detection. Stealth mode helps but is not foolproof.
- **CAPTCHA:** Google may show CAPTCHA. The engine detects this and throws an error with a helpful message.
- **Rate Limiting:** Search engines may block requests if too many searches are made in a short time.
- **Selector Changes:** HTML structure changes in search engines will break extractors. E2E tests help catch this.

### Performance Characteristics

- **Cold Start:** First search is slower (~3-4s) due to browser initialization
- **Warm Searches:** Subsequent searches are faster (~1-2s) due to browser reuse
- **Browser Pool Modes:**
  - `shared`: Fastest, lowest memory, potential state leakage
  - `pool`: Balanced performance and isolation
  - `per-search`: Slowest, highest memory, maximum isolation

### Session Management

- StreamableHTTP transport uses session IDs to maintain state
- Sessions are stored in memory (not persistent)
- Cleanup happens on transport close
- Browser pool is shared across all sessions

### Development Best Practices

- Never log to stdout (breaks MCP STDIO transport). Use `console.error()` for logging.
- Always clean up browser pages (use `try-finally` with `browserPool.releasePage()`)
- Use `page.waitForSelector()` with timeout to wait for dynamic content
- Filter results to ensure URLs start with `http` (exclude relative URLs, mailto:, etc.)
- Implement CAPTCHA detection where applicable (e.g., Google)
- Add healthCheck timeout to prevent hanging (5 seconds recommended)

---

## Troubleshooting

### Common Issues

**"Playwright browser not found"**
```bash
bunx playwright install chromium
```

**"Tests timing out"**
- Increase timeout in test: `{ timeout: 15000 }`
- Check internet connection
- Try different search engine

**"Google CAPTCHA detected"**
- This is expected behavior
- Use Bing, DuckDuckGo, or Brave instead
- Google search is marked experimental for this reason

**"TypeScript errors"**
```bash
# Check for errors
bun run typecheck

# Common fixes:
# - Add proper type annotations
# - Use interfaces instead of 'any'
# - Import types from Playwright: import { Page } from 'playwright';
```

---

## Migration from v1.x

v2.0 is a complete rewrite with breaking changes. See [Migration Guide](docs/migration-v1-to-v2.md) for details.

**Key architectural changes:**
- axios/cheerio → Playwright browser automation
- Flat structure → Class-based BaseEngine pattern
- 9 engines → 4 engines (focus on quality)
- Article fetchers removed (use markitdown MCP instead)
- Docker removed (bunx recommended)
- Proxy removed (may return in v2.1+)
- 10+ env vars → 2 env vars (MODE, PORT)

---

## Additional Resources

- **PRD:** `docs/playwright-migration-prd.md` - Complete v2.0 architecture documentation
- **Migration Guide:** `docs/migration-v1-to-v2.md` - v1.x to v2.0 migration
- **Adding Engines:** `docs/adding-engines.md` - Step-by-step engine implementation guide
- **Playwright Docs:** https://playwright.dev - Browser automation reference
- **MCP Docs:** https://modelcontextprotocol.io - MCP protocol specification
