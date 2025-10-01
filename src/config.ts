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
      Effect.logWarning(
        "Invalid ALLOWED_SEARCH_ENGINES specified. All values ignored; all engines enabled.",
      ).pipe(Effect.annotateLogs({ rawAllowed: rawAllowed.join(", ") })),
    );
  } else if (filteredAllowed.length !== rawAllowed.length) {
    const invalid = rawAllowed.filter(
      (engine) => !supportedSearchEngines.includes(engine as SupportedEngine),
    );
    yield* _(
      Effect.logWarning("Invalid search engines detected and ignored.").pipe(
        Effect.annotateLogs({ invalid: invalid.join(", ") }),
      ),
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
      Effect.logWarning(
        "Default search engine is not included in allowed list. Switching to first allowed engine.",
      ).pipe(
        Effect.annotateLogs({
          previousDefault: defaultSearchEngine,
          newDefault: updatedDefault,
        }),
      ),
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
    Effect.logInfo("🔍 Default search engine set.").pipe(
      Effect.annotateLogs({ defaultSearchEngine: config.defaultSearchEngine }),
    ),
  );

  if (config.allowedSearchEngines.length > 0) {
    yield* _(
      Effect.logInfo("🔍 Restricting search engines.").pipe(
        Effect.annotateLogs({
          allowedSearchEngines: config.allowedSearchEngines.join(", "),
        }),
      ),
    );
  } else {
    yield* _(Effect.logInfo("🔍 No search engine restrictions configured."));
  }

  if (config.useProxy) {
    yield* _(
      Effect.logInfo("🌐 Proxy enabled.").pipe(
        Effect.annotateLogs({ proxyUrl: config.proxyUrl ?? "" }),
      ),
    );
  } else {
    yield* _(
      Effect.logInfo("🌐 Proxy disabled. Set USE_PROXY=true to enable."),
    );
  }

  const mode = env.MODE ?? (config.enableHttpServer ? "both" : "stdio");
  yield* _(
    Effect.logInfo("🖥️ Server mode configured.").pipe(
      Effect.annotateLogs({ mode: mode.toUpperCase() }),
    ),
  );

  if (config.enableHttpServer) {
    if (config.enableCors) {
      yield* _(
        Effect.logInfo("🔒 CORS enabled.").pipe(
          Effect.annotateLogs({ corsOrigin: config.corsOrigin }),
        ),
      );
    } else {
      yield* _(
        Effect.logInfo("🔒 CORS disabled. Set ENABLE_CORS=true to enable."),
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
