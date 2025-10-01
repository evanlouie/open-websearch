import axios, { AxiosRequestConfig } from "axios";
import * as cheerio from "cheerio";
import { Effect } from "effect";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getProxyUrl, type AppConfig } from "../config.js";
import { SearchEngineError, type SearchResult } from "../types.js";

interface DuckDuckGoSearchItem {
  t?: string;
  u?: string;
  a?: string;
  i?: string;
  sn?: string;
  n?: boolean;
}

const createProxyAwareOptions = (proxyUrl?: string): AxiosRequestConfig => {
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

const searchDuckDuckGoPreloadUrlPromise = async (
  query: string,
  maxResults: number,
  proxyUrl?: string,
): Promise<SearchResult[]> => {
  const results: SearchResult[] = [];
  const requestOptions = createProxyAwareOptions(proxyUrl);

  const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&t=h_&ia=web`;
  const response = await axios.get(searchUrl, requestOptions);

  let basePreloadUrl = "";
  const $ = cheerio.load(response.data);
  $('link[rel="preload"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.includes("links.duckduckgo.com/d.js")) {
      basePreloadUrl = href;
      return false;
    }
  });

  if (!basePreloadUrl) {
    $("#deep_preload_script").each((_, el) => {
      const src = $(el).attr("src");
      if (src && src.includes("links.duckduckgo.com/d.js")) {
        basePreloadUrl = src;
        return false;
      }
    });
  }

  if (!basePreloadUrl) {
    const urlMatch = response.data.match(
      /https:\/\/links\.duckduckgo\.com\/d\.js\?[^"']+/i,
    );
    if (urlMatch) {
      basePreloadUrl = urlMatch[0];
    }
  }

  if (!basePreloadUrl) {
    return [];
  }

  const preloadUrl = new URL(basePreloadUrl);
  let offset = 0;
  let hasMoreResults = true;

  while (results.length < maxResults && hasMoreResults) {
    preloadUrl.searchParams.set("s", offset.toString());

    const currentPageUrl = preloadUrl.toString();
    const pageResponse = await axios.get(currentPageUrl, {
      ...requestOptions,
      headers: {
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
      },
    });

    const jsonpMatch = pageResponse.data.match(
      /DDG\.pageLayout\.load\('d',\s*(\[.*?\])\s*\);/s,
    );

    if (!jsonpMatch || !jsonpMatch[1]) {
      hasMoreResults = false;
      break;
    }

    const jsonData = JSON.parse(jsonpMatch[1]) as DuckDuckGoSearchItem[];
    if (jsonData.length === 0) {
      hasMoreResults = false;
      break;
    }

    let validCount = 0;
    for (const item of jsonData) {
      if (item.n) continue;
      validCount += 1;

      if (results.length >= maxResults) break;

      results.push({
        title: item.t ?? "",
        url: item.u ?? "",
        description: item.a ?? "",
        source: item.i ?? item.sn ?? "",
        engine: "duckduckgo",
      });
    }

    if (validCount === 0) {
      hasMoreResults = false;
    }

    offset += validCount;
  }

  return results.slice(0, maxResults);
};

const searchDuckDuckGoHtmlPromise = async (
  query: string,
  maxResults: number,
  proxyUrl?: string,
): Promise<SearchResult[]> => {
  const requestUrl = "https://html.duckduckgo.com/html/";
  const results: SearchResult[] = [];
  const requestOptions: AxiosRequestConfig = {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Apifox/1.0.0 (https://apifox.com)",
      Accept: "*/*",
      Host: "html.duckduckgo.com",
      Connection: "keep-alive",
    },
  };

  if (proxyUrl) {
    const proxyAgent = new HttpsProxyAgent(proxyUrl);
    requestOptions.httpAgent = proxyAgent;
    requestOptions.httpsAgent = proxyAgent;
  }

  let offset = 0;
  let response = await axios.post(
    requestUrl,
    new URLSearchParams({ q: query }).toString(),
    requestOptions,
  );

  let $ = cheerio.load(response.data);
  let items = $("div.result");

  const collect = () => {
    items.each((_, el) => {
      if (results.length >= maxResults) return false;

      const titleEl = $(el).find("a.result__a");
      const snippetEl = $(el).find(".result__snippet");
      const title = titleEl.text().trim();
      const url = titleEl.attr("href") ?? "";
      const description = snippetEl.text().trim();
      const sourceEl = $(el).find(".result__url");
      const source = sourceEl.text().trim();

      if (title && url && !$(el).hasClass("result--ad")) {
        results.push({
          title,
          url,
          description,
          source,
          engine: "duckduckgo",
        });
      }
    });
  };

  collect();

  while (results.length < maxResults && items.length > 0) {
    offset += items.length;

    response = await axios.post(
      requestUrl,
      new URLSearchParams({
        q: query,
        s: offset.toString(),
        dc: offset.toString(),
        v: "l",
        o: "json",
        api: "d.js",
      }).toString(),
      requestOptions,
    );

    $ = cheerio.load(response.data);
    items = $("div.result");
    collect();
  }

  return results.slice(0, maxResults);
};

export const searchDuckDuckGo = (
  query: string,
  limit: number,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  Effect.gen(function* (_) {
    const proxyUrl = yield* _(getProxyUrl());

    const preloadResults = yield* _(
      Effect.orElseSucceed(
        Effect.tapError(
          Effect.tryPromise({
            try: () =>
              searchDuckDuckGoPreloadUrlPromise(query, limit, proxyUrl),
            catch: (cause) =>
              new SearchEngineError(
                "duckduckgo",
                `DuckDuckGo preload search failed for query "${query}"`,
                { cause },
              ),
          }),
          (error) =>
            Effect.sync(() => {
              console.error(
                "DuckDuckGo preload URL method failed, falling back to HTML:",
                error,
              );
            }),
        ),
        () => [],
      ),
    );

    if (preloadResults.length > 0) {
      return preloadResults;
    }

    return yield* _(
      Effect.tryPromise({
        try: () => searchDuckDuckGoHtmlPromise(query, limit, proxyUrl),
        catch: (cause) =>
          new SearchEngineError(
            "duckduckgo",
            `DuckDuckGo HTML search failed for query "${query}"`,
            { cause },
          ),
      }),
    );
  });
