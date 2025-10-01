#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "node:http";
import { Cause, Effect } from "effect";
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
      const address = server.address();
      const actualPort =
        typeof address === "object" && address !== null ? address.port : port;
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

const determinePort = Effect.sync(() =>
  process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
);

const shouldEnableStdio = Effect.sync(() => {
  const mode = process.env.MODE;
  return mode === undefined || mode === "both" || mode === "stdio";
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
