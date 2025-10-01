import { describe, test, expect } from "bun:test";
import * as cheerio from "cheerio";
import { Option, pipe } from "effect";
import { createRequestOptions, parseResultElement } from "./brave.js";

describe("Brave Search Engine - parseResultElement", () => {
  test("returns Option.some for valid search result", () => {
    const html = `
      <div class="snippet">
        <div class="title">Example Title</div>
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="snippet-description">Example description</div>
        <div class="sitename">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.title).toBe("Example Title");
    expect(value.url).toBe("https://example.com");
    expect(value.description).toBe("Example description");
    expect(value.source).toBe("example.com");
    expect(value.engine).toBe("brave");
  });

  test("returns Option.none when title is missing", () => {
    const html = `
      <div class="snippet">
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns Option.none when URL is missing", () => {
    const html = `
      <div class="snippet">
        <div class="title">Title</div>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns Option.none when title is empty after trim", () => {
    const html = `
      <div class="snippet">
        <div class="title">   </div>
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("handles missing description gracefully", () => {
    const html = `
      <div class="snippet">
        <div class="title">Title</div>
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="sitename">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.description).toBe("");
  });

  test("handles missing source gracefully", () => {
    const html = `
      <div class="snippet">
        <div class="title">Title</div>
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.source).toBe("");
  });

  test("trims whitespace from all fields", () => {
    const html = `
      <div class="snippet">
        <div class="title">  Title  </div>
        <a class="heading-serpresult" href="https://example.com">Link</a>
        <div class="snippet-description">  Description  </div>
        <div class="sitename">  example.com  </div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.title).toBe("Title");
    expect(value.description).toBe("Description");
    expect(value.source).toBe("example.com");
  });

  test("accepts http URLs", () => {
    const html = `
      <div class="snippet">
        <div class="title">HTTP Site</div>
        <a class="heading-serpresult" href="http://example.com">Link</a>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.url).toBe("http://example.com");
  });

  test("accepts https URLs", () => {
    const html = `
      <div class="snippet">
        <div class="title">HTTPS Site</div>
        <a class="heading-serpresult" href="https://secure.example.com">Link</a>
        <div class="snippet-description">Description</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $(".snippet").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.url).toBe("https://secure.example.com");
  });
});

describe("Brave Search Engine - createRequestOptions", () => {
  test("returns base options when proxy URL is None", () => {
    const options = createRequestOptions(Option.none());

    expect(options.headers).toBeDefined();
    expect(options.headers?.["User-Agent"]).toContain("Mozilla/5.0");
    expect(options.headers?.["Connection"]).toBe("keep-alive");
    expect(options.httpAgent).toBeUndefined();
    expect(options.httpsAgent).toBeUndefined();
  });

  test("returns options with proxy agents when proxy URL is Some", () => {
    const proxyUrl = "http://proxy.example.com:8080";
    const options = createRequestOptions(Option.some(proxyUrl));

    expect(options.headers).toBeDefined();
    expect(options.headers?.["User-Agent"]).toContain("Mozilla/5.0");
    expect(options.headers?.["Connection"]).toBe("keep-alive");
    expect(options.httpAgent).toBeDefined();
    expect(options.httpsAgent).toBeDefined();
  });

  test("proxy agents are HttpsProxyAgent instances", () => {
    const proxyUrl = "http://proxy.example.com:8080";
    const options = createRequestOptions(Option.some(proxyUrl));

    expect(options.httpAgent?.constructor.name).toBe("HttpsProxyAgent");
    expect(options.httpsAgent?.constructor.name).toBe("HttpsProxyAgent");
  });

  test("httpAgent and httpsAgent are the same instance", () => {
    const proxyUrl = "http://proxy.example.com:8080";
    const options = createRequestOptions(Option.some(proxyUrl));

    expect(options.httpAgent).toBe(options.httpsAgent);
  });
});
