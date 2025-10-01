import { Cause, Effect } from "effect";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";
import { setupTools } from "./tools/setupTools.js";

export const parseBody = (req: IncomingMessage) =>
  Effect.tryPromise<unknown, Error>({
    try: () =>
      new Promise((resolve, reject) => {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (error) {
            reject(error);
          }
        });
        req.on("error", reject);
      }),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

export const addCorsHeaders = (
  res: ServerResponse,
  enableCors: boolean,
  corsOrigin: string = "*",
) => {
  if (enableCors) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, mcp-session-id",
    );
  }
};

export const createMcpServer = Effect.gen(function* (_) {
  const server = new McpServer({
    name: "web-search",
    version: "1.2.0",
  });

  yield* _(setupTools(server));

  return server;
});

type HttpServerOptions = {
  enableCors?: boolean;
  corsOrigin?: string;
};

type StreamableTransports = Record<string, StreamableHTTPServerTransport>;
type SseTransports = Record<string, SSEServerTransport>;

type Transports = {
  streamable: StreamableTransports;
  sse: SseTransports;
};

const connectServer = (server: McpServer, transport: SSEServerTransport) =>
  Effect.tryPromise<void, Error>({
    try: () => server.connect(transport),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const connectStreamableServer = (
  server: McpServer,
  transport: StreamableHTTPServerTransport,
) =>
  Effect.tryPromise<void, Error>({
    try: () => server.connect(transport),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const handleTransportRequest = (
  transport: StreamableHTTPServerTransport,
  req: IncomingMessage,
  res: ServerResponse,
  body?: unknown,
) =>
  Effect.tryPromise<void, Error>({
    try: () => transport.handleRequest(req, res, body),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const handleSsePostMessage = (
  transport: SSEServerTransport,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
) =>
  Effect.tryPromise<void, Error>({
    try: () => transport.handlePostMessage(req, res, body),
    catch: (cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
  });

const writeJson = (res: ServerResponse, status: number, payload: unknown) =>
  Effect.sync(() => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  });

const writeText = (res: ServerResponse, status: number, message: string) =>
  Effect.sync(() => {
    res.writeHead(status);
    res.end(message);
  });

const ensureStreamableTransport = (transports: Transports, sessionId: string) =>
  transports.streamable[sessionId];

const ensureSseTransport = (transports: Transports, sessionId: string) =>
  transports.sse[sessionId];

const handleStreamableInitialize = (
  server: McpServer,
  transports: Transports,
) =>
  Effect.gen(function* (_) {
    const transport = yield* _(
      Effect.sync(() => {
        const newTransport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sessionId) => {
            transports.streamable[sessionId] = newTransport;
          },
        });

        newTransport.onclose = () => {
          if (newTransport.sessionId) {
            delete transports.streamable[newTransport.sessionId];
          }
        };

        return newTransport;
      }),
    );

    yield* _(connectStreamableServer(server, transport));

    return transport;
  });

const handlePostMcp = (
  server: McpServer,
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionIdHeader = req.headers["mcp-session-id"] as string | undefined;
    const body = yield* _(parseBody(req));

    if (sessionIdHeader) {
      const existing = ensureStreamableTransport(transports, sessionIdHeader);
      if (!existing) {
        yield* _(
          writeJson(res, 400, {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: No valid session ID provided",
            },
            id: null,
          }),
        );
        return;
      }

      yield* _(handleTransportRequest(existing, req, res, body));
      return;
    }

    if (!isInitializeRequest(body)) {
      yield* _(
        writeJson(res, 400, {
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        }),
      );
      return;
    }

    const transport = yield* _(handleStreamableInitialize(server, transports));

    yield* _(handleTransportRequest(transport, req, res, body));
  });

const handleGetMcp = (
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      yield* _(writeText(res, 400, "Invalid or missing session ID"));
      return;
    }

    const transport = ensureStreamableTransport(transports, sessionId);
    if (!transport) {
      yield* _(writeText(res, 400, "Invalid or missing session ID"));
      return;
    }

    yield* _(handleTransportRequest(transport, req, res));
  });

const handleDeleteMcp = (
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId) {
      yield* _(writeText(res, 400, "Invalid or missing session ID"));
      return;
    }

    const transport = ensureStreamableTransport(transports, sessionId);
    if (!transport) {
      yield* _(writeText(res, 400, "Invalid or missing session ID"));
      return;
    }

    yield* _(handleTransportRequest(transport, req, res));
  });

const handleGetSse = (
  server: McpServer,
  transports: Transports,
  _req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const transport = new SSEServerTransport("/messages", res);
    transports.sse[transport.sessionId] = transport;

    res.on("close", () => {
      delete transports.sse[transport.sessionId];
    });

    yield* _(connectServer(server, transport));
  });

const handlePostMessages = (
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) =>
  Effect.gen(function* (_) {
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) {
      yield* _(writeText(res, 400, "No transport found for sessionId"));
      return;
    }

    const transport = ensureSseTransport(transports, sessionId);
    if (!transport) {
      yield* _(writeText(res, 400, "No transport found for sessionId"));
      return;
    }

    const body = yield* _(parseBody(req));
    yield* _(handleSsePostMessage(transport, req, res, body));
  });

const handleUnknownRoute = (res: ServerResponse) =>
  writeText(res, 404, "Not Found");

const handleHttpRequest = (
  server: McpServer,
  transports: Transports,
  options: Required<HttpServerOptions>,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const url = yield* _(
      Effect.sync(() => new URL(req.url ?? "/", `http://${req.headers.host}`)),
    );
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    yield* _(
      Effect.sync(() =>
        addCorsHeaders(res, options.enableCors, options.corsOrigin),
      ),
    );

    if (method === "OPTIONS") {
      yield* _(
        Effect.sync(() => {
          res.writeHead(204);
          res.end();
        }),
      );
      return;
    }

    if (method === "POST" && pathname === "/mcp") {
      yield* _(handlePostMcp(server, transports, req, res));
      return;
    }

    if (method === "GET" && pathname === "/mcp") {
      yield* _(handleGetMcp(transports, req, res));
      return;
    }

    if (method === "DELETE" && pathname === "/mcp") {
      yield* _(handleDeleteMcp(transports, req, res));
      return;
    }

    if (method === "GET" && pathname === "/sse") {
      yield* _(handleGetSse(server, transports, req, res));
      return;
    }

    if (method === "POST" && pathname === "/messages") {
      yield* _(handlePostMessages(transports, req, res, url));
      return;
    }

    yield* _(handleUnknownRoute(res));
  });

export const createHttpServer = (
  server: McpServer,
  options: HttpServerOptions = {},
) =>
  Effect.sync(() => {
    const transports: Transports = {
      streamable: {},
      sse: {},
    };

    const resolvedOptions: Required<HttpServerOptions> = {
      enableCors: options.enableCors ?? false,
      corsOrigin: options.corsOrigin ?? "*",
    };

    return createServer((req, res) => {
      Effect.runFork(
        handleHttpRequest(server, transports, resolvedOptions, req, res).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError("Error handling request").pipe(
              Effect.annotateLogs({
                cause: Cause.pretty(cause),
                method: req.method ?? "GET",
                path: req.url ?? "/",
              }),
              Effect.flatMap(() =>
                Effect.sync(() => {
                  if (!res.headersSent) {
                    res.writeHead(500);
                    res.end("Internal Server Error");
                  }
                }),
              ),
            ),
          ),
        ),
      );
    });
  });
