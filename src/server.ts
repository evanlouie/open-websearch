import { Cause, Effect, Either, Match, Option, pipe } from "effect";
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

/**
 * Parses the JSON body from an HTTP request.
 * Reads the request stream, collects chunks, and parses as JSON.
 * Returns an empty object if body is empty.
 *
 * @param req - The incoming HTTP request
 * @returns Effect that resolves to the parsed JSON body, or fails with Error
 */
export const parseBody = (req: IncomingMessage) =>
  pipe(
    Effect.tryPromise<string, Error>({
      try: () =>
        new Promise((resolve, reject) => {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });
          req.on("end", () => resolve(body));
          req.on("error", reject);
        }),
      catch: (cause) =>
        cause instanceof Error ? cause : new Error(String(cause)),
    }),
    Effect.flatMap((body) =>
      Effect.try({
        try: () => (body ? JSON.parse(body) : {}) as unknown,
        catch: (error) =>
          error instanceof Error ? error : new Error(String(error)),
      }),
    ),
  );

/**
 * Adds CORS headers to an HTTP response if CORS is enabled.
 * Sets Access-Control-Allow-Origin, Allow-Methods, and Allow-Headers.
 *
 * @param res - The HTTP response object
 * @param enableCors - Whether CORS should be enabled
 * @param corsOrigin - The origin to allow (defaults to "*")
 * @returns Effect that sets CORS headers (or does nothing if CORS disabled)
 */
export const addCorsHeaders = (
  res: ServerResponse,
  enableCors: boolean,
  corsOrigin: string = "*",
) =>
  pipe(
    Match.value(enableCors),
    Match.when(true, () =>
      Effect.sync(() => {
        res.setHeader("Access-Control-Allow-Origin", corsOrigin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, mcp-session-id",
        );
      }),
    ),
    Match.orElse(() => Effect.succeed(undefined)),
  );

/**
 * Creates and configures an MCP server instance.
 * Registers all available tools (search, etc.) with the server.
 *
 * @returns Effect that resolves to a configured McpServer instance
 * @requires AppConfig - Requires application configuration for tool setup
 *
 * @example
 * ```typescript
 * const server = yield* createMcpServer;
 * ```
 */
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

/**
 * Record of all active MCP transports, organized by type.
 * Used to track sessions for both StreamableHTTP and SSE transports.
 */
export type Transports = {
  /** StreamableHTTP transports indexed by session ID */
  streamable: StreamableTransports;
  /** SSE transports indexed by session ID */
  sse: SseTransports;
};

/**
 * Error message used when a session ID is missing or invalid.
 */
export const missingSessionMessage = "Invalid or missing session ID";

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

/**
 * Safely extracts a header value from HTTP request headers.
 * Handles both string and array header values, trims whitespace, and filters empty strings.
 *
 * @param headers - The HTTP request headers object
 * @param key - The header name to retrieve
 * @returns Option containing the header value if present and non-empty, or None otherwise
 */
export const getHeaderValue = (
  headers: IncomingMessage["headers"],
  key: string,
) =>
  pipe(
    Option.fromNullable(headers[key]),
    Option.flatMap((raw) => {
      if (Array.isArray(raw)) {
        return Option.fromNullable(raw[0]);
      }
      return typeof raw === "string" ? Option.some(raw) : Option.none<string>();
    }),
    Option.map((value) => value.trim()),
    Option.filter((value) => value.length > 0),
  );

/**
 * Retrieves a StreamableHTTP transport by session ID.
 *
 * @param transports - The transports registry
 * @param sessionId - The session ID to look up
 * @returns Option containing the transport if found, or None otherwise
 */
export const ensureStreamableTransport = (
  transports: Transports,
  sessionId: string,
) => Option.fromNullable(transports.streamable[sessionId]);

/**
 * Retrieves an SSE transport by session ID.
 *
 * @param transports - The transports registry
 * @param sessionId - The session ID to look up
 * @returns Option containing the transport if found, or None otherwise
 */
export const ensureSseTransport = (transports: Transports, sessionId: string) =>
  Option.fromNullable(transports.sse[sessionId]);

/**
 * Retrieves a StreamableHTTP transport by session ID, or returns an error.
 * Use this when the transport must exist for the operation to continue.
 *
 * @param transports - The transports registry
 * @param sessionId - The session ID to look up
 * @returns Either containing the transport (Right) or an error message (Left)
 */
export const requireStreamableTransport = (
  transports: Transports,
  sessionId: string,
) =>
  Either.fromOption(
    ensureStreamableTransport(transports, sessionId),
    () => missingSessionMessage,
  );

/**
 * Retrieves an SSE transport by session ID, or returns an error.
 * Use this when the transport must exist for the operation to continue.
 *
 * @param transports - The transports registry
 * @param sessionId - The session ID to look up
 * @returns Either containing the transport (Right) or an error message (Left)
 */
export const requireSseTransport = (
  transports: Transports,
  sessionId: string,
) =>
  Either.fromOption(
    ensureSseTransport(transports, sessionId),
    () => "No transport found for sessionId",
  );

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

const createBadRequestError = (res: ServerResponse) =>
  writeJson(res, 400, {
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Bad Request: No valid session ID provided",
    },
    id: null,
  });

const handleExistingSession = (
  transports: Transports,
  sessionId: string,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
) =>
  pipe(
    ensureStreamableTransport(transports, sessionId),
    Option.match({
      onSome: (transport) => handleTransportRequest(transport, req, res, body),
      onNone: () => createBadRequestError(res),
    }),
  );

const handleMissingSession = (
  server: McpServer,
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
  body: unknown,
) =>
  pipe(
    Match.value(isInitializeRequest(body)),
    Match.when(true, () =>
      handleStreamableInitialize(server, transports).pipe(
        Effect.flatMap((transport) =>
          handleTransportRequest(transport, req, res, body),
        ),
      ),
    ),
    Match.orElse(() => createBadRequestError(res)),
  );

const handlePostMcp = (
  server: McpServer,
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionIdOption = getHeaderValue(req.headers, "mcp-session-id");
    const body = yield* _(parseBody(req));

    const result = pipe(
      sessionIdOption,
      Option.match({
        onSome: (sessionId) =>
          handleExistingSession(transports, sessionId, req, res, body),
        onNone: () => handleMissingSession(server, transports, req, res, body),
      }),
    );

    yield* _(result);
  });

const handleGetMcp = (
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionIdOption = getHeaderValue(req.headers, "mcp-session-id");

    const outcome = pipe(
      sessionIdOption,
      Option.match({
        onSome: (sessionId) =>
          pipe(
            requireStreamableTransport(transports, sessionId),
            Either.match({
              onRight: (transport) =>
                handleTransportRequest(transport, req, res),
              onLeft: (message: string) => writeText(res, 400, message),
            }),
          ),
        onNone: () => writeText(res, 400, missingSessionMessage),
      }),
    );

    yield* _(outcome);
  });

const handleDeleteMcp = (
  transports: Transports,
  req: IncomingMessage,
  res: ServerResponse,
) =>
  Effect.gen(function* (_) {
    const sessionIdOption = getHeaderValue(req.headers, "mcp-session-id");

    const outcome = pipe(
      sessionIdOption,
      Option.match({
        onSome: (sessionId) =>
          pipe(
            requireStreamableTransport(transports, sessionId),
            Either.match({
              onRight: (transport) =>
                handleTransportRequest(transport, req, res),
              onLeft: (message: string) => writeText(res, 400, message),
            }),
          ),
        onNone: () => writeText(res, 400, missingSessionMessage),
      }),
    );

    yield* _(outcome);
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
    const sessionIdOption = pipe(
      Option.fromNullable(url.searchParams.get("sessionId")),
      Option.map((value) => value.trim()),
      Option.filter((value) => value.length > 0),
    );

    const outcome = pipe(
      sessionIdOption,
      Option.match({
        onSome: (sessionId) =>
          pipe(
            requireSseTransport(transports, sessionId),
            Either.match({
              onRight: (transport) =>
                parseBody(req).pipe(
                  Effect.flatMap((body) =>
                    handleSsePostMessage(transport, req, res, body),
                  ),
                ),
              onLeft: (message: string) => writeText(res, 400, message),
            }),
          ),
        onNone: () => writeText(res, 400, "No transport found for sessionId"),
      }),
    );

    yield* _(outcome);
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
      Effect.sync(() => {
        const rawUrl = pipe(
          Option.fromNullable(req.url),
          Option.getOrElse(() => "/"),
        );
        const host = pipe(
          Option.fromNullable(req.headers.host),
          Option.getOrElse(() => "localhost"),
        );
        return new URL(rawUrl, `http://${host}`);
      }),
    );
    const pathname = url.pathname;
    const method = pipe(
      Option.fromNullable(req.method),
      Option.getOrElse(() => "GET"),
    );

    yield* _(addCorsHeaders(res, options.enableCors, options.corsOrigin));

    yield* _(
      pipe(
        Match.value({ method, pathname }),
        Match.when(
          ({ method }) => method === "OPTIONS",
          () =>
            Effect.sync(() => {
              res.writeHead(204);
              res.end();
            }),
        ),
        Match.when(
          ({ method, pathname }) => method === "POST" && pathname === "/mcp",
          () => handlePostMcp(server, transports, req, res),
        ),
        Match.when(
          ({ method, pathname }) => method === "GET" && pathname === "/mcp",
          () => handleGetMcp(transports, req, res),
        ),
        Match.when(
          ({ method, pathname }) => method === "DELETE" && pathname === "/mcp",
          () => handleDeleteMcp(transports, req, res),
        ),
        Match.when(
          ({ method, pathname }) => method === "GET" && pathname === "/sse",
          () => handleGetSse(server, transports, req, res),
        ),
        Match.when(
          ({ method, pathname }) =>
            method === "POST" && pathname === "/messages",
          () => handlePostMessages(transports, req, res, url),
        ),
        Match.orElse(() => handleUnknownRoute(res)),
      ),
    );
  });

/**
 * Creates an HTTP server for MCP communication.
 * Supports both StreamableHTTP and SSE transports.
 * Handles multiple endpoints: /mcp (StreamableHTTP), /sse and /messages (SSE).
 * Includes CORS support and automatic error handling.
 *
 * @param server - The configured MCP server instance
 * @param options - Optional HTTP server configuration (CORS settings)
 * @returns Effect that resolves to a Node.js HTTP Server instance
 *
 * @example
 * ```typescript
 * const httpServer = yield* createHttpServer(mcpServer, {
 *   enableCors: true,
 *   corsOrigin: "*"
 * });
 * httpServer.listen(3000);
 * ```
 */
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
      enableCors: pipe(
        Option.fromNullable(options.enableCors),
        Option.getOrElse(() => false),
      ),
      corsOrigin: pipe(
        Option.fromNullable(options.corsOrigin),
        Option.getOrElse(() => "*"),
      ),
    };

    return createServer((req, res) => {
      Effect.runFork(
        handleHttpRequest(server, transports, resolvedOptions, req, res).pipe(
          Effect.catchAllCause((cause) =>
            Effect.logError("Error handling request").pipe(
              Effect.annotateLogs({
                cause: Cause.pretty(cause),
                method: pipe(
                  Option.fromNullable(req.method),
                  Option.getOrElse(() => "GET"),
                ),
                path: pipe(
                  Option.fromNullable(req.url),
                  Option.getOrElse(() => "/"),
                ),
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
