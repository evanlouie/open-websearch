# Adding New Search Engines

This guide walks you through adding a new search engine to Open-WebSearch v2.0.

**Time estimate:** <30 minutes
**Code estimate:** <50 lines
**Difficulty:** Easy (if you know CSS selectors)

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Step-by-Step Guide](#step-by-step-guide)
4. [CSS Selector Discovery](#css-selector-discovery)
5. [Testing Requirements](#testing-requirements)
6. [Advanced Topics](#advanced-topics)
7. [Examples](#examples)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Knowledge

- Basic TypeScript
- CSS selectors (how to select elements)
- Playwright basics (helpful but not required)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/evanlouie/open-websearch.git
cd open-websearch

# Install dependencies
bun install

# Install Playwright browsers
bunx playwright install chromium

# Run tests to verify setup
bun test
```

---

## Quick Start

### Minimal Engine Example

Here's a complete search engine implementation in ~40 lines:

```typescript
// src/engines/example.ts
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
        // Wait for search results to load
        await page.waitForSelector('.result', { timeout: 10000 });

        // Extract results from page
        const results = await page.$$eval('.result', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('.title')?.textContent?.trim() || '',
                url: el.querySelector('a')?.getAttribute('href') || '',
                description: el.querySelector('.desc')?.textContent?.trim() || '',
                source: el.querySelector('.source')?.textContent?.trim() || '',
                engine: 'example'
            })).filter(result => result.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

// Export singleton instance
export const exampleEngine = new ExampleEngine();
```

**That's it!** Now register it in `setupTools.ts` and you're done.

---

## Step-by-Step Guide

### Step 1: Create Engine File

Create a new file in `src/engines/` directory:

```bash
touch src/engines/yourengine.ts
```

### Step 2: Implement BaseEngine

Copy this template and fill in the TODOs:

```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class YourEngine extends BaseEngine {
    // TODO: Change 'yourengine' to your engine name (lowercase, no spaces)
    readonly name = 'yourengine';

    // TODO: Change to your engine's homepage URL
    readonly baseUrl = 'https://yourengine.com';

    protected buildSearchUrl(query: string): string {
        // TODO: Construct search URL with query parameter
        // Examples:
        // - https://yourengine.com/search?q={query}
        // - https://yourengine.com/?query={query}
        // - https://yourengine.com/s?q={query}&lang=en

        return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        // TODO: Wait for results to load
        // Find the CSS selector for search result containers
        await page.waitForSelector('.result-selector', { timeout: 10000 });

        // TODO: Extract search results
        const results = await page.$$eval('.result-selector', (elements) => {
            return elements.map(el => {
                // TODO: Find CSS selectors for each field
                const titleEl = el.querySelector('.title-selector');
                const linkEl = el.querySelector('a.link-selector');
                const descEl = el.querySelector('.description-selector');
                const sourceEl = el.querySelector('.source-selector');

                return {
                    title: titleEl?.textContent?.trim() || '',
                    url: linkEl?.getAttribute('href') || '',
                    description: descEl?.textContent?.trim() || '',
                    source: sourceEl?.textContent?.trim() || '',
                    engine: 'yourengine'  // TODO: Match this with name above
                };
            }).filter(result => result.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

// Export singleton instance
export const yourEngine = new YourEngine();
```

### Step 3: Discover CSS Selectors

See [CSS Selector Discovery](#css-selector-discovery) section below for detailed instructions.

**Quick method:**

1. Open https://yourengine.com in a browser
2. Search for "test query"
3. Open DevTools (F12)
4. Right-click a search result → Inspect
5. Find unique CSS selectors in the Elements panel
6. Test in Console: `document.querySelectorAll('.your-selector')`

### Step 4: Register Engine in setupTools.ts

Edit `src/tools/setupTools.ts`:

```typescript
// 1. Add import at top
import { yourEngine } from '../engines/yourengine.js';

// 2. Add to engineMap (around line 15)
const engineMap = {
    bing: bingEngine,
    duckduckgo: duckduckgoEngine,
    brave: braveEngine,
    google: googleEngine,
    yourengine: yourEngine,  // ADD THIS
};

// 3. Update Zod schema (around line 25)
engines: z.array(z.enum([
    'bing',
    'duckduckgo',
    'brave',
    'google',
    'yourengine'  // ADD THIS
])).default(['bing'])
```

### Step 5: Create Unit Tests

Create `src/__tests__/unit/engines/yourengine.test.ts`:

```typescript
import { describe, test, expect } from 'bun:test';
import { yourEngine } from '../../../engines/yourengine.js';

describe('YourEngine', () => {
    describe('Configuration', () => {
        test('has correct name', () => {
            expect(yourEngine.name).toBe('yourengine');
        });

        test('has correct baseUrl', () => {
            expect(yourEngine.baseUrl).toBe('https://yourengine.com');
        });
    });

    describe('buildSearchUrl', () => {
        test('builds correct search URL', () => {
            const url = (yourEngine as any).buildSearchUrl('test query');
            expect(url).toBe('https://yourengine.com/search?q=test%20query');
        });

        test('encodes special characters', () => {
            const url = (yourEngine as any).buildSearchUrl('search & find!');
            expect(url).toContain(encodeURIComponent('search & find!'));
        });

        test('handles empty query', () => {
            const url = (yourEngine as any).buildSearchUrl('');
            expect(url).toBe('https://yourengine.com/search?q=');
        });
    });

    describe('Interface Compliance', () => {
        test('implements all SearchEngine methods', () => {
            expect(typeof yourEngine.search).toBe('function');
            expect(typeof yourEngine.healthCheck).toBe('function');
        });

        test('has required properties', () => {
            expect(typeof yourEngine.name).toBe('string');
            expect(typeof yourEngine.baseUrl).toBe('string');
        });
    });
});
```

### Step 6: Add E2E Test

Edit `src/__tests__/e2e/search.test.ts` and add:

```typescript
describe('YourEngine Search', () => {
    test('search for "test" returns relevant results', async () => {
        const results = await yourEngine.search('test', 10);

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
        expect(results.length).toBeLessThanOrEqual(10);

        // Verify result structure
        const firstResult = results[0];
        expect(firstResult.engine).toBe('yourengine');
        expect(firstResult.url).toMatch(/^https?:\/\//);
    }, { timeout: 30000 });

    test('healthCheck returns true', async () => {
        const isHealthy = await yourEngine.healthCheck();
        expect(isHealthy).toBe(true);
    }, { timeout: 15000 });
});
```

### Step 7: Run Tests

```bash
# Run unit tests
bun test src/__tests__/unit/engines/yourengine.test.ts

# Run E2E test (makes real network request)
bun test src/__tests__/e2e/search.test.ts

# Run all tests
bun test

# Type check
bun run typecheck
```

### Step 8: Test with MCP Inspector

```bash
# Start MCP inspector
bun inspector

# Use the search tool with your engine
{
  "query": "test",
  "limit": 5,
  "engines": ["yourengine"]
}
```

### Step 9: Update Documentation

1. **README.md:** Add your engine to the features list
   ```markdown
   - **4 High-Quality Search Engines**
     - **Bing** - Reliable, fast, best overall
     - **DuckDuckGo** - Privacy-focused
     - **Brave** - Independent index
     - **Google** - Best results, but aggressive bot detection (experimental)
     - **YourEngine** - Your description here
   ```

2. **CLAUDE.md:** Add to engine list

3. **This guide:** Add an example if your engine has unique characteristics

---

## CSS Selector Discovery

### Method 1: Browser DevTools (Recommended)

**Step-by-step:**

1. **Open the search engine** in Chrome/Edge/Firefox
   ```
   https://yourengine.com
   ```

2. **Perform a search**
   - Enter a test query (e.g., "playwright")
   - Submit the search

3. **Open DevTools**
   - Press `F12` or right-click → "Inspect"

4. **Inspect a search result**
   - Right-click on a search result title → "Inspect"
   - This opens the Elements panel with that element highlighted

5. **Find the container selector**
   - Look for the parent element that wraps the entire result
   - Common patterns:
     - `<div class="result">...</div>`
     - `<article class="search-result">...</article>`
     - `<li class="result-item">...</li>`

6. **Find field selectors within the container**
   - Title: Usually `<h2>`, `<h3>`, or `.title`
   - Link: Usually `<a>` with href attribute
   - Description: Usually `.description`, `.snippet`, `<p>`
   - Source: Usually `.source`, `.domain`, `cite`

7. **Test selectors in Console**
   ```javascript
   // Test container selector
   document.querySelectorAll('.result')

   // Should return array of result elements
   // Try variations if it doesn't work:
   document.querySelectorAll('.search-result')
   document.querySelectorAll('[class*="result"]')
   ```

8. **Test field selectors**
   ```javascript
   // Get first result
   const firstResult = document.querySelector('.result');

   // Test title selector
   firstResult.querySelector('.title')?.textContent

   // Test link selector
   firstResult.querySelector('a')?.getAttribute('href')

   // Test description
   firstResult.querySelector('.description')?.textContent
   ```

### Method 2: Playwright Inspector

```bash
# Run Playwright in headed mode with inspector
PWDEBUG=1 bun run src/__tests__/e2e/search.test.ts
```

This opens Playwright Inspector where you can:
- Step through your test
- Inspect elements interactively
- Test selectors in real-time

### Common Selector Patterns

| Element | Common Selectors |
|---------|------------------|
| **Result Container** | `.result`, `.search-result`, `article`, `.organic-result`, `[data-result]` |
| **Title** | `h2`, `h3`, `.title`, `.result-title`, `.entry-title` |
| **Link** | `a`, `.result-link`, `a.title-link` |
| **Description** | `.description`, `.snippet`, `.excerpt`, `p`, `.result-description` |
| **Source** | `.source`, `.domain`, `cite`, `.url`, `.site` |

### Selector Best Practices

**✅ Good selectors:**
- `.result` - Simple class selector
- `[data-result="organic"]` - Data attribute
- `.result h2` - Descendant selector

**❌ Avoid:**
- `#result-12345` - IDs are often dynamic
- `div > div > div > div > h2` - Too specific, brittle
- `.result.item.organic.web-result` - Too many classes

### Testing Selectors

**Good test:**
```javascript
// Should find multiple results
const results = document.querySelectorAll('.result');
console.log(results.length);  // Should be 10+

// Each result should have title, link, description
results.forEach((result, i) => {
    const title = result.querySelector('.title')?.textContent;
    const url = result.querySelector('a')?.getAttribute('href');
    const desc = result.querySelector('.description')?.textContent;

    console.log(`Result ${i}:`, { title, url, desc });
});
```

---

## Testing Requirements

### Minimum Test Coverage

Every new engine MUST have:

1. **Unit tests** (7+ tests)
   - Configuration tests (name, baseUrl)
   - URL building tests (buildSearchUrl)
   - Interface compliance tests
   - Example: `src/__tests__/unit/engines/bing.test.ts`

2. **E2E tests** (2+ tests)
   - Real search test (makes actual network request)
   - Health check test
   - Example: `src/__tests__/e2e/search.test.ts`

3. **TypeScript strict mode**
   - Zero errors in `bun run typecheck`
   - No `any` types
   - No TypeScript suppressions

### Running Tests

```bash
# Run only your engine's unit tests
bun test src/__tests__/unit/engines/yourengine.test.ts

# Run all unit tests
bun test:unit

# Run E2E tests (slower, real network)
bun test:e2e

# Run all tests
bun test

# Type check
bun run typecheck
```

### Test Checklist

Before submitting a pull request:

- [ ] Unit tests pass (`bun test:unit`)
- [ ] E2E test passes with real search (`bun test:e2e`)
- [ ] TypeScript compiles with zero errors (`bun run typecheck`)
- [ ] Manual test with MCP inspector works
- [ ] Performance is acceptable (<5 seconds per search)
- [ ] Documentation updated (README.md, CLAUDE.md)

---

## Advanced Topics

### Handling Dynamic Content

Some search engines load results dynamically with JavaScript. Use `waitForSelector`:

```typescript
protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    // Wait for dynamic content to load
    await page.waitForSelector('.result', { timeout: 15000 });

    // Optional: Wait for network to be idle
    await page.waitForLoadState('networkidle');

    // Now extract results
    const results = await page.$$eval('.result', ...);
    return results.slice(0, limit);
}
```

### Handling Pagination

If you want to get more than one page of results:

```typescript
protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    const allResults: SearchResult[] = [];

    while (allResults.length < limit) {
        // Extract current page results
        const pageResults = await page.$$eval('.result', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('.title')?.textContent?.trim() || '',
                url: el.querySelector('a')?.getAttribute('href') || '',
                description: el.querySelector('.desc')?.textContent?.trim() || '',
                source: el.querySelector('.source')?.textContent?.trim() || '',
                engine: 'yourengine'
            }));
        });

        allResults.push(...pageResults);

        // Check if there's a next page
        const nextButton = await page.$('.next-page');
        if (!nextButton || allResults.length >= limit) break;

        // Click next page
        await nextButton.click();
        await page.waitForSelector('.result', { timeout: 10000 });
    }

    return allResults.slice(0, limit);
}
```

**Note:** Pagination increases search time. Use sparingly.

### CAPTCHA Detection

If your engine uses CAPTCHA (like Google):

```typescript
protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    try {
        await page.waitForSelector('.result', { timeout: 10000 });
    } catch (error) {
        // Check for CAPTCHA
        const hasCaptcha = await page.$('iframe[src*="recaptcha"]');
        if (hasCaptcha) {
            throw new Error('Search blocked by CAPTCHA. Try using a different engine.');
        }
        throw error;
    }

    // Continue with normal extraction
    const results = await page.$$eval('.result', ...);
    return results.slice(0, limit);
}
```

### Custom Headers or Cookies

If your engine requires specific headers:

```typescript
protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
    // Set custom headers
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Custom User Agent'
    });

    // Continue with normal extraction
    await page.waitForSelector('.result', { timeout: 10000 });
    const results = await page.$$eval('.result', ...);
    return results.slice(0, limit);
}
```

**Note:** BaseEngine already applies stealth configuration. Custom headers are rarely needed.

### Handling Relative URLs

Filter out relative URLs and non-HTTP links:

```typescript
const results = await page.$$eval('.result', (elements) => {
    return elements.map(el => {
        let url = el.querySelector('a')?.getAttribute('href') || '';

        // Convert relative URL to absolute
        if (url.startsWith('/')) {
            url = `https://yourengine.com${url}`;
        }

        return {
            title: el.querySelector('.title')?.textContent?.trim() || '',
            url: url,
            description: el.querySelector('.desc')?.textContent?.trim() || '',
            source: el.querySelector('.source')?.textContent?.trim() || '',
            engine: 'yourengine'
        };
    }).filter(result => result.url.startsWith('http'));  // Only HTTP URLs
});
```

---

## Examples

### Example 1: Yahoo Search

```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class YahooEngine extends BaseEngine {
    readonly name = 'yahoo';
    readonly baseUrl = 'https://search.yahoo.com';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/search?p=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        await page.waitForSelector('.dd.algo', { timeout: 10000 });

        const results = await page.$$eval('.dd.algo', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('h3')?.textContent?.trim() || '',
                url: el.querySelector('a')?.getAttribute('href') || '',
                description: el.querySelector('.compText')?.textContent?.trim() || '',
                source: el.querySelector('span.txt')?.textContent?.trim() || '',
                engine: 'yahoo'
            })).filter(r => r.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

export const yahooEngine = new YahooEngine();
```

### Example 2: Ecosia Search

```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class EcosiaEngine extends BaseEngine {
    readonly name = 'ecosia';
    readonly baseUrl = 'https://www.ecosia.org';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/search?q=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        await page.waitForSelector('.result', { timeout: 10000 });

        const results = await page.$$eval('.result', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('.result-title')?.textContent?.trim() || '',
                url: el.querySelector('a.result-url')?.getAttribute('href') || '',
                description: el.querySelector('.result-snippet')?.textContent?.trim() || '',
                source: el.querySelector('.result-hostname')?.textContent?.trim() || '',
                engine: 'ecosia'
            })).filter(r => r.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

export const ecosiaEngine = new EcosiaEngine();
```

### Example 3: Startpage Search

```typescript
import { Page } from 'playwright';
import { BaseEngine } from './BaseEngine.js';
import { SearchResult } from '../types.js';

export class StartpageEngine extends BaseEngine {
    readonly name = 'startpage';
    readonly baseUrl = 'https://www.startpage.com';

    protected buildSearchUrl(query: string): string {
        return `${this.baseUrl}/search?query=${encodeURIComponent(query)}`;
    }

    protected async extractResults(page: Page, limit: number): Promise<SearchResult[]> {
        // Startpage uses dynamic loading
        await page.waitForSelector('.w-gl__result', { timeout: 15000 });

        const results = await page.$$eval('.w-gl__result', (elements) => {
            return elements.map(el => ({
                title: el.querySelector('.w-gl__result-title')?.textContent?.trim() || '',
                url: el.querySelector('a.w-gl__result-url')?.getAttribute('href') || '',
                description: el.querySelector('.w-gl__description')?.textContent?.trim() || '',
                source: el.querySelector('.w-gl__result-url-hostname')?.textContent?.trim() || '',
                engine: 'startpage'
            })).filter(r => r.url.startsWith('http'));
        });

        return results.slice(0, limit);
    }
}

export const startpageEngine = new StartpageEngine();
```

---

## Troubleshooting

### "waitForSelector timed out"

**Problem:** Search results aren't loading in time.

**Solutions:**
1. Increase timeout: `{ timeout: 15000 }`
2. Try different selector
3. Check if results load dynamically (wait for network idle)
4. Test selector in browser console

### "Results array is empty"

**Problem:** Selector finds elements but no results are returned.

**Solutions:**
1. Check if URLs start with `http` (filter may be removing them)
2. Verify selectors in browser DevTools
3. Check if elements have the expected structure
4. Add logging: `console.error('Found X results:', results.length)`

### "TypeError: Cannot read property 'textContent' of null"

**Problem:** Element selector is not finding the expected element.

**Solutions:**
1. Use optional chaining: `el.querySelector('.title')?.textContent`
2. Provide fallback: `?.textContent?.trim() || ''`
3. Check selector in browser console
4. Inspect actual HTML structure

### "TypeScript errors"

**Problem:** Type errors in strict mode.

**Solutions:**
```typescript
// ✅ Good: Proper types
import { Page } from 'playwright';
import { SearchResult } from '../types.js';

// ✅ Good: Optional chaining
el.querySelector('.title')?.textContent?.trim() || ''

// ❌ Bad: Using 'any'
const page: any = await browserPool.getPage();
```

### "Tests pass but MCP inspector fails"

**Problem:** Tests work but real usage doesn't.

**Solutions:**
1. Check if engine is registered in `setupTools.ts`
2. Verify Zod schema includes your engine name
3. Restart MCP inspector after code changes
4. Check for typos in engine name

### "Search is very slow (>10 seconds)"

**Problem:** Performance issues.

**Solutions:**
1. Reduce timeout if possible
2. Avoid pagination for basic searches
3. Don't wait for `networkidle` unless necessary
4. Use more specific selectors (faster DOM queries)

---

## Contributing

### Pull Request Checklist

Before submitting your engine:

- [ ] Code follows BaseEngine pattern
- [ ] TypeScript strict mode passes
- [ ] Unit tests pass (7+ tests)
- [ ] E2E test passes with real search
- [ ] Performance is acceptable (<5s per search)
- [ ] Documentation updated (README.md, CLAUDE.md, this guide)
- [ ] No console.log statements (use console.error for logging)
- [ ] Code is well-commented
- [ ] Engine name follows conventions (lowercase, no spaces)

### Code Style

- **Indentation:** 4 spaces (TypeScript convention in this project)
- **Naming:** camelCase for variables, PascalCase for classes
- **Comments:** Explain why, not what
- **Error handling:** Use try-catch where appropriate
- **Logging:** Use `console.error()` not `console.log()`

### Getting Help

- **Issues:** https://github.com/evanlouie/open-websearch/issues
- **Discussions:** https://github.com/evanlouie/open-websearch/discussions
- **PRD:** `docs/playwright-migration-prd.md`

---

## Summary

**Adding a new engine:**

1. Create `src/engines/yourengine.ts` extending `BaseEngine`
2. Implement `buildSearchUrl()` and `extractResults()`
3. Register in `src/tools/setupTools.ts`
4. Add unit tests (`src/__tests__/unit/engines/yourengine.test.ts`)
5. Add E2E test to `src/__tests__/e2e/search.test.ts`
6. Run `bun test` and `bun run typecheck`
7. Test with `bun inspector`
8. Update documentation
9. Submit pull request

**Time estimate:** <30 minutes
**Code estimate:** <50 lines

---

Happy engine building! 🚀

If you run into issues, please [open an issue](https://github.com/evanlouie/open-websearch/issues) or [start a discussion](https://github.com/evanlouie/open-websearch/discussions).
