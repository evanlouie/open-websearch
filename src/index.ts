#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "node:http";
import { Cause, Effect, Either, Match, Option, pipe } from "effect";
import { AppConfigLayer, getConfig, type AppConfig } from "./config.js";
import { createHttpServer, createMcpServer } from "./server.js";
import { StderrLoggerLayer } from "./logging.js";

const connectStdioTransport = (server: McpServer) =>
  Effect.gen(function* (_) {
    const transport = new StdioServerTransport();

    yield* _(Effect.logInfo("🔌 Starting STDIO transport..."));

    yield* _(
      Effect.tryPromise<void, Error>({
        try: () => server.connect(transport),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );

    yield* _(Effect.logInfo("✅ STDIO transport enabled"));
  });

const listenHttpServer = (server: Server, port: number) =>
  Effect.async<void, Error>((resume) => {
    const onError = (cause: unknown) => {
      server.off("listening", onListening);
      resume(
        Effect.fail(cause instanceof Error ? cause : new Error(String(cause))),
      );
    };

    const onListening = () => {
      server.off("error", onError);
      const actualPort = pipe(
        Option.fromNullable(server.address()),
        Option.flatMap((address) =>
          typeof address === "object" && address !== null && "port" in address
            ? Option.some((address as { port: number }).port)
            : Option.none<number>(),
        ),
        Option.getOrElse(() => port),
      );
      resume(Effect.logInfo(`✅ HTTP server running on port ${actualPort}`));
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, "0.0.0.0");

    return Effect.sync(() => {
      server.off("error", onError);
      server.off("listening", onListening);
    });
  });

const startHttpServer = (
  mcpServer: McpServer,
  port: number,
  config: AppConfig,
) =>
  Effect.gen(function* (_) {
    yield* _(Effect.logInfo("🔌 Starting HTTP server..."));

    const httpServer = yield* _(
      createHttpServer(mcpServer, {
        enableCors: config.enableCors,
        corsOrigin: config.corsOrigin,
      }),
    );

    yield* _(listenHttpServer(httpServer, port));
  });

const parsePort = (value: string) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed)
    ? Either.left(new Error(`Invalid PORT value "${value}" provided.`))
    : Either.right(parsed);
};

type RuntimeMode = "both" | "http" | "stdio";

const parseRuntimeMode = (
  modeOption: Option.Option<string>,
): Either.Either<RuntimeMode, Error> =>
  pipe(
    modeOption,
    Option.map((mode) => mode.trim().toLowerCase()),
    Option.match({
      onNone: () => Either.right("both") as Either.Either<RuntimeMode, Error>,
      onSome: (value) =>
        pipe(
          Match.value(value),
          Match.when("both", () => Either.right<RuntimeMode>("both")),
          Match.when("http", () => Either.right<RuntimeMode>("http")),
          Match.when("stdio", () => Either.right<RuntimeMode>("stdio")),
          Match.orElse((invalid) =>
            Either.left(
              new Error(`Unsupported MODE value "${invalid}" provided.`),
            ),
          ),
        ),
    }),
  );

const determinePort = Effect.gen(function* (_) {
  const portOption = Option.fromNullable(process.env.PORT);

  return yield* _(
    pipe(
      portOption,
      Option.match({
        onNone: () => Effect.succeed(3000),
        onSome: (value) =>
          Either.match(parsePort(value), {
            onRight: Effect.succeed,
            onLeft: (error) =>
              Effect.logWarning(error.message).pipe(
                Effect.annotateLogs({ variable: "PORT" }),
                Effect.map(() => 3000),
              ),
          }),
      }),
    ),
  );
});

const shouldEnableStdio = Effect.gen(function* (_) {
  const modeOption = Option.fromNullable(process.env.MODE);
  const parsedMode = parseRuntimeMode(modeOption);

  const mode = yield* _(
    Either.match(parsedMode, {
      onRight: Effect.succeed,
      onLeft: (error: Error) =>
        Effect.logWarning(error.message).pipe(
          Effect.annotateLogs({ variable: "MODE" }),
          Effect.map(() => "both" as RuntimeMode),
        ),
    }),
  );

  return pipe(
    Match.value(mode),
    Match.when("both", () => true),
    Match.when("stdio", () => true),
    Match.orElse(() => false),
  );
});

const program = Effect.gen(function* (_) {
  const config = yield* _(getConfig);
  const server = yield* _(createMcpServer);

  const enableStdio = yield* _(shouldEnableStdio);

  yield* _(
    pipe(
      Match.value(enableStdio),
      Match.when(true, () => connectStdioTransport(server)),
      Match.orElse(() => Effect.succeed(undefined)),
    ),
  );

  yield* _(
    pipe(
      Match.value(config.enableHttpServer),
      Match.when(true, () =>
        Effect.gen(function* (_) {
          const port = yield* _(determinePort);
          yield* _(startHttpServer(server, port, config));
        }),
      ),
      Match.orElse(() =>
        Effect.logInfo("ℹ️ HTTP server disabled, running in STDIO mode only"),
      ),
    ),
  );
});

const main = program.pipe(
  Effect.provide(StderrLoggerLayer),
  Effect.provide(AppConfigLayer),
  Effect.catchAllCause((cause) =>
    Effect.logError(`❌ Failed to start server\n${Cause.pretty(cause)}`).pipe(
      Effect.flatMap(() => Effect.sync(() => process.exit(1))),
    ),
  ),
);

Effect.runPromise(main).catch(() => {
  process.exit(1);
});
