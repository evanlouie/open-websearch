import axios from "axios";
import * as cheerio from "cheerio";
import { Effect, pipe } from "effect";
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

const parseResults = (html: string): SearchResult[] => {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $("#b_content")
    .children()
    .find("#b_results")
    .children()
    .each((_, element) => {
      const titleElement = $(element).find("h2");
      const linkElement = $(element).find("a");
      const snippetElement = $(element).find("p").first();

      if (titleElement.length && linkElement.length) {
        const url = linkElement.attr("href");
        if (url && url.startsWith("http")) {
          const sourceElement = $(element).find(".b_tpcn");
          results.push({
            title: titleElement.text(),
            url,
            description: snippetElement.text().trim() || "",
            source: sourceElement.text().trim() || "",
            engine: "bing",
          });
        }
      }
    });

  return results;
};

export const searchBing = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    yield* _(getConfig);

    let allResults = List.empty<SearchResult>();
    let collected = 0;
    let page = 0;

    while (collected < limit) {
      const response = yield* _(fetchResults(query, page));
      const pageResults = yield* _(
        Effect.sync(() => parseResults(response.data)),
      );

      const pageResultsList = List.fromIterable(pageResults);
      const pageResultsCount = List.size(pageResultsList);

      allResults = pipe(allResults, List.appendAll(pageResultsList));
      collected += pageResultsCount;

      if (pageResultsCount === 0) {
        yield* _(
          Effect.logWarning(
            "⚠️ Bing returned no additional Bing results, ending early.",
          ).pipe(Effect.annotateLogs({ engine: "bing", query })),
        );
        break;
      }

      page += 1;
    }

    return pipe(allResults, List.take(limit), List.toArray);
  });
