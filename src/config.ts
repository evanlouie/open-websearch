import { Context, Effect, Either, Layer, Option, Schema, pipe } from "effect";
import * as Arr from "effect/Array";

export const supportedSearchEngines = ["bing", "duckduckgo", "brave"] as const;

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

export type AppConfig = Schema.Schema.Type<typeof AppConfigSchema>;

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
      onNone: () =>
        Either.right<ServerMode>("both") as Either.Either<ServerMode, Error>,
      onSome: (mode) =>
        serverModes.includes(mode as ServerMode)
          ? (Either.right<ServerMode>(mode as ServerMode) as Either.Either<
              ServerMode,
              Error
            >)
          : (Either.left(
              new Error(`Unsupported MODE value "${mode}" provided.`),
            ) as Either.Either<ServerMode, Error>),
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
      onNone: () => Either.right(defaultValue) as Either.Either<boolean, Error>,
      onSome: (value) => {
        if (value === "true") {
          return Either.right(true) as Either.Either<boolean, Error>;
        }
        if (value === "false") {
          return Either.right(false) as Either.Either<boolean, Error>;
        }
        return Either.left(
          new Error(`Unsupported boolean value "${value}" provided.`),
        ) as Either.Either<boolean, Error>;
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
  let defaultSearchEngine = normalizeDefaultEngine(defaultSearchEngineOption);

  const rawAllowed = parseAllowedEngines(
    pipe(
      Option.fromNullable(env.ALLOWED_SEARCH_ENGINES),
      Option.map((value) => value.toLowerCase()),
    ),
  );
  const filteredAllowed = Arr.filter(rawAllowed, isSupportedEngine);

  if (rawAllowed.length > 0 && filteredAllowed.length === 0) {
    yield* _(
      Effect.logWarning(
        "Invalid ALLOWED_SEARCH_ENGINES specified. All values ignored; all engines enabled.",
      ).pipe(Effect.annotateLogs({ rawAllowed: rawAllowed.join(", ") })),
    );
  } else if (filteredAllowed.length !== rawAllowed.length) {
    const invalid = Arr.filter(
      rawAllowed,
      (engine) => !isSupportedEngine(engine),
    );
    yield* _(
      Effect.logWarning("Invalid search engines detected and ignored.").pipe(
        Effect.annotateLogs({ invalid: invalid.join(", ") }),
      ),
    );
  }

  const allowedSearchEngines: SupportedEngine[] = Arr.isNonEmptyReadonlyArray(
    filteredAllowed,
  )
    ? filteredAllowed
    : [];

  if (
    Arr.isNonEmptyReadonlyArray(allowedSearchEngines) &&
    !pipe(
      allowedSearchEngines,
      Arr.some((engine) => engine === defaultSearchEngine),
    )
  ) {
    const updatedDefault = allowedSearchEngines[0]!;
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
        Effect.annotateLogs({
          proxyUrl: Option.getOrElse(config.proxyUrl, () => ""),
        }),
      ),
    );
  } else {
    yield* _(
      Effect.logInfo("🌐 Proxy disabled. Set USE_PROXY=true to enable."),
    );
  }

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
    config.useProxy
      ? pipe(
          config.proxyUrl,
          Option.map((url) => encodeURI(url)),
        )
      : Option.none<string>(),
  );
