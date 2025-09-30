# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Open-WebSearch is a Model Context Protocol (MCP) server that provides multi-engine web search capabilities without requiring API keys. It scrapes search results from various engines (Bing, Baidu, DuckDuckGo, Exa, Brave, CSDN, Juejin) and provides article content fetching for specific platforms.

**Repository:** https://github.com/Aas-ee/open-webSearch

## Common Development Commands

**Note:** This project uses Bun runtime and executes TypeScript directly without a compilation step.

### Build and Development
```bash
# Install dependencies
bun install

# Start the server
bun start

# Development mode
bun dev

# Run MCP inspector for testing
bun inspector

# Type checking (TypeScript strict mode)
bun run typecheck

# Run tests
bun test
```

### Testing Different Modes
```bash
# Test STDIO mode
bun test:stdio

# Test HTTP mode
bun test:http

# Test both modes
bun test:both
```

### BUNX Usage (for testing as end user)
```bash
# Basic usage
bunx open-websearch@latest

# With environment variables
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true bunx open-websearch@latest
```

### Docker
```bash
# Build and run with Docker Compose
docker-compose up -d

# Build Docker image manually
docker build -t open-websearch .

# Run Docker container
docker run -d --name web-search -p 3000:3000 -e ENABLE_CORS=true ghcr.io/aas-ee/open-web-search:latest
```

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

### Configuration System
- **`src/config.ts`**: Centralized configuration via environment variables
  - Default search engine selection
  - Allowed search engines list (restricts which engines can be used)
  - Proxy configuration for restricted regions
  - CORS settings for HTTP server
  - Server mode (HTTP, STDIO, or both)

Key configuration variables:
- `DEFAULT_SEARCH_ENGINE`: Default engine (bing, duckduckgo, exa, brave, baidu, csdn, juejin)
- `ALLOWED_SEARCH_ENGINES`: Comma-separated list to restrict available engines
- `USE_PROXY`: Enable HTTP proxy
- `PROXY_URL`: Proxy server URL
- `ENABLE_CORS`: Enable CORS for HTTP server
- `MODE`: Server mode (both, http, stdio)
- `PORT`: HTTP server port (default: 3000)

### MCP Tools Registration
- **`src/tools/setupTools.ts`**: Registers all MCP tools with the server
  - `search`: Multi-engine web search
  - `fetchLinuxDoArticle`: Extract Linux.do forum articles
  - `fetchCsdnArticle`: Extract CSDN blog articles
  - `fetchGithubReadme`: Extract GitHub repository README files
  - `fetchJuejinArticle`: Extract Juejin (掘金) articles
  - Handles search result distribution across multiple engines
  - Validates URLs for article fetching tools

### Search Engine Architecture
Each search engine is implemented as a separate module in `src/engines/[engine-name]/`:
- **Search function**: Scrapes search results using axios + cheerio
- **Article fetching** (optional): Extracts full article content for specific platforms
- **index.ts**: Exports public API for the engine

Search engines use web scraping to extract structured data:
- Parse HTML using cheerio
- Extract titles, URLs, descriptions from search result pages
- Handle pagination when needed
- Return standardized `SearchResult` objects

### Type Definitions
- **`src/types.ts`**: Core TypeScript interfaces
  - `SearchResult`: Standard search result format with title, url, description, source, engine

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
- Manual CORS handling (no cors middleware needed)
- All MCP SDK transports receive native `IncomingMessage`/`ServerResponse` objects

## Adding a New Search Engine

1. Create directory: `src/engines/[engine-name]/`
2. Implement search function in `[engine-name].ts`:
   ```typescript
   export async function search[EngineName](query: string, limit: number): Promise<SearchResult[]> {
     // Scraping logic using axios + cheerio
   }
   ```
3. Add engine to `src/tools/setupTools.ts`:
   - Add to `SUPPORTED_ENGINES` array
   - Add to `engineMap` with search function
4. Update `src/config.ts` type if needed (AppConfig['defaultSearchEngine'])
5. Update README documentation

## Adding a New Article Fetcher

1. Create fetcher in `src/engines/[platform]/fetch[Platform]Article.ts`
2. Register tool in `src/tools/setupTools.ts`:
   - Add URL validation logic to `validateArticleUrl()`
   - Register tool with `server.tool()`
3. Update README usage documentation

## Testing

### Integration Tests
The project includes comprehensive integration tests in `src/__tests__/`:
- HTTP server tests covering all endpoints and modes
- CORS functionality tests
- Session management tests
- Error handling tests

Run tests with:
```bash
bun test
```

### Manual Engine Tests
Manual testing can be done by running individual engine test files in `src/test/`:
- `test-bing.ts`, `test-baidu.ts`, `test-duckduckgo.ts`, etc.
- `fetchCsdnArticleTests.ts`, `fetchJuejinArticleTests.ts`

These are standalone test scripts that directly import and test engine functions.

### Development Workflow
**IMPORTANT:** After making any code changes:
1. Run `bun run typecheck` to ensure TypeScript strict mode compliance
2. Run `bun test` to verify all tests pass
3. Test the affected functionality manually if needed

The project MUST maintain:
- ✅ Zero TypeScript errors in strict mode (`strict: true` in tsconfig.json)
- ✅ Zero `any` types in source code (use `unknown`, proper interfaces, or type guards)
- ✅ Zero TypeScript suppressions (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`)
- ✅ All integration tests passing (16+ tests covering HTTP endpoints, CORS, sessions, errors)

**Type Safety Guidelines:**
- Use `AxiosRequestConfig` for axios request options instead of `any`
- Use `unknown` for JSON parsing results, not `any`
- Use `error instanceof Error` checks in catch blocks
- Define interfaces for external API responses (e.g., `DuckDuckGoSearchItem`)
- Use type guards (`axios.isAxiosError()`) for error handling

## Important Notes

### Web Scraping Limitations
- Search engines may block requests if rate limits are exceeded
- HTML structure changes in target sites will break scrapers
- Proxy configuration may be needed in restricted regions
- This tool is for personal use only; comply with search engine ToS

### Session Management
- StreamableHTTP transport uses session IDs to maintain state
- Sessions are stored in memory (not persistent)
- Cleanup happens on transport close

### ALLOWED_SEARCH_ENGINES Behavior
- Empty list = all engines available
- Non-empty list = restricts to specified engines only
- If default engine is not in allowed list, first allowed engine becomes default

### Proxy Configuration
- Set `USE_PROXY=true` and `PROXY_URL` to enable
- Used by all search engines via axios configuration
- Helper function: `getProxyUrl()` in `src/config.ts`
- Never log to stdout as it breaks MCP. Only log to stderr