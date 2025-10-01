#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Server } from "node:http";
import { Effect } from "effect";
import { AppConfigLayer, getConfig, type AppConfig } from "./config.js";
import { createHttpServer, createMcpServer } from "./server.js";

const connectStdioTransport = (server: McpServer) =>
  Effect.gen(function* (_) {
    const transport = new StdioServerTransport();

    yield* _(
      Effect.sync(() => console.error("🔌 Starting STDIO transport...")),
    );

    yield* _(
      Effect.tryPromise<void, Error>({
        try: () => server.connect(transport),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
    );

    yield* _(Effect.sync(() => console.error("✅ STDIO transport enabled")));
  });

const listenHttpServer = (server: Server, port: number) =>
  Effect.tryPromise<void, Error>({
    try: () =>
      new Promise((resolve) => {
        server.listen(port, "0.0.0.0", () => {
          const address = server.address();
          const actualPort =
            typeof address === "object" && address !== null
              ? address.port
              : port;
          console.error(`✅ HTTP server running on port ${actualPort}`);
          resolve();
        });
      }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const startHttpServer = (
  mcpServer: McpServer,
  port: number,
  config: AppConfig,
) =>
  Effect.gen(function* (_) {
    yield* _(Effect.sync(() => console.error("🔌 Starting HTTP server...")));

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
      Effect.sync(() => {
        console.error("ℹ️ HTTP server disabled, running in STDIO mode only");
      }),
    );
  }
});

Effect.runPromise(program.pipe(Effect.provide(AppConfigLayer))).catch(
  (error) => {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  },
);
