import axios from "axios";
import * as cheerio from "cheerio";
import { Effect, Match, Option, pipe } from "effect";
import * as Arr from "effect/Array";
import * as List from "effect/List";
import { SearchEngineError, type SearchResult } from "../types.js";
import { getConfig, type AppConfig } from "../config.js";

const fetchResults = (query: string, page: number) =>
  Effect.tryPromise({
    try: () =>
      axios.get("https://www.bing.com/search", {
        params: {
          q: query,
          first: 1 + page * 10,
        },
        headers: {
          authority: "www.bing.com",
          ect: "3g",
          pragma: "no-cache",
          "sec-ch-ua-arch": '"x86"',
          "sec-ch-ua-bitness": '"64"',
          "sec-ch-ua-full-version": '"112.0.5615.50"',
          "sec-ch-ua-full-version-list":
            '"Chromium";v="112.0.5615.50", "Google Chrome";v="112.0.5615.50", "Not:A-Brand";v="99.0.0.0"',
          "sec-ch-ua-model": '""',
          "sec-ch-ua-platform-version": '"15.0.0"',
          "sec-fetch-user": "?1",
          "upgrade-insecure-requests": "1",
          Cookie:
            "MUID=3727DBB14FD763511D80CDBD4ED262EF; _HPVN=CS=eyJQbiI6eyJDbiI6MSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiUCJ9LCJTYyI6eyJDbiI6MSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiSCJ9LCJReiI6eyJDbiI6MSwiU3QiOjAsIlFzIjowLCJQcm9kIjoiVCJ9LCJBcCI6dHJ1ZSwiTXV0ZSI6dHJ1ZSwiTGFkIjoiMjAyNS0wNi0yMVQwMDowMDowMFoiLCJJb3RkIjowLCJHd2IiOjAsIlRucyI6MCwiRGZ0IjpudWxsLCJNdnMiOjAsIkZsdCI6MCwiSW1wIjoxNSwiVG9ibiI6MH0=; SRCHHPGUSR=SRCHLANG=en&IG=9A53F826E9C9432497327CA995144E14&DM=0&BRW=N&BRH=T&CW=1202&CH=1289&SCW=1185&SCH=2279&DPR=1.0&UTC=480&HV=1750505768&HVE=notFound&WTS=63886101120&PV=15.0.0&PRVCW=1202&PRVCH=1289&EXLTT=13",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36",
          Accept: "*/*",
          Host: "www.bing.com",
          Connection: "keep-alive",
        },
      }),
    catch: (cause) =>
      new SearchEngineError(
        "bing",
        `Failed to fetch Bing search results for query "${query}"`,
        { cause },
      ),
  });

/**
 * Parses a single Bing search result element into a SearchResult object.
 * Extracts title, URL, description, and source from the HTML element.
 *
 * @param element - The cheerio Element to parse (should be a search result item)
 * @param $ - The cheerio instance used for DOM traversal
 * @returns Option containing the parsed SearchResult, or None if parsing fails
 */
export const parseResultElement = (
  element: cheerio.Element,
  $: ReturnType<typeof cheerio.load>,
): Option.Option<SearchResult> => {
  const titleElement = $(element).find("h2");
  const linkElement = $(element).find("a");
  const snippetElement = $(element).find("p").first();

  return pipe(
    Option.fromNullable(linkElement.attr("href")),
    Option.filter((url) => url.startsWith("http")),
    Option.filter(() => titleElement.length > 0 && linkElement.length > 0),
    Option.map((url) => {
      const sourceElement = $(element).find(".b_tpcn");
      return {
        title: titleElement.text(),
        url,
        description: snippetElement.text().trim() || "",
        source: sourceElement.text().trim() || "",
        engine: "bing" as const,
      };
    }),
  );
};

const parseResults = (html: string): SearchResult[] => {
  const $ = cheerio.load(html);
  const elements = $("#b_content")
    .children()
    .find("#b_results")
    .children()
    .toArray();

  return pipe(
    Arr.fromIterable(elements),
    Arr.filterMap((el) => parseResultElement(el, $)),
  );
};

const fetchPage = (
  query: string,
  page: number,
  accumulatedResults: List.List<SearchResult>,
  limit: number,
): Effect.Effect<List.List<SearchResult>, SearchEngineError, AppConfig> =>
  pipe(
    Match.value(List.size(accumulatedResults) >= limit),
    Match.when(true, () => Effect.succeed(accumulatedResults)),
    Match.orElse(() =>
      Effect.gen(function* (_) {
        const response = yield* _(fetchResults(query, page));
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
                "⚠️ Bing returned no additional Bing results, ending early.",
              ).pipe(
                Effect.annotateLogs({ engine: "bing", query }),
                Effect.as(updatedResults),
              ),
            ),
            Match.orElse(() =>
              fetchPage(query, page + 1, updatedResults, limit),
            ),
          ),
        );
      }),
    ),
  );

/**
 * Searches Bing for the given query and returns up to `limit` results.
 * Fetches multiple pages if needed to satisfy the limit.
 * Results are scraped from Bing's HTML search results pages.
 *
 * @param query - The search query string
 * @param limit - Maximum number of results to return
 * @returns Effect that resolves to an array of SearchResults, or fails with SearchEngineError
 * @requires AppConfig - Requires application configuration from Effect context
 *
 * @example
 * ```typescript
 * const results = yield* searchBing("typescript effect", 10);
 * ```
 */
export const searchBing = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    yield* _(getConfig);

    const results = yield* _(fetchPage(query, 0, List.empty(), limit));

    return pipe(results, List.take(limit), List.toArray);
  });
