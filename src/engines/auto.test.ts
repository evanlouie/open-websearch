import { describe, test, expect } from "bun:test";
import { Effect, Option, Either } from "effect";
import { createAutoSearch, type EngineDefinition } from "./auto.js";
import { SearchEngineError, type SearchResult } from "../types.js";
import { AppConfigTag, getConfig, type AppConfig } from "../config.js";

const mockConfig: AppConfig = {
  defaultSearchEngine: "auto",
  allowedSearchEngines: [],
  proxyUrl: Option.none(),
  useProxy: false,
  enableCors: false,
  corsOrigin: "*",
  enableHttpServer: false,
};

const provideConfig = <A, E>(effect: Effect.Effect<A, E, AppConfig>) =>
  effect.pipe(Effect.provideService(AppConfigTag, mockConfig));

const createSuccessEngine = (
  engine: EngineDefinition["engine"],
  results: SearchResult[],
  calls: string[],
): EngineDefinition => ({
  engine,
  search: (query, limit) =>
    Effect.gen(function* (_) {
      yield* _(getConfig);
      calls.push(`${engine}:${query}:${limit}`);
      return results;
    }),
});

const createFailureEngine = (
  engine: EngineDefinition["engine"],
  message: string,
  calls: string[],
): EngineDefinition => ({
  engine,
  search: (query, limit) =>
    Effect.gen(function* (_) {
      yield* _(getConfig);
      calls.push(`${engine}:${query}:${limit}`);
      return yield* _(Effect.fail(new SearchEngineError(engine, message)));
    }),
});

describe("Auto engine fallback", () => {
  test("returns results from the first successful engine", async () => {
    const calls: string[] = [];
    const bingResults: SearchResult[] = [
      {
        title: "Bing Result",
        url: "https://bing.example.com",
        description: "Bing description",
        source: "bing",
        engine: "bing",
      },
    ];

    const autoSearch = createAutoSearch([
      createSuccessEngine("bing", bingResults, calls),
      createSuccessEngine("brave", [], calls),
      createSuccessEngine("duckduckgo", [], calls),
    ]);

    const results = await Effect.runPromise(
      provideConfig(autoSearch("effect", 5)),
    );

    expect(results).toEqual(bingResults);
    expect(calls).toEqual(["bing:effect:5"]);
  });

  test("falls back to brave when bing fails", async () => {
    const calls: string[] = [];
    const braveResults: SearchResult[] = [
      {
        title: "Brave Result",
        url: "https://brave.example.com",
        description: "Brave description",
        source: "brave",
        engine: "brave",
      },
    ];

    const autoSearch = createAutoSearch([
      createFailureEngine("bing", "bing failed", calls),
      createSuccessEngine("brave", braveResults, calls),
    ]);

    const results = await Effect.runPromise(
      provideConfig(autoSearch("fallback", 3)),
    );

    expect(results).toEqual(braveResults);
    expect(calls).toEqual(["bing:fallback:3", "brave:fallback:3"]);
  });

  test("falls back to duckduckgo when bing and brave fail", async () => {
    const calls: string[] = [];
    const duckResults: SearchResult[] = [
      {
        title: "DuckDuckGo Result",
        url: "https://duck.example.com",
        description: "DuckDuckGo description",
        source: "duckduckgo",
        engine: "duckduckgo",
      },
    ];

    const autoSearch = createAutoSearch([
      createFailureEngine("bing", "bing failed", calls),
      createFailureEngine("brave", "brave failed", calls),
      createSuccessEngine("duckduckgo", duckResults, calls),
    ]);

    const results = await Effect.runPromise(
      provideConfig(autoSearch("resilient", 7)),
    );

    expect(results).toEqual(duckResults);
    expect(calls).toEqual([
      "bing:resilient:7",
      "brave:resilient:7",
      "duckduckgo:resilient:7",
    ]);
  });

  test("propagates the final error when all engines fail", async () => {
    const calls: string[] = [];

    const autoSearch = createAutoSearch([
      createFailureEngine("bing", "bing failed", calls),
      createFailureEngine("brave", "brave failed", calls),
      createFailureEngine("duckduckgo", "duck failed", calls),
    ]);

    const outcome = await Effect.runPromise(
      provideConfig(Effect.either(autoSearch("stubborn", 2))),
    );

    expect(Either.isLeft(outcome)).toBe(true);
    if (Either.isLeft(outcome)) {
      expect(outcome.left).toBeInstanceOf(SearchEngineError);
      expect(outcome.left.engine).toBe("duckduckgo");
      expect(outcome.left.message).toBe("duck failed");
    }

    expect(calls).toEqual([
      "bing:stubborn:2",
      "brave:stubborn:2",
      "duckduckgo:stubborn:2",
    ]);
  });
});
