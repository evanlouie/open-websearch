import axios, { AxiosRequestConfig } from "axios";
import * as cheerio from "cheerio";
import { Effect, Match, Option, pipe } from "effect";
import * as Arr from "effect/Array";
import * as List from "effect/List";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getProxyUrl, type AppConfig } from "../config.js";
import { SearchEngineError, type SearchResult } from "../types.js";

/**
 * Creates axios request options with appropriate headers for Brave search.
 * If a proxy URL is provided, configures HTTP/HTTPS agents to use the proxy.
 *
 * @param proxyUrl - Optional proxy URL to use for the request
 * @returns Axios request configuration with headers and optional proxy agents
 */
export const createRequestOptions = (
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

const fetchResults = (
  query: string,
  offset: number,
  options: AxiosRequestConfig,
) =>
  Effect.tryPromise({
    try: () =>
      axios.get(
        `https://search.brave.com/search?q=${encodeURIComponent(query)}&source=web&offset=${offset}`,
        options,
      ),
    catch: (cause) =>
      new SearchEngineError(
        "brave",
        `Failed to fetch Brave search results for query "${query}"`,
        { cause },
      ),
  });

/**
 * Parses a single Brave search result element into a SearchResult object.
 * Extracts title, URL, description, and source from the HTML element.
 *
 * @param element - The cheerio Element to parse (should be a .snippet element)
 * @param $ - The cheerio instance used for DOM traversal
 * @returns Option containing the parsed SearchResult, or None if required fields are missing
 */
export const parseResultElement = (
  element: cheerio.Element,
  $: ReturnType<typeof cheerio.load>,
): Option.Option<SearchResult> => {
  const resultElement = $(element);
  const title = resultElement.find(".title").text().trim();
  const url = resultElement.find("a.heading-serpresult").attr("href");
  const description = resultElement.find(".snippet-description").text().trim();
  const source = resultElement.find(".sitename").text().trim();

  return title && url
    ? Option.some({
        title,
        url,
        description,
        source,
        engine: "brave" as const,
      })
    : Option.none();
};

const parseResults = (html: string): SearchResult[] => {
  const $ = cheerio.load(html);
  const elements = $("#results").find(".snippet").toArray();

  return pipe(
    Arr.fromIterable(elements),
    Arr.filterMap((el) => parseResultElement(el, $)),
  );
};

const fetchPage = (
  query: string,
  offset: number,
  accumulatedResults: List.List<SearchResult>,
  limit: number,
  requestOptions: AxiosRequestConfig,
): Effect.Effect<List.List<SearchResult>, SearchEngineError, AppConfig> =>
  pipe(
    Match.value(List.size(accumulatedResults) >= limit),
    Match.when(true, () => Effect.succeed(accumulatedResults)),
    Match.orElse(() =>
      Effect.gen(function* (_) {
        const response = yield* _(fetchResults(query, offset, requestOptions));
        const pageResults = yield* _(
          Effect.sync(() => parseResults(response.data)),
        );

        const pageResultsList = List.fromIterable(pageResults);
        const pageResultsCount = List.size(pageResultsList);

        const updatedResults = pipe(
          accumulatedResults,
          List.appendAll(pageResultsList),
        );

        return yield* _(
          pipe(
            Match.value(pageResultsCount),
            Match.when(0, () =>
              Effect.logWarning(
                "⚠️ Brave returned no additional Brave results, ending early.",
              ).pipe(
                Effect.annotateLogs({ engine: "brave", query }),
                Effect.as(updatedResults),
              ),
            ),
            Match.orElse(() =>
              fetchPage(
                query,
                offset + 1,
                updatedResults,
                limit,
                requestOptions,
              ),
            ),
          ),
        );
      }),
    ),
  );

/**
 * Searches Brave Search for the given query and returns up to `limit` results.
 * Fetches multiple pages if needed to satisfy the limit.
 * Results are scraped from Brave Search's HTML search results pages.
 *
 * @param query - The search query string
 * @param limit - Maximum number of results to return
 * @returns Effect that resolves to an array of SearchResults, or fails with SearchEngineError
 * @requires AppConfig - Requires application configuration from Effect context
 *
 * @example
 * ```typescript
 * const results = yield* searchBrave("web scraping best practices", 10);
 * ```
 */
export const searchBrave = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    const proxyUrl = yield* _(getProxyUrl());
    const requestOptions = createRequestOptions(proxyUrl);

    const results = yield* _(
      fetchPage(query, 0, List.empty(), limit, requestOptions),
    );

    return pipe(results, List.take(limit), List.toArray);
  });
