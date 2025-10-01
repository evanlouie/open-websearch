#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "node:http";
import { Cause, Effect, Either, Option, pipe } from "effect";
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
      onNone: () =>
        Either.right<RuntimeMode>("both") as Either.Either<RuntimeMode, Error>,
      onSome: (value) => {
        if (value === "both" || value === "http" || value === "stdio") {
          return Either.right(value as RuntimeMode) as Either.Either<
            RuntimeMode,
            Error
          >;
        }
        return Either.left(
          new Error(`Unsupported MODE value "${value}" provided.`),
        ) as Either.Either<RuntimeMode, Error>;
      },
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

  return mode === "both" || mode === "stdio";
});

const program = Effect.gen(function* (_) {
  const config = yield* _(getConfig);
  const server = yield* _(createMcpServer);

  if (yield* _(shouldEnableStdio)) {
    yield* _(connectStdioTransport(server));
  }

  if (config.enableHttpServer) {
    const port = yield* _(determinePort);
    yield* _(startHttpServer(server, port, config));
  } else {
    yield* _(
      Effect.logInfo("ℹ️ HTTP server disabled, running in STDIO mode only"),
    );
  }
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
