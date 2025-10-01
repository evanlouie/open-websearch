import axios, { AxiosRequestConfig } from "axios";
import * as cheerio from "cheerio";
import { Effect, Either, Match, Option, pipe } from "effect";
import * as Arr from "effect/Array";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getProxyUrl, type AppConfig } from "../config.js";
import { SearchEngineError, type SearchResult } from "../types.js";

interface DuckDuckGoSearchItem {
  /** Result title. */
  t?: string;
  /** Result URL. */
  u?: string;
  /** Description/abstract text. */
  a?: string;
  /** Icon/image URL. */
  i?: string;
  /** Source name. */
  sn?: string;
  /** Navigation item flag. */
  n?: boolean;
}

const createProxyAwareOptions = (
  proxyUrl: Option.Option<string>,
): AxiosRequestConfig => {
  const baseOptions: AxiosRequestConfig = {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
      Connection: "keep-alive",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Encoding": "gzip, deflate, br",
      "sec-ch-ua":
        '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "upgrade-insecure-requests": "1",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document",
      referer: "https://duckduckgo.com/",
      "accept-language": "en-US,en;q=0.9",
    },
  };

  return pipe(
    proxyUrl,
    Option.match({
      onNone: () => baseOptions,
      onSome: (url) => {
        const proxyAgent = new HttpsProxyAgent(url);
        return {
          ...baseOptions,
          httpAgent: proxyAgent,
          httpsAgent: proxyAgent,
        };
      },
    }),
  );
};

/**
 * Extracts the DuckDuckGo preload URL from the HTML page.
 * Attempts to find the d.js preload URL from link tags, script tags, or via regex.
 * This URL is used to fetch paginated search results in JSONP format.
 *
 * @param html - The HTML content from the DuckDuckGo search page
 * @returns Option containing the preload URL if found, or None otherwise
 */
export const extractPreloadUrl = (html: string): Option.Option<string> => {
  const $ = cheerio.load(html);

  const fromPreloadLink = pipe(
    Arr.fromIterable($('link[rel="preload"]').toArray()),
    Arr.findFirst((el: cheerio.Element) => {
      const href = $(el).attr("href");
      return href !== undefined && href.includes("links.duckduckgo.com/d.js");
    }),
    Option.map((el) => $(el).attr("href")!),
  );

  const fromScript = pipe(
    Arr.fromIterable($("#deep_preload_script").toArray()),
    Arr.findFirst((el: cheerio.Element) => {
      const src = $(el).attr("src");
      return src !== undefined && src.includes("links.duckduckgo.com/d.js");
    }),
    Option.map((el) => $(el).attr("src")!),
  );

  const fromRegex = pipe(
    Option.fromNullable(
      html.match(/https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/i),
    ),
    Option.map((match) => match[0]),
  );

  return pipe(
    fromPreloadLink,
    Option.orElse(() => fromScript),
    Option.orElse(() => fromRegex),
  );
};

/**
 * Converts a DuckDuckGo search item (from JSONP response) into a SearchResult.
 * Handles missing fields by providing empty string defaults.
 *
 * @param item - The raw DuckDuckGo search item from the JSONP response
 * @returns A normalized SearchResult object
 */
export const parseJsonData = (item: DuckDuckGoSearchItem): SearchResult => ({
  title: pipe(
    Option.fromNullable(item.t),
    Option.getOrElse(() => ""),
  ),
  url: pipe(
    Option.fromNullable(item.u),
    Option.getOrElse(() => ""),
  ),
  description: pipe(
    Option.fromNullable(item.a),
    Option.getOrElse(() => ""),
  ),
  source: pipe(
    Option.fromNullable(item.i),
    Option.orElse(() => Option.fromNullable(item.sn)),
    Option.getOrElse(() => ""),
  ),
  engine: "duckduckgo",
});

/**
 * Builds a paginated search URL by modifying the preload URL's search parameters.
 * Sets the 's' parameter to the given offset for pagination.
 *
 * @param preloadUrl - The base preload URL to modify
 * @param offset - The pagination offset (number of results to skip)
 * @returns The complete URL string with updated pagination parameter
 */
export const buildSearchUrl = (preloadUrl: URL, offset: number): string => {
  preloadUrl.searchParams.set("s", offset.toString());
  return preloadUrl.toString();
};

/**
 * Creates HTTP headers for requesting DuckDuckGo preload pages.
 * These headers mimic a real browser to avoid detection/blocking.
 *
 * @returns A record of HTTP header names and values
 */
export const createPreloadHeaders = (): Record<string, string> => ({
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
  Connection: "keep-alive",
  Accept: "*/*",
  "Accept-Encoding": "gzip, deflate, br",
  "sec-ch-ua":
    '"Chromium";v="112", "Google Chrome";v="112", "Not:A-Brand";v="99"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-site": "same-site",
  "sec-fetch-mode": "no-cors",
  "sec-fetch-dest": "script",
  referer: "https://duckduckgo.com/",
  "accept-language": "en-US,en;q=0.9",
});

const parseJsonSafe = (
  jsonString: string,
): Either.Either<DuckDuckGoSearchItem[], unknown> =>
  Either.try({
    try: () => JSON.parse(jsonString) as DuckDuckGoSearchItem[],
    catch: (error) => error,
  });

/**
 * Parses a JSONP response from DuckDuckGo into an array of search items.
 * Extracts the JSON array from the JSONP wrapper function and parses it safely.
 *
 * @param responseData - The raw JSONP response string from DuckDuckGo
 * @returns Option containing the parsed array of search items, or None if parsing fails
 */
export const parseJsonpResponse = (
  responseData: string,
): Option.Option<DuckDuckGoSearchItem[]> =>
  pipe(
    Option.fromNullable(
      responseData.match(/DDG\.pageLayout\.load\('d',\s*(\[.*?\])\s*\);/s),
    ),
    Option.filter((match) => match[1] !== undefined),
    Option.map((match) => match[1]!),
    Option.flatMap((jsonString) =>
      pipe(
        parseJsonSafe(jsonString),
        Either.match({
          onLeft: () => Option.none(),
          onRight: (data) => Option.some(data),
        }),
      ),
    ),
  );

/**
 * Processes raw DuckDuckGo search items into SearchResults.
 * Filters out navigation items and limits results to the remaining needed count.
 *
 * @param jsonData - Array of raw search items from DuckDuckGo JSONP
 * @param maxResults - Maximum total results desired
 * @param accumulatedResults - Results collected so far
 * @returns Object containing new results to add and count of valid items found
 */
export const processSearchItems = (
  jsonData: DuckDuckGoSearchItem[],
  maxResults: number,
  accumulatedResults: SearchResult[],
): {
  newResults: SearchResult[];
  validCount: number;
} => {
  const validItems = pipe(
    jsonData,
    Arr.filter((item) => !item.n),
  );
  const newResults = pipe(
    validItems,
    Arr.map(parseJsonData),
    Arr.take(maxResults - accumulatedResults.length),
  );
  return {
    newResults,
    validCount: validItems.length,
  };
};

const fetchPreloadPage = (
  preloadUrl: URL,
  offset: number,
  accumulatedResults: SearchResult[],
  maxResults: number,
  requestOptions: AxiosRequestConfig,
): Effect.Effect<SearchResult[], SearchEngineError> =>
  pipe(
    Match.value(accumulatedResults.length >= maxResults),
    Match.when(true, () => Effect.succeed(accumulatedResults)),
    Match.orElse(() =>
      Effect.gen(function* (_) {
        const currentPageUrl = buildSearchUrl(preloadUrl, offset);
        const pageResponse = yield* _(
          Effect.tryPromise({
            try: () =>
              axios.get(currentPageUrl, {
                ...requestOptions,
                headers: createPreloadHeaders(),
              }),
            catch: (cause) =>
              new SearchEngineError(
                "duckduckgo",
                `Failed to fetch DuckDuckGo preload page at offset ${offset}`,
                { cause },
              ),
          }),
        );

        const jsonDataOption = parseJsonpResponse(pageResponse.data);

        return yield* _(
          pipe(
            jsonDataOption,
            Option.match({
              onNone: () => Effect.succeed(accumulatedResults),
              onSome: (jsonData) =>
                pipe(
                  Match.value(jsonData.length),
                  Match.when(0, () => Effect.succeed(accumulatedResults)),
                  Match.orElse(() => {
                    const { newResults, validCount } = processSearchItems(
                      jsonData,
                      maxResults,
                      accumulatedResults,
                    );
                    const updatedResults = [
                      ...accumulatedResults,
                      ...newResults,
                    ];

                    return pipe(
                      Match.value(validCount),
                      Match.when(0, () => Effect.succeed(updatedResults)),
                      Match.orElse((count) =>
                        fetchPreloadPage(
                          preloadUrl,
                          offset + count,
                          updatedResults,
                          maxResults,
                          requestOptions,
                        ),
                      ),
                    );
                  }),
                ),
            }),
          ),
        );
      }),
    ),
  );

const searchDuckDuckGoPreloadUrl = (
  query: string,
  maxResults: number,
  proxyUrl: Option.Option<string>,
): Effect.Effect<SearchResult[], SearchEngineError> =>
  Effect.gen(function* (_) {
    const requestOptions = createProxyAwareOptions(proxyUrl);

    const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`;
    const response = yield* _(
      Effect.tryPromise({
        try: () => axios.get(searchUrl, requestOptions),
        catch: (cause) =>
          new SearchEngineError(
            "duckduckgo",
            `Failed to fetch DuckDuckGo search page for query "${query}"`,
            { cause },
          ),
      }),
    );

    const basePreloadUrlOption = extractPreloadUrl(response.data);

    return yield* _(
      pipe(
        basePreloadUrlOption,
        Option.match({
          onNone: () => Effect.succeed([]),
          onSome: (basePreloadUrl) => {
            const preloadUrl = new URL(basePreloadUrl);
            return fetchPreloadPage(
              preloadUrl,
              0,
              [],
              maxResults,
              requestOptions,
            ).pipe(Effect.map((results) => results.slice(0, maxResults)));
          },
        }),
      ),
    );
  });

/**
 * Parses a single DuckDuckGo HTML search result element into a SearchResult object.
 * Used as a fallback when the JSONP preload method fails.
 * Filters out ad results.
 *
 * @param element - The cheerio Element to parse (should be a .result div)
 * @param $ - The cheerio instance used for DOM traversal
 * @returns Option containing the parsed SearchResult, or None if required fields are missing or it's an ad
 */
export const parseHtmlResult = (
  element: cheerio.Element,
  $: ReturnType<typeof cheerio.load>,
): Option.Option<SearchResult> => {
  const titleEl = $(element).find("a.result__a");
  const snippetEl = $(element).find(".result__snippet");
  const title = titleEl.text().trim();
  const url = pipe(
    Option.fromNullable(titleEl.attr("href")),
    Option.getOrElse(() => ""),
  );
  const description = snippetEl.text().trim();
  const sourceEl = $(element).find(".result__url");
  const source = sourceEl.text().trim();

  return title && url && !$(element).hasClass("result--ad")
    ? Option.some({
        title,
        url,
        description,
        source,
        engine: "duckduckgo",
      })
    : Option.none();
};

const collectHtmlResults = (
  html: string,
  maxResults: number,
  currentResults: SearchResult[],
): SearchResult[] => {
  const $ = cheerio.load(html);
  const items = $("div.result");
  const remaining = maxResults - currentResults.length;

  const parseWithCheerio = (el: cheerio.Element): Option.Option<SearchResult> =>
    parseHtmlResult(el, $);

  const newResults = pipe(
    Arr.fromIterable(items.toArray()),
    Arr.filterMap(parseWithCheerio),
    Arr.take(remaining),
  );

  return [...currentResults, ...newResults];
};

/**
 * Creates URL search parameters for DuckDuckGo HTML search requests.
 * For the first page (offset=0), only includes the query.
 * For subsequent pages, includes pagination parameters.
 *
 * @param query - The search query string
 * @param offset - The pagination offset (0 for first page)
 * @returns URLSearchParams object ready to be stringified for POST body
 */
export const createSearchParams = (
  query: string,
  offset: number,
): URLSearchParams =>
  offset === 0
    ? new URLSearchParams({ q: query })
    : new URLSearchParams({
        q: query,
        s: offset.toString(),
        dc: offset.toString(),
        v: "l",
        o: "json",
        api: "d.js",
      });

const fetchHtmlPage = (
  query: string,
  offset: number,
  accumulatedResults: SearchResult[],
  maxResults: number,
  requestUrl: string,
  requestOptions: AxiosRequestConfig,
): Effect.Effect<SearchResult[], SearchEngineError> =>
  pipe(
    Match.value(accumulatedResults.length >= maxResults),
    Match.when(true, () => Effect.succeed(accumulatedResults)),
    Match.orElse(() =>
      Effect.gen(function* (_) {
        const params = createSearchParams(query, offset);

        const response = yield* _(
          Effect.tryPromise({
            try: () =>
              axios.post(requestUrl, params.toString(), requestOptions),
            catch: (cause) =>
              new SearchEngineError(
                "duckduckgo",
                `Failed to fetch DuckDuckGo HTML page at offset ${offset}`,
                { cause },
              ),
          }),
        );

        const html = response.data;
        const $ = cheerio.load(html);
        const items = $("div.result");
        const updatedResults = collectHtmlResults(
          html,
          maxResults,
          accumulatedResults,
        );

        return yield* _(
          pipe(
            Match.value({
              hasItems: items.length > 0,
              resultsLength: updatedResults.length,
            }),
            Match.when(
              ({ hasItems, resultsLength }) =>
                !hasItems || resultsLength >= maxResults,
              () => Effect.succeed(updatedResults),
            ),
            Match.orElse(() =>
              fetchHtmlPage(
                query,
                offset + items.length,
                updatedResults,
                maxResults,
                requestUrl,
                requestOptions,
              ),
            ),
          ),
        );
      }),
    ),
  );

const createHtmlRequestOptions = (
  proxyUrl: Option.Option<string>,
): AxiosRequestConfig => {
  const baseOptions: AxiosRequestConfig = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
      Accept: "*/*",
      Host: "html.duckduckgo.com",
      Connection: "keep-alive",
    },
  };

  return pipe(
    proxyUrl,
    Option.match({
      onNone: () => baseOptions,
      onSome: (url) => {
        const proxyAgent = new HttpsProxyAgent(url);
        return {
          ...baseOptions,
          httpAgent: proxyAgent,
          httpsAgent: proxyAgent,
        };
      },
    }),
  );
};

const searchDuckDuckGoHtml = (
  query: string,
  maxResults: number,
  proxyUrl: Option.Option<string>,
): Effect.Effect<SearchResult[], SearchEngineError> =>
  Effect.gen(function* (_) {
    const requestUrl = "https://html.duckduckgo.com/html/";
    const requestOptions = createHtmlRequestOptions(proxyUrl);

    const results = yield* _(
      fetchHtmlPage(query, 0, [], maxResults, requestUrl, requestOptions),
    );

    return results.slice(0, maxResults);
  });

/**
 * Searches DuckDuckGo for the given query and returns up to `limit` results.
 * Uses two strategies:
 * 1. Preload URL method (JSONP-based, preferred)
 * 2. HTML fallback method (if preload fails)
 *
 * Automatically falls back to HTML method if the preload method encounters errors.
 * Results are scraped from DuckDuckGo's search results pages.
 *
 * @param query - The search query string
 * @param limit - Maximum number of results to return
 * @returns Effect that resolves to an array of SearchResults, or fails with SearchEngineError
 * @requires AppConfig - Requires application configuration from Effect context
 *
 * @example
 * ```typescript
 * const results = yield* searchDuckDuckGo("functional programming", 10);
 * ```
 */
export const searchDuckDuckGo = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    const proxyUrl = yield* _(getProxyUrl());

    const preloadResults = yield* _(
      Effect.orElseSucceed(
        Effect.tapError(
          searchDuckDuckGoPreloadUrl(query, limit, proxyUrl),
          (error) =>
            Effect.logWarning(
              "DuckDuckGo preload URL method failed, falling back to HTML.",
            ).pipe(
              Effect.annotateLogs({
                engine: "duckduckgo",
                query,
                error: error instanceof Error ? error.message : String(error),
              }),
            ),
        ),
        () => [],
      ),
    );

    return yield* _(
      pipe(
        Match.value(preloadResults.length > 0),
        Match.when(true, () => Effect.succeed(preloadResults)),
        Match.orElse(() => searchDuckDuckGoHtml(query, limit, proxyUrl)),
      ),
    );
  });
