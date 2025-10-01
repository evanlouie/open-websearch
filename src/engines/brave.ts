import axios, { AxiosRequestConfig } from "axios";
import * as cheerio from "cheerio";
import { Effect } from "effect";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getProxyUrl, type AppConfig } from "../config.js";
import { SearchEngineError, type SearchResult } from "../types.js";

const createRequestOptions = (proxyUrl?: string): AxiosRequestConfig => {
  const options: AxiosRequestConfig = {
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

  if (proxyUrl) {
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    options.httpAgent = proxyAgent;
    options.httpsAgent = proxyAgent;
  }

  return options;
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

const parseResults = (html: string): SearchResult[] => {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  const resultsContainer = $("#results");
  resultsContainer.find(".snippet").each((_, element) => {
    const resultElement = $(element);
    const title = resultElement.find(".title").text().trim();
    const url = resultElement.find("a.heading-serpresult").attr("href");
    const description = resultElement
      .find(".snippet-description")
      .text()
      .trim();
    const source = resultElement.find(".sitename").text().trim();

    if (title && url) {
      results.push({
        title,
        url,
        description,
        source,
        engine: "brave",
      });
    }
  });

  return results;
};

export const searchBrave = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    const proxyUrl = yield* _(getProxyUrl());
    const requestOptions = createRequestOptions(proxyUrl);

    let allResults: SearchResult[] = [];
    let offset = 0;

    while (allResults.length < limit) {
      const response = yield* _(fetchResults(query, offset, requestOptions));
      const pageResults = yield* _(
        Effect.sync(() => parseResults(response.data)),
      );

      allResults = allResults.concat(pageResults);

      if (pageResults.length === 0) {
        yield* _(
          Effect.logWarning(
            "⚠️ Brave returned no additional Brave results, ending early.",
          ).pipe(Effect.annotateLogs({ engine: "brave", query })),
        );
        break;
      }

      offset += 1;
    }

    return allResults.slice(0, limit);
  });
