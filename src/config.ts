import {
  Context,
  Effect,
  Either,
  Layer,
  Option,
  Schema,
  pipe,
  Match,
} from "effect";
import * as Arr from "effect/Array";

/**
 * Array of all supported search engine identifiers.
 * These engines can be used for web searches without requiring API keys.
 */
export const supportedSearchEngines = ["bing", "duckduckgo", "brave"] as const;

/**
 * Union type representing a supported search engine.
 * Can be one of: "bing", "duckduckgo", or "brave".
 */
export type SupportedEngine = (typeof supportedSearchEngines)[number];

const isSupportedEngine = (engine: string): engine is SupportedEngine =>
  engine === "bing" || engine === "duckduckgo" || engine === "brave";

const SupportedEngineSchema = Schema.Literal(...supportedSearchEngines);

const AppConfigSchema = Schema.Struct({
  defaultSearchEngine: SupportedEngineSchema,
  allowedSearchEngines: Schema.Array(Schema.String),
  proxyUrl: Schema.OptionFromUndefinedOr(Schema.String),
  useProxy: Schema.Boolean,
  enableCors: Schema.Boolean,
  corsOrigin: Schema.String,
  enableHttpServer: Schema.Boolean,
});

/**
 * Application configuration type decoded from environment variables.
 * Includes settings for search engines, proxy, CORS, and server mode.
 */
export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

/**
 * Effect Context Tag for accessing the application configuration.
 * Use this to retrieve the AppConfig in Effect programs.
 *
 * @example
 * ```typescript
 * const config = yield* AppConfigTag;
 * console.log(config.defaultSearchEngine);
 * ```
 */
export const AppConfigTag = Context.GenericTag<AppConfig>("AppConfig");

const readEnv = Effect.sync(() => ({ ...process.env }));

const parseAllowedEngines = (raw: Option.Option<string>) =>
  pipe(
    raw,
    Option.map((value) =>
      pipe(
        value.split(","),
        Arr.map((engine) => engine.trim().toLowerCase()),
        Arr.filter((engine) => engine.length > 0),
      ),
    ),
    Option.getOrElse(() => []),
  );

const normalizeDefaultEngine = (
  candidate: Option.Option<string>,
): SupportedEngine =>
  pipe(
    candidate,
    Option.map((engine) => engine.trim().toLowerCase()),
    Option.flatMap((engine) =>
      isSupportedEngine(engine)
        ? Option.some(engine)
        : Option.none<SupportedEngine>(),
    ),
    Option.getOrElse((): SupportedEngine => "brave"),
  );

const serverModes = ["both", "http", "stdio"] as const;
type ServerMode = (typeof serverModes)[number];

const parseServerMode = (
  raw: Option.Option<string>,
): Either.Either<ServerMode, Error> =>
  pipe(
    raw,
    Option.map((mode) => mode.trim().toLowerCase()),
    Option.match({
      onNone: () => Either.right<ServerMode>("both"),
      onSome: (mode) =>
        pipe(
          Match.value(mode),
          Match.when("both", () => Either.right<ServerMode>("both")),
          Match.when("http", () => Either.right<ServerMode>("http")),
          Match.when("stdio", () => Either.right<ServerMode>("stdio")),
          Match.orElse((invalid) =>
            Either.left(
              new Error(`Unsupported MODE value "${invalid}" provided.`),
            ),
          ),
        ),
    }),
  );

const parseBooleanEnv = (
  raw: Option.Option<string>,
  defaultValue: boolean,
): Either.Either<boolean, Error> =>
  pipe(
    raw,
    Option.map((value) => value.trim().toLowerCase()),
    Option.match({
      onNone: () => Either.right(defaultValue),
      onSome: (value) => {
        return pipe(
          Match.value(value),
          Match.when("true", () => Either.right(true)),
          Match.when("false", () => Either.right(false)),
          Match.orElse(() => {
            return Either.left(
              new Error(`Unsupported boolean value "${value}" provided.`),
            );
          }),
        );
      },
    }),
  );

const resolveBooleanEnv = (
  either: Either.Either<boolean, Error>,
  variable: string,
  fallback: boolean,
) =>
  Either.match(either, {
    onRight: Effect.succeed,
    onLeft: (error: Error) =>
      Effect.logWarning(error.message).pipe(
        Effect.annotateLogs({ variable, fallback: String(fallback) }),
        Effect.map(() => fallback),
      ),
  });

const buildConfigEffect = Effect.gen(function* (_) {
  const env = yield* _(readEnv);

  const defaultSearchEngineOption = pipe(
    Option.fromNullable(env.DEFAULT_SEARCH_ENGINE),
    Option.map((engine) => engine.trim()),
    Option.filter((engine) => engine.length > 0),
  );
  const initialDefaultEngine = normalizeDefaultEngine(
    defaultSearchEngineOption,
  );

  const rawAllowed = parseAllowedEngines(
    pipe(
      Option.fromNullable(env.ALLOWED_SEARCH_ENGINES),
      Option.map((value) => value.toLowerCase()),
    ),
  );
  const filteredAllowed = Arr.filter(rawAllowed, isSupportedEngine);

  yield* _(
    pipe(
      Match.value({ rawAllowed, filteredAllowed }),
      Match.when(
        ({ rawAllowed, filteredAllowed }) =>
          rawAllowed.length > 0 && filteredAllowed.length === 0,
        ({ rawAllowed }) =>
          Effect.logWarning(
            "Invalid ALLOWED_SEARCH_ENGINES specified. All values ignored; all engines enabled.",
          ).pipe(Effect.annotateLogs({ rawAllowed: rawAllowed.join(", ") })),
      ),
      Match.when(
        ({ rawAllowed, filteredAllowed }) =>
          filteredAllowed.length !== rawAllowed.length,
        ({ rawAllowed }) => {
          const invalid = Arr.filter(
            rawAllowed,
            (engine) => !isSupportedEngine(engine),
          );
          return Effect.logWarning(
            "Invalid search engines detected and ignored.",
          ).pipe(Effect.annotateLogs({ invalid: invalid.join(", ") }));
        },
      ),
      Match.orElse(() => Effect.succeed(undefined)),
    ),
  );

  const filteredSupported = filteredAllowed as ReadonlyArray<SupportedEngine>;

  const allowedSearchEngines: SupportedEngine[] = pipe(
    Match.value(Arr.isNonEmptyReadonlyArray(filteredSupported)),
    Match.when(true, () => [...filteredSupported]),
    Match.orElse(() => [] as SupportedEngine[]),
  );

  const defaultSearchEngine = yield* _(
    pipe(
      Match.value({ allowedSearchEngines, initialDefaultEngine }),
      Match.when(
        ({ allowedSearchEngines, initialDefaultEngine }) =>
          Arr.isNonEmptyReadonlyArray(allowedSearchEngines) &&
          !pipe(
            allowedSearchEngines,
            Arr.some((engine) => engine === initialDefaultEngine),
          ),
        ({ allowedSearchEngines, initialDefaultEngine }) => {
          const updatedDefault = allowedSearchEngines[0]!;
          return Effect.logWarning(
            "Default search engine is not included in allowed list. Switching to first allowed engine.",
          ).pipe(
            Effect.annotateLogs({
              previousDefault: initialDefaultEngine,
              newDefault: updatedDefault,
            }),
            Effect.as(updatedDefault),
          );
        },
      ),
      Match.orElse(({ initialDefaultEngine }) =>
        Effect.succeed(initialDefaultEngine),
      ),
    ),
  );

  const useProxy = yield* _(
    resolveBooleanEnv(
      parseBooleanEnv(Option.fromNullable(env.USE_PROXY), false),
      "USE_PROXY",
      false,
    ),
  );

  const enableCors = yield* _(
    resolveBooleanEnv(
      parseBooleanEnv(Option.fromNullable(env.ENABLE_CORS), false),
      "ENABLE_CORS",
      false,
    ),
  );

  const corsOrigin = pipe(
    Option.fromNullable(env.CORS_ORIGIN),
    Option.map((origin) => origin.trim()),
    Option.filter((origin) => origin.length > 0),
    Option.getOrElse(() => "*"),
  );

  const parsedMode = parseServerMode(Option.fromNullable(env.MODE));
  const mode = yield* _(
    Either.match(parsedMode, {
      onRight: Effect.succeed,
      onLeft: (error: Error) =>
        Effect.logWarning(error.message).pipe(
          Effect.annotateLogs({ variable: "MODE" }),
          Effect.map(() => "both" as ServerMode),
        ),
    }),
  );

  const enableHttpServer = mode === "both" || mode === "http";

  const proxyUrlOption = pipe(
    Option.fromNullable(env.PROXY_URL),
    Option.map((url) => url.trim()),
    Option.filter((url) => url.length > 0),
    Option.orElse(() =>
      useProxy ? Option.some("http://127.0.0.1:10809") : Option.none<string>(),
    ),
  );

  const proxyUrlEncoded = Option.match(proxyUrlOption, {
    onSome: (url) => url,
    onNone: () => undefined,
  });

  const baseConfig = {
    defaultSearchEngine,
    allowedSearchEngines,
    proxyUrl: proxyUrlEncoded,
    useProxy,
    enableCors,
    corsOrigin,
    enableHttpServer,
  } satisfies Schema.Schema.Encoded<typeof AppConfigSchema>;

  const config = pipe(baseConfig, Schema.decodeUnknownSync(AppConfigSchema));

  yield* _(
    Effect.logInfo("🔍 Default search engine set.").pipe(
      Effect.annotateLogs({ defaultSearchEngine: config.defaultSearchEngine }),
    ),
  );

  yield* _(
    pipe(
      Match.value(config.allowedSearchEngines),
      Match.when(
        (engines) => engines.length > 0,
        (engines) =>
          Effect.logInfo("🔍 Restricting search engines.").pipe(
            Effect.annotateLogs({
              allowedSearchEngines: engines.join(", "),
            }),
          ),
      ),
      Match.orElse(() =>
        Effect.logInfo("🔍 No search engine restrictions configured."),
      ),
    ),
  );

  yield* _(
    pipe(
      Match.value(config.useProxy),
      Match.when(true, () =>
        Effect.logInfo("🌐 Proxy enabled.").pipe(
          Effect.annotateLogs({
            proxyUrl: Option.getOrElse(config.proxyUrl, () => ""),
          }),
        ),
      ),
      Match.orElse(() =>
        Effect.logInfo("🌐 Proxy disabled. Set USE_PROXY=true to enable."),
      ),
    ),
  );

  yield* _(
    Effect.logInfo("🖥️ Server mode configured.").pipe(
      Effect.annotateLogs({ mode: mode.toUpperCase() }),
    ),
  );

  yield* _(
    pipe(
      Match.value(config),
      Match.when(
        ({ enableHttpServer }) => enableHttpServer,
        (cfg) =>
          pipe(
            Match.value(cfg.enableCors),
            Match.when(true, () =>
              Effect.logInfo("🔒 CORS enabled.").pipe(
                Effect.annotateLogs({ corsOrigin: cfg.corsOrigin }),
              ),
            ),
            Match.orElse(() =>
              Effect.logInfo(
                "🔒 CORS disabled. Set ENABLE_CORS=true to enable.",
              ),
            ),
          ),
      ),
      Match.orElse(() => Effect.succeed(undefined)),
    ),
  );

  return config;
});

/**
 * Effect Layer that provides the application configuration.
 * Reads and validates environment variables, then provides AppConfig to the Effect runtime.
 * This layer should be provided to the main Effect program.
 *
 * @example
 * ```typescript
 * const program = Effect.gen(function* () {
 *   const config = yield* getConfig;
 *   // ... use config
 * }).pipe(Effect.provide(AppConfigLayer));
 * ```
 */
export const AppConfigLayer = Layer.effect(AppConfigTag, buildConfigEffect);

/**
 * Effect accessor for retrieving the application configuration.
 * Equivalent to using AppConfigTag directly in Effect.gen.
 *
 * @returns Effect that provides the current AppConfig
 *
 * @example
 * ```typescript
 * const config = yield* getConfig;
 * ```
 */
export const getConfig = AppConfigTag;

/**
 * Retrieves the proxy URL from the configuration if proxy is enabled.
 * Returns an Option containing the encoded proxy URL, or None if proxy is disabled.
 *
 * @returns Effect that resolves to Option<string> containing the proxy URL if enabled
 *
 * @example
 * ```typescript
 * const proxyUrl = yield* getProxyUrl();
 * pipe(
 *   proxyUrl,
 *   Option.match({
 *     onSome: (url) => console.log("Using proxy:", url),
 *     onNone: () => console.log("Proxy disabled"),
 *   })
 * );
 * ```
 */
export const getProxyUrl = () =>
  Effect.map(getConfig, (config) =>
    config.useProxy
      ? pipe(
          config.proxyUrl,
          Option.map((url) => encodeURI(url)),
        )
      : Option.none<string>(),
  );
