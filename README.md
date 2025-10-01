<div align="center">

# Open-WebSearch MCP Server

> **Note:** This is a fork of the original [Aas-ee/open-webSearch](https://github.com/Aas-ee/open-webSearch) project.
> NPX installation does not work for this fork. Please use the Bunx installation method below.

[![ModelScope](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/Aas-ee/3af09e0f4c7821fb2e9acb96483a5ff0/raw/badge.json&color=%23de5a16)](https://www.modelscope.cn/mcp/servers/Aasee1/open-webSearch)
[![Trust Score](https://archestra.ai/mcp-catalog/api/badge/quality/Aas-ee/open-webSearch)](https://archestra.ai/mcp-catalog/aas-ee__open-websearch)
[![smithery badge](https://smithery.ai/badge/@Aas-ee/open-websearch)](https://smithery.ai/server/@Aas-ee/open-websearch)
![Version](https://img.shields.io/github/v/release/evanlouie/open-websearch)
![License](https://img.shields.io/github/license/evanlouie/open-websearch)
![Issues](https://img.shields.io/github/issues/evanlouie/open-websearch)

</div>

A Model Context Protocol (MCP) server based on multi-engine search results, supporting free web search without API keys. Built with Bun runtime and TypeScript, featuring comprehensive integration tests and strict type safety.

## Features

- Web search using multi-engine results
  - bing ⚠️ _Currently experiencing issues and may not return results_
  - duckduckgo
  - brave
- **Multi-query search support** - search multiple queries in a single request (up to 10 queries)
- HTTP proxy configuration support for accessing restricted resources
- No API keys or authentication required
- Returns structured results with titles, URLs, and descriptions
- Configurable number of results per search
- Customizable default search engine
- TypeScript strict mode with comprehensive type safety
- Integration test suite with 22+ tests
- Multiple transport modes (HTTP, STDIO, or both)

## TODO

- Support for ~~Bing~~ (already supported), ~~DuckDuckGo~~ (already supported), ~~Brave~~ (already supported), Google and other search engines

## Installation Guide

### Bunx Quick Start (Recommended)

The fastest way to get started with this fork:

```bash
# Basic usage
bunx github:evanlouie/open-websearch

# With environment variables (Linux/macOS)
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true bunx github:evanlouie/open-websearch

# Windows PowerShell
$env:DEFAULT_SEARCH_ENGINE="duckduckgo"; $env:ENABLE_CORS="true"; bunx github:evanlouie/open-websearch

# Windows CMD
set MODE=stdio && set DEFAULT_SEARCH_ENGINE=duckduckgo && bunx github:evanlouie/open-websearch

# Cross-platform environment variables
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true bunx github:evanlouie/open-websearch
```

> **Note:** NPX installation (`npx open-websearch@latest`) does not work for this fork as it's not published to npm.
> Use `bunx github:evanlouie/open-websearch` to run directly from GitHub, or clone the repository for local installation.

**Environment Variables:**

| Variable                 | Default                 | Options                       | Description                                                                                                                     |
| ------------------------ | ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ENABLE_CORS`            | `false`                 | `true`, `false`               | Enable CORS                                                                                                                     |
| `CORS_ORIGIN`            | `*`                     | Any valid origin              | CORS origin configuration                                                                                                       |
| `DEFAULT_SEARCH_ENGINE`  | `brave`                 | `bing`, `duckduckgo`, `brave` | Default search engine (Note: Bing currently has issues)                                                                         |
| `USE_PROXY`              | `false`                 | `true`, `false`               | Enable HTTP proxy                                                                                                               |
| `PROXY_URL`              | `http://127.0.0.1:7890` | Any valid URL                 | Proxy server URL                                                                                                                |
| `MODE`                   | `both`                  | `both`, `http`, `stdio`       | Server mode: both HTTP+STDIO, HTTP only, or STDIO only                                                                          |
| `PORT`                   | `3000`                  | 0-65535                       | Server port (set to 0 for automatic port selection)                                                                             |
| `ALLOWED_SEARCH_ENGINES` | empty (all available)   | Comma-separated engine names  | Limit which search engines can be used; if the default engine is not in this list, the first allowed engine becomes the default |

**Common configurations:**

```bash
# Enable proxy for restricted regions
USE_PROXY=true PROXY_URL=http://127.0.0.1:7890 bunx github:evanlouie/open-websearch

# Use automatic port selection (OS assigns available port)
PORT=0 bunx github:evanlouie/open-websearch

# Full configuration
DEFAULT_SEARCH_ENGINE=duckduckgo ENABLE_CORS=true USE_PROXY=true PROXY_URL=http://127.0.0.1:7890 PORT=8080 bunx github:evanlouie/open-websearch
```

### Local Installation

1. Clone or download this repository
2. Install dependencies:

```bash
bun install
```

3. Run the server:

```bash
bun start
```

4. Add the server to your MCP configuration:

**Cherry Studio:**

```json
{
  "mcpServers": {
    "web-search": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    }
  }
}
```

**VSCode (Claude Dev Extension):**

```json
{
  "mcpServers": {
    "web-search": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "web-search-sse": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

**Claude Desktop:**

```json
{
  "mcpServers": {
    "web-search": {
      "transport": {
        "type": "streamableHttp",
        "url": "http://localhost:3000/mcp"
      }
    },
    "web-search-sse": {
      "transport": {
        "type": "sse",
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

**Bunx Command Line Configuration:**

```json
{
  "mcpServers": {
    "web-search": {
      "args": ["github:evanlouie/open-websearch"],
      "command": "bunx",
      "env": {
        "MODE": "stdio",
        "DEFAULT_SEARCH_ENGINE": "duckduckgo",
        "ALLOWED_SEARCH_ENGINES": "duckduckgo,bing,brave"
      }
    }
  }
}
```

> **Note:** NPX does not work for this fork. Use `bunx` with the GitHub repository path as shown above.

**Local STDIO Configuration for Cherry Studio (Windows):**

```json
{
  "mcpServers": {
    "open-websearch-local": {
      "command": "bun",
      "args": ["C:/path/to/your/project/src/index.ts"],
      "env": {
        "MODE": "stdio",
        "DEFAULT_SEARCH_ENGINE": "duckduckgo",
        "ALLOWED_SEARCH_ENGINES": "duckduckgo,bing,brave"
      }
    }
  }
}
```

### Docker Deployment

> **Note:** Pre-built Docker images are not available for this fork. You can build locally using the Dockerfile in this repository.

Build and run locally:

```bash
# Build the Docker image
docker build -t open-websearch .

# Run the container
docker run -d --name web-search -p 3000:3000 -e ENABLE_CORS=true -e CORS_ORIGIN=* open-websearch
```

Or use Docker Compose:

```bash
docker-compose up -d
```

Environment variable configuration:

| Variable                | Default                 | Options                       | Description                                             |
| ----------------------- | ----------------------- | ----------------------------- | ------------------------------------------------------- |
| `ENABLE_CORS`           | `false`                 | `true`, `false`               | Enable CORS                                             |
| `CORS_ORIGIN`           | `*`                     | Any valid origin              | CORS origin configuration                               |
| `DEFAULT_SEARCH_ENGINE` | `brave`                 | `bing`, `duckduckgo`, `brave` | Default search engine (Note: Bing currently has issues) |
| `USE_PROXY`             | `false`                 | `true`, `false`               | Enable HTTP proxy                                       |
| `PROXY_URL`             | `http://127.0.0.1:7890` | Any valid URL                 | Proxy server URL                                        |
| `PORT`                  | `3000`                  | 0-65535                       | Server port (set to 0 for automatic port selection)     |

Then configure in your MCP client:

```json
{
  "mcpServers": {
    "web-search": {
      "name": "Web Search MCP",
      "type": "streamableHttp",
      "description": "Multi-engine web search",
      "isActive": true,
      "baseUrl": "http://localhost:3000/mcp"
    },
    "web-search-sse": {
      "transport": {
        "name": "Web Search MCP",
        "type": "sse",
        "description": "Multi-engine web search",
        "isActive": true,
        "url": "http://localhost:3000/sse"
      }
    }
  }
}
```

## Usage Guide

The server provides one tool: `search`.

### search Tool Usage

```typescript
{
  "query": string | string[],  // Single search query OR array of queries (max 10)
  "limit": number,              // Optional: Number of results to return per query (default: 10)
  "engines": string[]           // Optional: Engines to use (bing, duckduckgo, brave); default is bing
}
```

**Single Query Example:**

```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: "typescript programming",
    limit: 5,
    engines: ["bing", "duckduckgo"],
  },
});
```

Single query response format:

The tool returns an MCP response with two content items:

1. **Text summary** (human-readable):

   ```
   Found 10 results for "typescript programming" using bing, duckduckgo
   ```

2. **JSON resource** (structured data with `mimeType: "application/json"`):

   ```json
   {
     "query": "typescript programming",
     "engines": ["bing", "duckduckgo"],
     "totalResults": 10,
     "results": [
       {
         "title": "TypeScript Documentation",
         "url": "https://www.typescriptlang.org/docs/",
         "description": "TypeScript is a strongly typed programming language...",
         "source": "bing",
         "engine": "bing"
       }
     ]
   }
   ```

   - URI: `search://query/typescript%20programming/{timestamp}` (e.g., `search://query/typescript%20programming/1609459200000`)
   - Each execution gets a unique URI to prevent caching issues
   - MCP-aware clients can detect the JSON structure automatically
   - Can be surfaced as downloadable attachment or passed to downstream tools

**Multi-Query Example:**

```typescript
use_mcp_tool({
  server_name: "web-search",
  tool_name: "search",
  arguments: {
    query: ["typescript", "javascript", "rust programming"],
    limit: 5,
    engines: ["bing", "duckduckgo"],
  },
});
```

Multi-query response format:

The tool returns an MCP response with two content items:

1. **Text summary** (human-readable):

   ```
   Completed search for 3 queries using bing, duckduckgo
   ```

2. **JSON resource** (structured data with `mimeType: "application/json"`):

   ```json
   {
     "results": [
       {
         "query": "typescript",
         "engines": ["bing", "duckduckgo"],
         "totalResults": 10,
         "results": [
           {
             "title": "TypeScript",
             "url": "https://www.typescriptlang.org/",
             "description": "TypeScript extends JavaScript...",
             "source": "bing",
             "engine": "bing"
           }
         ]
       },
       {
         "query": "javascript",
         "engines": ["bing", "duckduckgo"],
         "totalResults": 10,
         "results": [
           {
             "title": "JavaScript | MDN",
             "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
             "description": "JavaScript (JS) is a lightweight interpreted...",
             "source": "duckduckgo",
             "engine": "duckduckgo"
           }
         ]
       },
       {
         "query": "rust programming",
         "engines": ["bing", "duckduckgo"],
         "totalResults": 10,
         "results": [
           {
             "title": "Rust Programming Language",
             "url": "https://www.rust-lang.org/",
             "description": "A language empowering everyone...",
             "source": "bing",
             "engine": "bing"
           }
         ]
       }
     ]
   }
   ```

   - URI: `search://multi-query/{timestamp}` (e.g., `search://multi-query/1609459200000`)
   - MCP-aware clients can detect the JSON structure automatically
   - Can be surfaced as downloadable attachment or passed to downstream tools

**Important Notes:**

- Multi-query searches execute queries **sequentially per engine** to avoid rate limiting
- Each search engine processes all queries one at a time
- All engines run in **parallel** for maximum speed
- Maximum 10 queries per request to prevent abuse

## Usage Limitations

Since this tool works by scraping multi-engine search results, please note the following important limitations:

1. **Rate Limiting**:
   - Too many searches in a short time may cause the used engines to temporarily block requests
   - Multi-query searches are designed to minimize rate limit risks:
     - Queries are executed **sequentially** for each engine (one at a time)
     - Engines run in **parallel** (all engines work simultaneously)
     - This prevents overwhelming any single search engine
   - Recommendations:
     - Maintain reasonable search frequency
     - Use the limit parameter judiciously
     - Limit multi-query requests to 10 queries maximum (enforced)
     - Add delays between large batch requests when necessary

2. **Result Accuracy**:
   - Depends on the HTML structure of corresponding engines, may fail when engines update
   - Some results may lack metadata like descriptions
   - Complex search operators may not work as expected

3. **Legal Terms**:
   - This tool is for personal use only
   - Please comply with the terms of service of corresponding engines
   - Implement appropriate rate limiting based on your actual use case

4. **Search Engine Configuration**:
   - Default search engine can be set via the `DEFAULT_SEARCH_ENGINE` environment variable
   - Supported engines: bing (currently has issues), duckduckgo, brave
   - The default engine is brave
   - The default engine is used when searching specific websites

5. **Proxy Configuration**:
   - HTTP proxy can be configured when certain search engines are unavailable in specific regions
   - Enable proxy with environment variable `USE_PROXY=true`
   - Configure proxy server address with `PROXY_URL`

## Contributing

Welcome to submit issue reports and feature improvement suggestions!

### Development

This project uses Bun runtime and TypeScript with strict mode enabled.

**Development Commands:**

```bash
# Install dependencies
bun install

# Run the server locally
bun start

# Run tests
bun test

# Type checking (must pass with zero errors)
bun run typecheck

# Run MCP inspector for testing
bun inspector
```

**Development Requirements:**

- ✅ All code must pass TypeScript strict mode (`bun run typecheck`)
- ✅ All integration tests must pass (`bun test`)
- ✅ No `any` types in source code
- ✅ No TypeScript suppressions (`@ts-ignore`, etc.)

**Testing:**

- Integration tests are located in `src/__tests__/`
- Tests cover HTTP server endpoints, CORS, session management, and error handling
- Run `bun test` before submitting pull requests

**Architecture:**

- `src/index.ts` - Main entry point
- `src/server.ts` - HTTP server and MCP server creation (exported for testing)
- `src/config.ts` - Configuration management
- `src/engines/` - Search engine implementations
- `src/tools/` - MCP tool definitions

### Contributor Guide

If you want to fork this repository and publish your own Docker image, you need to make the following configurations:

#### GitHub Secrets Configuration

To enable automatic Docker image building and publishing, please add the following secrets in your GitHub repository settings (Settings → Secrets and variables → Actions):

**Required Secrets:**

- `GITHUB_TOKEN`: Automatically provided by GitHub (no setup needed)

**Optional Secrets (for Alibaba Cloud ACR):**

- `ACR_REGISTRY`: Your Alibaba Cloud Container Registry URL (e.g., `registry.cn-hangzhou.aliyuncs.com`)
- `ACR_USERNAME`: Your Alibaba Cloud ACR username
- `ACR_PASSWORD`: Your Alibaba Cloud ACR password
- `ACR_IMAGE_NAME`: Your image name in ACR (e.g., `your-namespace/open-web-search`)

#### CI/CD Workflow

The repository includes a GitHub Actions workflow (`.github/workflows/docker.yml`) that automatically:

1. **Trigger Conditions**:
   - Push to `main` branch
   - Push version tags (`v*`)
   - Manual workflow trigger

2. **Build and Push to**:
   - GitHub Container Registry (ghcr.io) - always enabled
   - Alibaba Cloud Container Registry - only enabled when ACR secrets are configured

3. **Image Tags**:
   - `ghcr.io/evanlouie/open-websearch:latest`
   - `your-acr-address/your-image-name:latest` (if ACR is configured)

#### Fork and Publish Steps:

1. **Fork the repository** to your GitHub account
2. **Configure secrets** (if you need ACR publishing):
   - Go to Settings → Secrets and variables → Actions in your forked repository
   - Add the ACR-related secrets listed above
3. **Push changes** to the `main` branch or create version tags
4. **GitHub Actions will automatically build and push** your Docker image
5. **Use your image**, update the Docker command:
   ```bash
   docker run -d --name web-search -p 3000:3000 -e ENABLE_CORS=true -e CORS_ORIGIN=* ghcr.io/evanlouie/open-websearch:latest
   ```

#### Notes:

- If you don't configure ACR secrets, the workflow will only publish to GitHub Container Registry
- Make sure your GitHub repository has Actions enabled
- The workflow will use your GitHub username (converted to lowercase) as the GHCR image name

<div align="center">

## Star History

If you find this project helpful, please consider giving it a ⭐ Star!

[![Star History Chart](https://api.star-history.com/svg?repos=evanlouie/open-websearch&type=Date)](https://www.star-history.com/#evanlouie/open-websearch&Date)

</div>
