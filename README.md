<div align="center">

# Open-WebSearch v2.0 MCP Server

> **Note:** This is a fork of the original [Aas-ee/open-webSearch](https://github.com/Aas-ee/open-webSearch) project.

[![ModelScope](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Aas-ee/3af09e0f4c7821fb2e9acb96483a5ff0/raw/badge.json&color=%23de5a16)](https://www.modelscope.cn/mcp/servers/Aasee1/open-webSearch)
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/Aas-ee/open-webSearch)](https://archestra.ai/mcp-catalog/aas-ee__open-websearch)
[![smithery badge](https://smithery.ai/badge/@Aas-ee/open-websearch)](https://smithery.ai/server/@Aas-ee/open-websearch)
![Version](https://img.shields.io/github/v/release/evanlouie/open-websearch)
![License](https://img.shields.io/github/license/evanlouie/open-websearch)
![Issues](https://img.shields.io/github/issues/evanlouie/open-websearch)

</div>

Multi-engine web search MCP server using Playwright browser automation - zero API keys required. Built with Bun runtime and TypeScript, featuring comprehensive test coverage (103 tests) and strict type safety.

---

## ⚠️ Breaking Changes (v2.0)

**v2.0 is a complete architectural rewrite.** See [Migration Guide](docs/migration-v1-to-v2.md) for full details.

### Major Changes

**Removed Features:**
- ❌ **Docker support** - Local-first design, use `bunx` instead
- ❌ **Article fetchers** - Use [markitdown MCP](https://github.com/microsoft/markitdown) instead
- ❌ **HTTP proxy support** - May return in v2.1+ based on demand
- ❌ **5 search engines** removed - baidu, csdn, linuxdo, juejin, zhihu (focus on quality over quantity)

**New Features:**
- ✅ **Google search support** - With CAPTCHA detection and error handling
- ✅ **Playwright browser automation** - Built-in stealth mode for better bot evasion
- ✅ **Class-based architecture** - `BaseEngine` pattern makes adding engines easy (<30 min, <50 lines)
- ✅ **Comprehensive testing** - 103 tests (unit, integration, e2e, performance)
- ✅ **Simplified configuration** - Only 2 env vars needed (PORT, MODE)

**Changed:**
- 🔄 Search implementation: axios/cheerio → Playwright
- 🔄 Project structure: nested → flat
- 🔄 Engine count: 9 → 4 (bing, duckduckgo, brave, google)

---

## Features

- **4 High-Quality Search Engines**
  - **Bing** - Reliable, fast, best overall
  - **DuckDuckGo** - Privacy-focused
  - **Brave** - Independent index
  - **Google** - Best results, but aggressive bot detection (experimental)

- **Modern Architecture**
  - Playwright browser automation with stealth mode
  - Class-based engine pattern (easy to extend)
  - Browser pooling for performance (shared, pool, per-search modes)
  - TypeScript strict mode with zero suppressions

- **Comprehensive Testing**
  - 103 tests: 54 unit, 20 integration, 11 e2e, 6 performance, 12 browser pool
  - Automated test suite with Bun test framework
  - Performance benchmarks (cold start <4s, warm search <2s)

- **Multiple Transport Modes**
  - HTTP (StreamableHTTP + SSE endpoints)
  - STDIO (command-line integration)
  - Both modes simultaneously

- **Zero API Keys Required**
  - No authentication needed
  - No rate limits (beyond search engine policies)
  - Free forever

---

## Installation

### Prerequisites

**Required:**
- [Bun](https://bun.sh) runtime (v1.0+)
- Playwright Chromium browser

**Install Playwright browsers (one-time setup):**
```bash
bunx playwright install chromium
```

This downloads ~280MB of browser binaries to `~/.cache/ms-playwright/`.

### Quick Start (Recommended)

Run directly from GitHub using `bunx`:

```bash
# Basic usage (STDIO mode)
bunx github:evanlouie/open-websearch

# With environment variables (Linux/macOS)
MODE=http PORT=3000 bunx github:evanlouie/open-websearch

# Windows PowerShell
$env:MODE="http"; $env:PORT="3000"; bunx github:evanlouie/open-websearch
```

### Local Installation

1. Clone the repository:
```bash
git clone https://github.com/evanlouie/open-websearch.git
cd open-websearch
```

2. Install dependencies:
```bash
bun install
```

3. Install Playwright browsers:
```bash
bunx playwright install chromium
```

4. Run the server:
```bash
# STDIO mode (for MCP clients)
bun start

# HTTP mode (for API access)
MODE=http bun start

# Both modes
MODE=both bun start
```

---

## Configuration

### Environment Variables

| Variable | Default | Options | Description |
|----------|---------|---------|-------------|
| `MODE` | `both` | `stdio`, `http`, `both` | Server transport mode |
| `PORT` | `3000` | 0-65535 | HTTP server port (0 = auto-assign) |

**v2.0 removed variables:**
- ❌ `DEFAULT_SEARCH_ENGINE` - Use `engines` parameter in search tool
- ❌ `ALLOWED_SEARCH_ENGINES` - All engines always available
- ❌ `USE_PROXY` / `PROXY_URL` - Proxy support removed
- ❌ `ENABLE_CORS` / `CORS_ORIGIN` - CORS always enabled in HTTP mode

### Browser Configuration

Browser settings are hard-coded for simplicity (may be configurable in v2.1+):
- **Mode:** `shared` (single browser page reused across searches)
- **Headless:** `true`
- **Timeout:** 30 seconds
- **Stealth:** Always enabled

---

## MCP Client Configuration

### Claude Desktop

Add to `claude_desktop_config.json`:

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

### Cherry Studio

**STDIO Configuration:**
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

**HTTP Configuration (StreamableHTTP):**
```json
{
  "mcpServers": {
    "web-search": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search (Bing, DuckDuckGo, Brave, Google)",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    }
  }
}
```

### VSCode (Claude Dev Extension)

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

**Local Development (Windows):**
```json
{
  "mcpServers": {
    "web-search": {
      "command": "bun",
      "args": ["C:/path/to/open-websearch/src/index.ts"],
      "env": {
        "MODE": "stdio"
      }
    }
  }
}
```

---

## Usage

### Search Tool

The server provides a single `search` tool for multi-engine web search.

**Parameters:**
```typescript
{
  "query": string,        // Search query (required)
  "limit": number,        // Max results to return (default: 10, max: 50)
  "engines": string[]     // Engines to use (default: ["bing"])
}
```

**Available engines:**
- `"bing"` - Bing search (recommended, most reliable)
- `"duckduckgo"` - DuckDuckGo search
- `"brave"` - Brave search
- `"google"` - Google search (experimental, may hit CAPTCHA)

**Example: Single Engine**
```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "playwright web scraping",
    limit: 10,
    engines: ["bing"]
  }
})
```

**Example: Multiple Engines**
```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "best web scraping libraries",
    limit: 15,
    engines: ["bing", "duckduckgo", "brave"]
  }
})
```

**Response Format:**
```json
{
  "query": "playwright web scraping",
  "engines": ["bing"],
  "totalResults": 10,
  "results": [
    {
      "title": "Playwright: Fast and reliable end-to-end testing",
      "url": "https://playwright.dev",
      "description": "Playwright enables reliable end-to-end testing...",
      "source": "playwright.dev",
      "engine": "bing"
    }
  ]
}
```

### Error Handling

**Google CAPTCHA Detection:**
```json
{
  "error": "Google search blocked by CAPTCHA. Try using bing, duckduckgo, or brave instead."
}
```

**Network Errors:**
```json
{
  "error": "Search failed: Timeout waiting for search results"
}
```

---

## Performance

Based on benchmarks from 103 automated tests:

| Metric | Target | Typical |
|--------|--------|---------|
| **Cold Start** | <4s | ~3.2s |
| **Warm Search** | <2s | ~1.5s |
| **Concurrent (5)** | <15s | ~12s |
| **Browser Init** | <3s | ~2.1s |

**Performance Tips:**
- First search is slower (browser initialization)
- Subsequent searches reuse browser (much faster)
- Concurrent searches handled via browser pooling

---

## Development

### Setup

```bash
# Clone and install
git clone https://github.com/evanlouie/open-websearch.git
cd open-websearch
bun install
bunx playwright install chromium

# Run in development mode
bun dev

# Run tests
bun test                  # All tests
bun test:unit             # Unit tests only
bun test:integration      # Integration tests
bun test:e2e              # E2E tests (real searches)
bun test:performance      # Performance benchmarks

# Type checking (strict mode)
bun run typecheck

# MCP inspector (testing tool)
bun inspector
```

### Adding a New Search Engine

See [Adding Engines Guide](docs/adding-engines.md) for step-by-step instructions.

**Quick Overview:**
1. Create `src/engines/example.ts`
2. Extend `BaseEngine` class
3. Implement `buildSearchUrl()` and `extractResults()`
4. Register in `src/tools/setupTools.ts`
5. Add tests

**Time estimate:** <30 minutes
**Code estimate:** <50 lines

**Example:**
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
    await page.waitForSelector('.result');
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

export const exampleEngine = new ExampleEngine();
```

### Project Structure

```
src/
├── index.ts                    # Entry point
├── server.ts                   # MCP server setup
├── config.ts                   # Configuration (PORT, MODE)
├── types.ts                    # Core interfaces
├── browser/
│   ├── BrowserPool.ts          # Browser lifecycle management
│   └── stealth.ts              # Stealth configuration
├── engines/
│   ├── BaseEngine.ts           # Abstract base class
│   ├── bing.ts                 # Bing implementation (~40 lines)
│   ├── duckduckgo.ts           # DuckDuckGo implementation
│   ├── brave.ts                # Brave implementation
│   └── google.ts               # Google implementation
├── tools/
│   └── setupTools.ts           # MCP search tool registration
└── __tests__/
    ├── unit/                   # 54 unit tests
    ├── integration/            # 20 integration tests
    ├── e2e/                    # 11 e2e tests
    └── performance/            # 6 performance tests
```

### Development Requirements

All code must maintain:
- ✅ Zero TypeScript errors in strict mode (`bun run typecheck`)
- ✅ All tests passing (`bun test`)
- ✅ No `any` types in source code
- ✅ No TypeScript suppressions (`@ts-ignore`, etc.)

---

## Troubleshooting

### "Playwright browser not found"

```bash
# Install Playwright browsers
bunx playwright install chromium
```

### "Search timeout after 30 seconds"

- Check internet connection
- Try a different search engine (Google is most likely to block)
- Increase timeout in `src/browser/BrowserPool.ts` (may require fork)

### "Google CAPTCHA detected"

Google aggressively blocks automated requests. Solutions:
- Use `bing`, `duckduckgo`, or `brave` instead (recommended)
- Google search is marked experimental for this reason

### Tests failing

```bash
# Run only fast tests (unit + integration)
bun test src/__tests__/unit src/__tests__/integration

# E2E tests may fail due to network issues or bot detection
bun test:e2e

# Performance tests are slower
bun test:performance
```

---

## Contributing

Contributions welcome! See [Adding Engines Guide](docs/adding-engines.md) for details.

**Development workflow:**
1. Fork the repository
2. Create a feature branch
3. Make changes (maintain TypeScript strict mode)
4. Run `bun run typecheck` and `bun test`
5. Submit a pull request

**Areas for contribution:**
- Additional search engines (Yahoo, Startpage, Ecosia)
- Improved stealth techniques
- Performance optimizations
- Documentation improvements

---

## Limitations

Since this tool uses browser automation for scraping:

1. **Rate Limiting**
   - Search engines may temporarily block requests if too many searches are made
   - Recommendation: Maintain reasonable search frequency

2. **Bot Detection**
   - Google has aggressive bot detection (may require CAPTCHA)
   - Stealth mode helps but is not foolproof
   - Use Bing/DuckDuckGo for most reliable results

3. **Maintenance**
   - HTML structure changes in search engines will break extractors
   - CSS selectors may need updates over time
   - E2E tests help catch breakages quickly

4. **Legal/ToS**
   - This tool is for personal use only
   - Comply with search engine Terms of Service
   - Implement rate limiting based on your use case

---

## Migration from v1.x

See [Migration Guide](docs/migration-v1-to-v2.md) for detailed instructions.

**Quick summary:**
- **Docker users:** Switch to `bunx github:evanlouie/open-websearch`
- **Article fetcher users:** Use [markitdown MCP](https://github.com/microsoft/markitdown)
- **Proxy users:** Stay on v1.x or contribute proxy support to v2.x
- **Removed engine users:** Stay on v1.x or contribute engine implementations

---

<div align="center">

## Star History

If you find this project helpful, please consider giving it a ⭐ Star!

[![Star History Chart](https://api.star-history.com/svg?repos=evanlouie/open-websearch&type=Date)](https://www.star-history.com/#evanlouie/open-websearch&Date)

</div>

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Original project: [Aas-ee/open-webSearch](https://github.com/Aas-ee/open-webSearch)
- Built with [Playwright](https://playwright.dev)
- Powered by [Bun](https://bun.sh)
- MCP protocol by [Anthropic](https://modelcontextprotocol.io)
