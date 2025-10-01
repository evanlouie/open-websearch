# Migration Guide: v1.x → v2.0

This guide helps you migrate from Open-WebSearch v1.x to v2.0.

---

## Overview

v2.0 is a **complete architectural rewrite** of Open-WebSearch with breaking changes. The focus has shifted from "quantity of features" to "quality and maintainability."

**TL;DR:**
- axios/cheerio → Playwright browser automation
- Docker → bunx (local-first)
- 9 engines → 4 engines (higher quality)
- Article fetchers → Use markitdown MCP instead
- Proxy support → Removed (may return in v2.1+)
- 10+ env vars → 2 env vars (MODE, PORT)

---

## Breaking Changes Summary

### Removed Features

| Feature | v1.x | v2.0 | Migration Path |
|---------|------|------|----------------|
| **Docker Support** | ✅ Full support | ❌ Removed | Use `bunx github:evanlouie/open-websearch` |
| **Article Fetchers** | ✅ 4 fetchers | ❌ Removed | Use [markitdown MCP](https://github.com/microsoft/markitdown) |
| **HTTP Proxy** | ✅ Full support | ❌ Removed | Stay on v1.x or contribute to v2.x |
| **Search Engines** | ✅ 9 engines | ✅ 4 engines | See engine table below |
| **Environment Config** | ✅ 10+ variables | ✅ 2 variables | See config migration below |

### Search Engine Changes

| Engine | v1.x | v2.0 | Notes |
|--------|------|------|-------|
| **Bing** | ✅ | ✅ | Still supported, most reliable |
| **DuckDuckGo** | ✅ | ✅ | Still supported |
| **Brave** | ✅ | ✅ | Still supported |
| **Google** | ❌ | ✅ | NEW! But experimental (CAPTCHA issues) |
| **Baidu** | ✅ | ❌ | Removed |
| **CSDN** | ✅ | ❌ | Removed |
| **Linux.do** | ✅ | ❌ | Removed |
| **Juejin** | ✅ | ❌ | Removed |
| **Zhihu** | ✅ | ❌ | Removed |
| **Exa** | ✅ | ❌ | Removed |

### New Features

| Feature | Description |
|---------|-------------|
| **Google Search** | Now supported with CAPTCHA detection |
| **Playwright Stealth** | Built-in bot detection evasion |
| **BaseEngine Pattern** | Easy to add new engines (<30 min, <50 lines) |
| **Comprehensive Testing** | 103 tests (unit, integration, e2e, performance) |
| **TypeScript Strict Mode** | Zero errors, zero suppressions, zero `any` types |

---

## Architecture Changes

### Scraping Implementation

**v1.x:**
```typescript
// axios + cheerio approach
import axios from 'axios';
import * as cheerio from 'cheerio';

const response = await axios.get(url, { headers: {...} });
const $ = cheerio.load(response.data);
const results = $('.result').map((i, el) => ({
  title: $(el).find('.title').text(),
  // ...
}));
```

**v2.0:**
```typescript
// Playwright approach
import { Page } from 'playwright';

const page = await browserPool.getPage();
await page.goto(url);
const results = await page.$$eval('.result', (elements) => {
  return elements.map(el => ({
    title: el.querySelector('.title')?.textContent?.trim() || '',
    // ...
  }));
});
```

**Benefits:**
- ✅ No manual header/cookie maintenance (Playwright handles it)
- ✅ JavaScript-rendered content works automatically
- ✅ Better bot detection evasion (stealth mode)
- ✅ Browser automation closer to real user behavior

### Project Structure

**v1.x:**
```
src/engines/
├── bing/
│   ├── bing.ts           # 200+ lines
│   └── index.ts
├── baidu/
│   ├── baidu.ts
│   └── index.ts
├── csdn/
│   ├── csdn.ts
│   ├── fetchCsdnArticle.ts
│   └── index.ts
...
```

**v2.0:**
```
src/engines/
├── BaseEngine.ts         # Abstract base class
├── bing.ts               # ~40 lines
├── duckduckgo.ts         # ~40 lines
├── brave.ts              # ~40 lines
└── google.ts             # ~50 lines
```

**Benefits:**
- ✅ Flat structure (easier to navigate)
- ✅ Shared abstractions (BaseEngine)
- ✅ 80% less code per engine
- ✅ Consistent patterns across all engines

### Configuration

**v1.x Environment Variables:**
```bash
DEFAULT_SEARCH_ENGINE=bing
ALLOWED_SEARCH_ENGINES=bing,duckduckgo,exa
USE_PROXY=true
PROXY_URL=http://127.0.0.1:7890
ENABLE_CORS=true
CORS_ORIGIN=*
MODE=both
PORT=3000
```

**v2.0 Environment Variables:**
```bash
MODE=both    # Only 2 variables needed!
PORT=3000
```

**What Changed:**
- ❌ `DEFAULT_SEARCH_ENGINE` → Use `engines` parameter in MCP search tool
- ❌ `ALLOWED_SEARCH_ENGINES` → All engines always available
- ❌ `USE_PROXY` / `PROXY_URL` → Proxy support removed
- ❌ `ENABLE_CORS` / `CORS_ORIGIN` → CORS always enabled in HTTP mode
- ✅ `MODE` → Still supported (stdio, http, both)
- ✅ `PORT` → Still supported

---

## Migration Scenarios

### Scenario 1: Using Docker

**v1.x Setup:**
```bash
docker run -d --name web-search -p 3000:3000 \
  -e ENABLE_CORS=true \
  -e DEFAULT_SEARCH_ENGINE=bing \
  ghcr.io/aas-ee/open-web-search:latest
```

**v2.0 Migration:**
```bash
# Stop using Docker, use bunx instead
bunx github:evanlouie/open-websearch

# Or run locally
git clone https://github.com/evanlouie/open-websearch.git
cd open-websearch
bun install
bunx playwright install chromium
bun start
```

**MCP Client Configuration (v1.x with Docker):**
```json
{
  "mcpServers": {
    "web-search": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    }
  }
}
```

**MCP Client Configuration (v2.0 with bunx):**
```json
{
  "mcpServers": {
    "web-search": {
      "command": "bunx",
      "args": ["github:evanlouie/open-websearch"],
      "env": {
        "MODE": "stdio"
      }
    }
  }
}
```

**Why this change?**
- Docker adds complexity for a local-first tool
- bunx is simpler: single command, no containers
- v2.0 focuses on local development machines

---

### Scenario 2: Using Article Fetchers

**v1.x Setup:**
```typescript
// Fetching CSDN article
use_mcp_tool({
  server_name: "web-search",
  tool_name: "fetchCsdnArticle",
  arguments: {
    url: "https://blog.csdn.net/xxx/article/details/xxx"
  }
})

// Fetching Juejin article
use_mcp_tool({
  server_name: "web-search",
  tool_name: "fetchJuejinArticle",
  arguments: {
    url: "https://juejin.cn/post/7520959840199360563"
  }
})
```

**v2.0 Migration:**
```bash
# Install markitdown MCP server
# https://github.com/microsoft/markitdown

# Configuration
{
  "mcpServers": {
    "web-search": {
      "command": "bunx",
      "args": ["github:evanlouie/open-websearch"]
    },
    "markitdown": {
      "command": "uvx",
      "args": ["markitdown-mcp"]
    }
  }
}
```

**New workflow:**
```typescript
// 1. Search for articles (using web-search)
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "playwright tutorial",
    engines: ["bing"]
  }
})

// 2. Fetch article content (using markitdown)
use_mcp_tool({
  server_name: "markitdown",
  tool_name: "convert",
  arguments: {
    url: "https://blog.csdn.net/xxx/article/details/xxx"
  }
})
```

**Why this change?**
- markitdown is a specialized tool for content extraction
- Supports more sites than v1.x article fetchers
- Separation of concerns (search vs. content extraction)
- Open-WebSearch v2.0 focuses on search quality

---

### Scenario 3: Using HTTP Proxy

**v1.x Setup:**
```bash
# With proxy support
USE_PROXY=true PROXY_URL=http://127.0.0.1:7890 bunx open-websearch@latest
```

**v2.0 Migration:**

**Option A: Stay on v1.x**
```bash
# If proxy is required, stay on v1.x
bunx open-websearch@1.x.x
```

**Option B: Contribute proxy support to v2.x**
- Fork the repository
- Add proxy support to `src/browser/BrowserPool.ts`
- Submit a pull request
- See [Adding Engines Guide](adding-engines.md) for development setup

**Why this change?**
- Proxy support adds complexity
- Most users run locally (no proxy needed)
- May return in v2.1+ based on community demand

---

### Scenario 4: Using Removed Search Engines

**v1.x Setup:**
```typescript
// Searching CSDN, Juejin, Baidu
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "typescript tutorial",
    engines: ["csdn", "juejin", "baidu"]
  }
})
```

**v2.0 Migration:**

**Option A: Use available engines**
```typescript
// Use bing, duckduckgo, brave, or google instead
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "typescript tutorial",
    engines: ["bing", "duckduckgo", "brave"]
  }
})
```

**Option B: Stay on v1.x**
```bash
# If you need csdn/juejin/baidu, stay on v1.x
bunx open-websearch@1.x.x
```

**Option C: Contribute engines to v2.x**
- See [Adding Engines Guide](adding-engines.md)
- Implement using BaseEngine pattern (~30 minutes, ~50 lines)
- Submit a pull request

**Why this change?**
- v2.0 focuses on quality over quantity
- 4 high-quality engines better than 9 mediocre ones
- Easy to add more engines (BaseEngine pattern)

---

## Environment Variable Migration

### Full Comparison

| Variable | v1.x | v2.0 | Migration |
|----------|------|------|-----------|
| `MODE` | ✅ `both`, `http`, `stdio` | ✅ Same | No change needed |
| `PORT` | ✅ `3000` | ✅ `3000` | No change needed |
| `DEFAULT_SEARCH_ENGINE` | ✅ `bing` | ❌ Removed | Use `engines` param in tool call |
| `ALLOWED_SEARCH_ENGINES` | ✅ Comma-separated | ❌ Removed | All engines always available |
| `USE_PROXY` | ✅ `true`/`false` | ❌ Removed | Stay on v1.x or fork |
| `PROXY_URL` | ✅ URL string | ❌ Removed | Stay on v1.x or fork |
| `ENABLE_CORS` | ✅ `true`/`false` | ❌ Removed | CORS always enabled in HTTP mode |
| `CORS_ORIGIN` | ✅ `*` or domain | ❌ Removed | Always `*` in v2.0 |

### Example Migrations

**v1.x Config:**
```bash
DEFAULT_SEARCH_ENGINE=duckduckgo
ALLOWED_SEARCH_ENGINES=bing,duckduckgo,exa
USE_PROXY=true
PROXY_URL=http://127.0.0.1:7890
ENABLE_CORS=true
CORS_ORIGIN=*
MODE=both
PORT=3000
```

**v2.0 Config:**
```bash
MODE=both
PORT=3000
```

**Search Tool Usage (v1.x → v2.0):**

```typescript
// v1.x: Uses DEFAULT_SEARCH_ENGINE
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "test"
  }
})
// Result: Uses "duckduckgo" (from DEFAULT_SEARCH_ENGINE)

// v2.0: Explicit engines parameter
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "test",
    engines: ["duckduckgo"]  // Must specify explicitly
  }
})
```

---

## MCP Tool API Changes

### Search Tool

**v1.x:**
```typescript
{
  query: string,
  limit?: number,           // default: 10
  engines?: string[]        // default: uses DEFAULT_SEARCH_ENGINE
}
```

**v2.0:**
```typescript
{
  query: string,
  limit?: number,           // default: 10, max: 50
  engines?: string[]        // default: ["bing"]
}
```

**Key Differences:**
- v1.x: `engines` defaults to `DEFAULT_SEARCH_ENGINE` env var
- v2.0: `engines` defaults to `["bing"]` (hardcoded)
- v2.0: `limit` has max of 50 (prevents abuse)

### Available Engines

**v1.x:**
```typescript
engines: ["bing", "baidu", "linuxdo", "csdn", "duckduckgo", "exa", "brave", "juejin"]
```

**v2.0:**
```typescript
engines: ["bing", "duckduckgo", "brave", "google"]
```

### Article Fetching Tools (Removed)

**v1.x:**
- `fetchLinuxDoArticle` ❌ Removed
- `fetchCsdnArticle` ❌ Removed
- `fetchGithubReadme` ❌ Removed
- `fetchJuejinArticle` ❌ Removed

**v2.0:**
- Use [markitdown MCP](https://github.com/microsoft/markitdown) instead

---

## Testing Your Migration

### 1. Basic Search Test

```typescript
// Test that basic search works
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "playwright",
    limit: 5,
    engines: ["bing"]
  }
})

// Expected: 5 search results from Bing
```

### 2. Multi-Engine Search Test

```typescript
// Test multi-engine search
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "typescript",
    limit: 10,
    engines: ["bing", "duckduckgo", "brave"]
  }
})

// Expected: Up to 10 results combined from all 3 engines
```

### 3. Google Search Test (Optional)

```typescript
// Test Google search (may hit CAPTCHA)
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "javascript",
    limit: 5,
    engines: ["google"]
  }
})

// Expected: Either 5 results OR CAPTCHA error (both are valid)
```

---

## Performance Comparison

### Cold Start (First Search)

| Metric | v1.x | v2.0 |
|--------|------|------|
| **Time to first result** | ~1-2s | ~3-4s |
| **Why slower?** | - | Browser initialization |

### Warm Searches (Subsequent)

| Metric | v1.x | v2.0 |
|--------|------|------|
| **Time to results** | ~1-2s | ~1-2s |
| **Why same?** | - | Browser reuse |

### Memory Usage

| Metric | v1.x | v2.0 |
|--------|------|------|
| **Baseline** | ~50 MB | ~150 MB |
| **Why higher?** | - | Chromium browser |

**Conclusion:**
- v2.0 is slightly slower on cold start (browser init)
- v2.0 has similar performance on warm searches
- v2.0 uses more memory (browser overhead)
- Trade-off: Better bot evasion, no header maintenance

---

## Troubleshooting

### "Playwright browser not found"

```bash
# Install Playwright browsers
bunx playwright install chromium
```

### "No such tool: fetchCsdnArticle"

v2.0 removed article fetchers. Use [markitdown MCP](https://github.com/microsoft/markitdown) instead.

### "Engine 'baidu' not found"

v2.0 only supports 4 engines: bing, duckduckgo, brave, google. Either:
- Use one of the 4 available engines
- Stay on v1.x
- Contribute the engine to v2.x

### "Docker image not found"

v2.0 removed Docker support. Use bunx instead:
```bash
bunx github:evanlouie/open-websearch
```

### "Proxy not working"

v2.0 removed proxy support. Either:
- Stay on v1.x
- Run without proxy (if possible)
- Contribute proxy support to v2.x

---

## When to Stay on v1.x

Consider staying on v1.x if you:
- ✅ Require Docker deployment
- ✅ Need HTTP proxy support
- ✅ Use removed search engines (baidu, csdn, juejin, etc.)
- ✅ Use article fetchers extensively
- ✅ Have strict memory constraints (<150 MB)

v1.x is still available:
```bash
bunx open-websearch@1.x.x
```

---

## When to Upgrade to v2.0

Consider upgrading to v2.0 if you:
- ✅ Want Google search support
- ✅ Value code quality and maintainability
- ✅ Need better bot detection evasion
- ✅ Want comprehensive test coverage
- ✅ Prefer simpler configuration (2 env vars vs 10+)
- ✅ Plan to contribute new engines

---

## Getting Help

- **Issues:** https://github.com/evanlouie/open-websearch/issues
- **PRD:** [`docs/playwright-migration-prd.md`](playwright-migration-prd.md)
- **Adding Engines:** [`docs/adding-engines.md`](adding-engines.md)
- **README:** [`README.md`](../README.md)

---

## Summary Checklist

- [ ] Decide if v2.0 meets your needs (see "When to Stay on v1.x")
- [ ] Install Playwright browsers (`bunx playwright install chromium`)
- [ ] Update MCP client configuration (bunx vs Docker)
- [ ] Update environment variables (remove old vars)
- [ ] Update search tool calls (explicit `engines` parameter)
- [ ] Replace article fetchers with markitdown MCP
- [ ] Test basic search functionality
- [ ] Test multi-engine searches
- [ ] Monitor performance (cold start may be slower)

---

**Welcome to v2.0! 🎉**

If you encounter any issues during migration, please [open an issue](https://github.com/evanlouie/open-websearch/issues).
