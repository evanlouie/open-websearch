import { Context, Effect, Layer, Schema, pipe } from "effect";

export const supportedSearchEngines = ["bing", "duckduckgo", "brave"] as const;

export type SupportedEngine = (typeof supportedSearchEngines)[number];

const SupportedEngineSchema = Schema.Literal(...supportedSearchEngines);

const AppConfigSchema = Schema.Struct({
  defaultSearchEngine: SupportedEngineSchema,
  allowedSearchEngines: Schema.Array(Schema.String),
  proxyUrl: Schema.optional(Schema.String),
  useProxy: Schema.Boolean,
  enableCors: Schema.Boolean,
  corsOrigin: Schema.String,
  enableHttpServer: Schema.Boolean,
});

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

export const AppConfigTag = Context.GenericTag<AppConfig>("AppConfig");

const readEnv = Effect.sync(() => ({ ...process.env }));

const parseAllowedEngines = (raw: string | undefined) =>
  raw
    ? raw
        .split(",")
        .map((engine) => engine.trim().toLowerCase())
        .filter((engine) => engine.length > 0)
    : [];

const normalizeDefaultEngine = (
  candidate: string | undefined,
): SupportedEngine => {
  if (
    candidate &&
    supportedSearchEngines.includes(candidate as SupportedEngine)
  ) {
    return candidate as SupportedEngine;
  }
  return "brave";
};

const buildConfigEffect = Effect.gen(function* (_) {
  const env = yield* _(readEnv);

  let defaultSearchEngine = normalizeDefaultEngine(env.DEFAULT_SEARCH_ENGINE);
  const rawAllowed = parseAllowedEngines(env.ALLOWED_SEARCH_ENGINES);
  const filteredAllowed = rawAllowed.filter(
    (engine): engine is SupportedEngine =>
      supportedSearchEngines.includes(engine as SupportedEngine),
  );

  if (rawAllowed.length > 0 && filteredAllowed.length === 0) {
    yield* _(
      Effect.sync(() => {
        console.error(
          `Invalid ALLOWED_SEARCH_ENGINES specified: ${rawAllowed.join(", ")}. All values ignored; all engines enabled.
`,
        );
      }),
    );
  } else if (filteredAllowed.length !== rawAllowed.length) {
    const invalid = rawAllowed.filter(
      (engine) => !supportedSearchEngines.includes(engine as SupportedEngine),
    );
    yield* _(
      Effect.sync(() => {
        console.error(
          `Invalid search engines detected and ignored: ${invalid.join(", ")}`,
        );
      }),
    );
  }

  const allowedSearchEngines =
    filteredAllowed.length > 0 ? filteredAllowed : [];

  if (
    allowedSearchEngines.length > 0 &&
    !allowedSearchEngines.includes(defaultSearchEngine)
  ) {
    const updatedDefault = allowedSearchEngines[0];
    yield* _(
      Effect.sync(() => {
        console.error(
          `Default search engine "${defaultSearchEngine}" is not allowed. Using "${updatedDefault}" instead.`,
        );
      }),
    );
    defaultSearchEngine = updatedDefault;
  }

  const useProxy = env.USE_PROXY === "true";
  const proxyUrl =
    env.PROXY_URL ?? (useProxy ? "http://127.0.0.1:10809" : undefined);
  const enableCors = env.ENABLE_CORS === "true";
  const corsOrigin = env.CORS_ORIGIN ?? "*";
  const enableHttpServer = env.MODE
    ? ["both", "http"].includes(env.MODE)
    : true;

  const baseConfig = {
    defaultSearchEngine,
    allowedSearchEngines,
    proxyUrl,
    useProxy,
    enableCors,
    corsOrigin,
    enableHttpServer,
  } satisfies AppConfig;

  const config = pipe(baseConfig, Schema.decodeUnknownSync(AppConfigSchema));

  yield* _(
    Effect.sync(() => {
      console.error(`🔍 Default search engine: ${config.defaultSearchEngine}`);
    }),
  );

  if (config.allowedSearchEngines.length > 0) {
    yield* _(
      Effect.sync(() => {
        console.error(
          `🔍 Allowed search engines: ${config.allowedSearchEngines.join(", ")}`,
        );
      }),
    );
  } else {
    yield* _(
      Effect.sync(() => {
        console.error(
          `🔍 No search engine restrictions, all engines can be used`,
        );
      }),
    );
  }

  if (config.useProxy) {
    yield* _(
      Effect.sync(() => {
        console.error(`🌐 Using proxy: ${config.proxyUrl}`);
      }),
    );
  } else {
    yield* _(
      Effect.sync(() => {
        console.error(`🌐 No proxy configured (set USE_PROXY=true to enable)`);
      }),
    );
  }

  const mode = env.MODE ?? (config.enableHttpServer ? "both" : "stdio");
  yield* _(
    Effect.sync(() => {
      console.error(`🖥️ Server mode: ${mode.toUpperCase()}`);
    }),
  );

  if (config.enableHttpServer) {
    if (config.enableCors) {
      yield* _(
        Effect.sync(() => {
          console.error(`🔒 CORS enabled with origin: ${config.corsOrigin}`);
        }),
      );
    } else {
      yield* _(
        Effect.sync(() => {
          console.error(`🔒 CORS disabled (set ENABLE_CORS=true to enable)`);
        }),
      );
    }
  }

  return config;
});

export const AppConfigLayer = Layer.effect(AppConfigTag, buildConfigEffect);

export const getConfig = AppConfigTag;

export const getProxyUrl = () =>
  Effect.map(getConfig, (config) =>
    config.useProxy && config.proxyUrl ? encodeURI(config.proxyUrl) : undefined,
  );
