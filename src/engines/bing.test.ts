import { describe, test, expect } from "bun:test";
import * as cheerio from "cheerio";
import { Option, pipe } from "effect";
import { parseResultElement } from "./bing.js";

describe("Bing Search Engine - parseResultElement", () => {
  test("returns Option.some for valid search result", () => {
    const html = `
      <div>
        <h2><a href="https://example.com">Example Title</a></h2>
        <p>Example description</p>
        <div class="b_tpcn">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.title).toBe("Example Title");
    expect(value.url).toBe("https://example.com");
    expect(value.description).toBe("Example description");
    expect(value.source).toBe("example.com");
    expect(value.engine).toBe("bing");
  });

  test("returns Option.none when URL is missing", () => {
    const html = `
      <div>
        <h2>Title without link</h2>
        <p>Description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns Option.none when URL doesn't start with http", () => {
    const html = `
      <div>
        <h2><a href="javascript:void(0)">Invalid Link</a></h2>
        <p>Description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("returns Option.none when title element is missing", () => {
    const html = `
      <div>
        <a href="https://example.com">Link without h2</a>
        <p>Description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isNone(result)).toBe(true);
  });

  test("handles missing description gracefully", () => {
    const html = `
      <div>
        <h2><a href="https://example.com">Title</a></h2>
        <div class="b_tpcn">example.com</div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.description).toBe("");
  });

  test("handles missing source gracefully", () => {
    const html = `
      <div>
        <h2><a href="https://example.com">Title</a></h2>
        <p>Description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.source).toBe("");
  });

  test("accepts https URLs", () => {
    const html = `
      <div>
        <h2><a href="https://secure.example.com">Secure Site</a></h2>
        <p>Secure description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.url).toBe("https://secure.example.com");
  });

  test("accepts http URLs", () => {
    const html = `
      <div>
        <h2><a href="http://example.com">HTTP Site</a></h2>
        <p>Description</p>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.url).toBe("http://example.com");
  });

  test("trims whitespace from description and source", () => {
    const html = `
      <div>
        <h2><a href="https://example.com">Title</a></h2>
        <p>  Description with spaces  </p>
        <div class="b_tpcn">  example.com  </div>
      </div>
    `;

    const $ = cheerio.load(html);
    const element = $("div").get(0)!;
    const result = parseResultElement(element, $);

    expect(Option.isSome(result)).toBe(true);

    const value = pipe(result, Option.getOrThrow);
    expect(value.description).toBe("Description with spaces");
    expect(value.source).toBe("example.com");
  });
});
