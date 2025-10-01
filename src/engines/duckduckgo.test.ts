import { describe, test, expect } from "bun:test";
import * as cheerio from "cheerio";
import { Option, pipe } from "effect";
import {
  extractPreloadUrl,
  parseJsonData,
  buildSearchUrl,
  createPreloadHeaders,
  parseJsonpResponse,
  processSearchItems,
  parseHtmlResult,
  createSearchParams,
} from "./duckduckgo.js";

describe("DuckDuckGo Search Engine - extractPreloadUrl", () => {
  test("extracts URL from preload link element", () => {
    const html = `
      <html>
        <head>
          <link rel="preload" as="script" href="https://links.duckduckgo.com/d.js?q=test&s=0" />
        </head>
      </html>
    `;

    const result = extractPreloadUrl(html);

    expect(Option.isSome(result)).toBe(true);
    const url = pipe(result, Option.getOrThrow);
    expect(url).toContain("links.duckduckgo.com/d.js");
  });

  test("extracts URL from deep_preload_script element", () => {
    const html = `
      <html>
        <head>
          <script id="deep_preload_script" src="https://links.duckduckgo.com/d.js?q=test&s=0"></script>
        </head>
      </html>
    `;

    const result = extractPreloadUrl(html);

    expect(Option.isSome(result)).toBe(true);
    const url = pipe(result, Option.getOrThrow);
    expect(url).toContain("links.duckduckgo.com/d.js");
  });

  test("extracts URL from regex match in HTML", () => {
    const html = `
      <html>
        <body>
          <script>
            var preloadUrl = "https://links.duckduckgo.com/d.js?q=test&s=0";
          </script>
        </body>
      </html>
    `;

    const result = extractPreloadUrl(html);

    expect(Option.isSome(result)).toBe(true);
    const url = pipe(result, Option.getOrThrow);
    expect(url).toContain("links.duckduckgo.com/d.js");
  });

  test("returns None when no preload URL found", () => {
    const html = `
      <html>
        <head>
          <title>No preload URL</title>
        </head>
      </html>
    `;

    const result = extractPreloadUrl(html);

    expect(Option.isNone(result)).toBe(true);
  });

  test("prefers preload link over script element", () => {
    const html = `
      <html>
        <head>
          <link rel="preload" as="script" href="https://links.duckduckgo.com/d.js?from=preload" />
          <script id="deep_preload_script" src="https://links.duckduckgo.com/d.js?from=script"></script>
        </head>
      </html>
    `;

    const result = extractPreloadUrl(html);

    expect(Option.isSome(result)).toBe(true);
    const url = pipe(result, Option.getOrThrow);
    expect(url).toContain("from=preload");
  });
});

describe("DuckDuckGo Search Engine - parseJsonData", () => {
  test("parses complete DuckDuckGo search item", () => {
    const item = {
      t: "Example Title",
      u: "https://example.com",
      a: "Example description",
      i: "https://icon.example.com/favicon.ico",
    };

    const result = parseJsonData(item);

    expect(result.title).toBe("Example Title");
    expect(result.url).toBe("https://example.com");
    expect(result.description).toBe("Example description");
    expect(result.source).toBe("https://icon.example.com/favicon.ico");
    expect(result.engine).toBe("duckduckgo");
  });

  test("handles missing title", () => {
    const item = {
      u: "https://example.com",
      a: "Description",
    };

    const result = parseJsonData(item);

    expect(result.title).toBe("");
  });

  test("handles missing URL", () => {
    const item = {
      t: "Title",
      a: "Description",
    };

    const result = parseJsonData(item);

    expect(result.url).toBe("");
  });

  test("handles missing description", () => {
    const item = {
      t: "Title",
      u: "https://example.com",
    };

    const result = parseJsonData(item);

    expect(result.description).toBe("");
  });

  test("uses sn as fallback for source when i is missing", () => {
    const item = {
      t: "Title",
      u: "https://example.com",
      a: "Description",
      sn: "example.com",
    };

    const result = parseJsonData(item);

    expect(result.source).toBe("example.com");
  });

  test("prefers i over sn for source", () => {
    const item = {
      t: "Title",
      u: "https://example.com",
      a: "Description",
      i: "https://icon.example.com/favicon.ico",
      sn: "example.com",
    };

    const result = parseJsonData(item);

    expect(result.source).toBe("https://icon.example.com/favicon.ico");
  });

  test("handles empty item", () => {
    const item = {};

    const result = parseJsonData(item);

    expect(result.title).toBe("");
    expect(result.url).toBe("");
    expect(result.description).toBe("");
    expect(result.source).toBe("");
    expect(result.engine).toBe("duckduckgo");
  });
});

describe("DuckDuckGo Search Engine - buildSearchUrl", () => {
  test("builds search URL with offset", () => {
    const preloadUrl = new URL("https://links.duckduckgo.com/d.js?q=test");
    const url = buildSearchUrl(preloadUrl, 10);

    expect(url).toContain("s=10");
    expect(url).toContain("q=test");
  });

  test("replaces existing offset parameter", () => {
    const preloadUrl = new URL("https://links.duckduckgo.com/d.js?q=test&s=0");
    const url = buildSearchUrl(preloadUrl, 20);

    expect(url).toContain("s=20");
    expect(url).not.toContain("s=0");
  });

  test("builds URL with zero offset", () => {
    const preloadUrl = new URL("https://links.duckduckgo.com/d.js?q=test");
    const url = buildSearchUrl(preloadUrl, 0);

    expect(url).toContain("s=0");
  });
});

describe("DuckDuckGo Search Engine - createPreloadHeaders", () => {
  test("creates headers with User-Agent", () => {
    const headers = createPreloadHeaders();

    expect(headers["User-Agent"]).toContain("Mozilla/5.0");
  });

  test("includes required security headers", () => {
    const headers = createPreloadHeaders();

    expect(headers["sec-fetch-site"]).toBe("same-site");
    expect(headers["sec-fetch-mode"]).toBe("no-cors");
    expect(headers["sec-fetch-dest"]).toBe("script");
  });

  test("includes referer header", () => {
    const headers = createPreloadHeaders();

    expect(headers["referer"]).toBe("https://duckduckgo.com/");
  });
});

describe("DuckDuckGo Search Engine - parseJsonpResponse", () => {
  test("parses valid JSONP response", () => {
    const responseData = `DDG.pageLayout.load('d', [{"t":"Title","u":"https://example.com"}] );`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isSome(result)).toBe(true);
    const data = pipe(result, Option.getOrThrow);
    expect(data).toHaveLength(1);
    expect(data[0]?.t).toBe("Title");
  });

  test("parses JSONP with multiple items", () => {
    const responseData = `DDG.pageLayout.load('d', [{"t":"Title1"},{"t":"Title2"},{"t":"Title3"}] );`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isSome(result)).toBe(true);
    const data = pipe(result, Option.getOrThrow);
    expect(data).toHaveLength(3);
  });

  test("parses JSONP with empty array", () => {
    const responseData = `DDG.pageLayout.load('d', [] );`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isSome(result)).toBe(true);
    const data = pipe(result, Option.getOrThrow);
    expect(data).toHaveLength(0);
  });

  test("returns None for invalid JSONP format", () => {
    const responseData = `invalid jsonp`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None for malformed JSON", () => {
    const responseData = `DDG.pageLayout.load('d', [invalid json] );`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isNone(result)).toBe(true);
  });

  test("handles whitespace in JSONP", () => {
    const responseData = `DDG.pageLayout.load('d',   [{"t":"Title"}]   );`;

    const result = parseJsonpResponse(responseData);

    expect(Option.isSome(result)).toBe(true);
  });
});

describe("DuckDuckGo Search Engine - processSearchItems", () => {
  test("processes valid search items", () => {
    const jsonData = [
      { t: "Title1", u: "https://example1.com", a: "Desc1" },
      { t: "Title2", u: "https://example2.com", a: "Desc2" },
    ];
    const maxResults = 10;
    const accumulatedResults: any[] = [];

    const result = processSearchItems(jsonData, maxResults, accumulatedResults);

    expect(result.newResults).toHaveLength(2);
    expect(result.validCount).toBe(2);
  });

  test("filters out navigation items", () => {
    const jsonData = [
      { t: "Title1", u: "https://example1.com", a: "Desc1" },
      { t: "Nav", u: "https://nav.com", n: true },
      { t: "Title2", u: "https://example2.com", a: "Desc2" },
    ];
    const maxResults = 10;
    const accumulatedResults: any[] = [];

    const result = processSearchItems(jsonData, maxResults, accumulatedResults);

    expect(result.newResults).toHaveLength(2);
    expect(result.validCount).toBe(2);
    expect(result.newResults[0]?.title).toBe("Title1");
    expect(result.newResults[1]?.title).toBe("Title2");
  });

  test("limits results to maxResults", () => {
    const jsonData = [
      { t: "Title1", u: "https://example1.com" },
      { t: "Title2", u: "https://example2.com" },
      { t: "Title3", u: "https://example3.com" },
    ];
    const maxResults = 2;
    const accumulatedResults: any[] = [];

    const result = processSearchItems(jsonData, maxResults, accumulatedResults);

    expect(result.newResults).toHaveLength(2);
  });

  test("respects accumulated results when limiting", () => {
    const jsonData = [
      { t: "Title3", u: "https://example3.com" },
      { t: "Title4", u: "https://example4.com" },
    ];
    const maxResults = 3;
    const accumulatedResults = [
      {
        title: "Title1",
        url: "https://example1.com",
        description: "",
        source: "",
        engine: "duckduckgo" as const,
      },
    ];

    const result = processSearchItems(jsonData, maxResults, accumulatedResults);

    expect(result.newResults).toHaveLength(2);
  });

  test("handles empty jsonData", () => {
    const jsonData: any[] = [];
    const maxResults = 10;
    const accumulatedResults: any[] = [];

    const result = processSearchItems(jsonData, maxResults, accumulatedResults);

    expect(result.newResults).toHaveLength(0);
    expect(result.validCount).toBe(0);
  });
});

describe("DuckDuckGo Search Engine - parseHtmlResult", () => {
  test("parses valid HTML result", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com">Example Title</a>
        <div class="result__snippet">Example description</div>
        <div class="result__url">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.title).toBe("Example Title");
    expect(value.url).toBe("https://example.com");
    expect(value.description).toBe("Example description");
    expect(value.source).toBe("example.com");
    expect(value.engine).toBe("duckduckgo");
  });

  test("returns None for ad results", () => {
    const html = `
      <div class="result result--ad">
        <a class="result__a" href="https://ad.com">Ad Title</a>
        <div class="result__snippet">Ad description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None when title is missing", () => {
    const html = `
      <div class="result">
        <div class="result__snippet">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns None when URL is missing", () => {
    const html = `
      <div class="result">
        <a class="result__a">Title without href</a>
        <div class="result__snippet">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("handles missing description", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com">Title</a>
        <div class="result__url">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.description).toBe("");
  });

  test("handles missing source", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com">Title</a>
        <div class="result__snippet">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.source).toBe("");
  });

  test("trims whitespace from all fields", () => {
    const html = `
      <div class="result">
        <a class="result__a" href="https://example.com">  Title  </a>
        <div class="result__snippet">  Description  </div>
        <div class="result__url">  example.com  </div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".result").get(0)!;
    const result = parseHtmlResult(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.title).toBe("Title");
    expect(value.description).toBe("Description");
    expect(value.source).toBe("example.com");
  });
});

describe("DuckDuckGo Search Engine - createSearchParams", () => {
  test("creates params with query only when offset is 0", () => {
    const params = createSearchParams("test query", 0);

    expect(params.get("q")).toBe("test query");
    expect(params.get("s")).toBeNull();
    expect(params.get("dc")).toBeNull();
  });

  test("creates full params when offset is non-zero", () => {
    const params = createSearchParams("test query", 10);

    expect(params.get("q")).toBe("test query");
    expect(params.get("s")).toBe("10");
    expect(params.get("dc")).toBe("10");
    expect(params.get("v")).toBe("l");
    expect(params.get("o")).toBe("json");
    expect(params.get("api")).toBe("d.js");
  });

  test("handles special characters in query", () => {
    const params = createSearchParams("test & query", 0);

    expect(params.get("q")).toBe("test & query");
  });
});
