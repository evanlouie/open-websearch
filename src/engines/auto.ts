import { Effect, pipe } from "effect";
import * as Arr from "effect/Array";
import { SearchEngineError, type SearchResult } from "../types.js";
import { type AppConfig, type SupportedEngine } from "../config.js";
import { searchBing } from "./bing.js";
import { searchBrave } from "./brave.js";
import { searchDuckDuckGo } from "./duckduckgo.js";

type FallbackEngine = Exclude<SupportedEngine, "auto">;

export interface EngineDefinition {
  readonly engine: FallbackEngine;
  readonly search: (
    query: string,
    limit: number,
  ) => Effect.Effect<SearchResult[], SearchEngineError, AppConfig>;
}

const fallbackEngines: ReadonlyArray<EngineDefinition> = [
  { engine: "bing", search: searchBing },
  { engine: "brave", search: searchBrave },
  { engine: "duckduckgo", search: searchDuckDuckGo },
] as const;

const executeAttempt = (
  query: string,
  limit: number,
  attempt: EngineDefinition,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  pipe(
    Effect.gen(function* (_) {
      yield* _(
        Effect.logDebug("Auto engine attempting search.").pipe(
          Effect.annotateLogs({
            query,
            engine: attempt.engine,
            limit,
          }),
        ),
      );

      const results = yield* _(attempt.search(query, limit));

      yield* _(
        Effect.logInfo("Auto engine succeeded.").pipe(
          Effect.annotateLogs({
            query,
            engine: attempt.engine,
            resultCount: results.length,
          }),
        ),
      );

      return results;
    }),
    Effect.catchAll((error) =>
      Effect.logWarning("Auto engine attempt failed.").pipe(
        Effect.annotateLogs({
          query,
          engine: attempt.engine,
          error: error instanceof Error ? error.message : String(error),
        }),
        Effect.flatMap(() => Effect.fail(error)),
      ),
    ),
  );

const executeWithFallback = (
  query: string,
  limit: number,
  attempts: ReadonlyArray<EngineDefinition>,
): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
  pipe(
    attempts,
    Arr.match({
      onEmpty: () =>
        Effect.fail(
          new SearchEngineError(
            "auto",
            `Auto search cannot proceed for query "${query}" because no fallback engines are configured.`,
          ),
        ),
      onNonEmpty: (nonEmptyAttempts) => {
        const [current, ...rest] = nonEmptyAttempts;

        return executeAttempt(query, limit, current).pipe(
          Effect.catchAll((error) =>
            pipe(
              rest,
              Arr.match({
                onEmpty: () => Effect.fail(error),
                onNonEmpty: (remaining) => {
                  const [next] = remaining;

                  return Effect.logWarning(
                    "Auto engine falling back to next engine.",
                  ).pipe(
                    Effect.annotateLogs({
                      query,
                      failedEngine: current.engine,
                      nextEngine: next.engine,
                    }),
                    Effect.flatMap(() =>
                      executeWithFallback(query, limit, remaining),
                    ),
                  );
                },
              }),
            ),
          ),
        );
      },
    }),
  );

export const createAutoSearch =
  (attempts: ReadonlyArray<EngineDefinition>) =>
  (
    query: string,
    limit: number,
  ): Effect.Effect<SearchResult[], SearchEngineError, AppConfig> =>
    executeWithFallback(query, limit, attempts);

export const searchAuto = createAutoSearch(fallbackEngines);
