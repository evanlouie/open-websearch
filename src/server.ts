import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { setupTools } from "./tools/setupTools.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server,
} from "node:http";

// Helper to parse JSON from IncomingMessage
export async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

// Helper to add CORS headers
export function addCorsHeaders(
  res: ServerResponse,
  enableCors: boolean,
  corsOrigin: string = "*",
) {
  if (enableCors) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, mcp-session-id",
    );
  }
}

// Create and configure MCP server
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "web-search",
    version: "1.2.0",
  });

  setupTools(server);
  return server;
}

// Create HTTP server with MCP transports
export function createHttpServer(
  mcpServer: McpServer,
  options: {
    enableCors?: boolean;
    corsOrigin?: string;
  } = {},
): Server {
  const { enableCors = false, corsOrigin = "*" } = options;

  // Store transports for each session type
  const transports = {
    streamable: {} as Record<string, StreamableHTTPServerTransport>,
    sse: {} as Record<string, SSEServerTransport>,
  };

  const httpServer = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const pathname = url.pathname;
      const method = req.method;

      addCorsHeaders(res, enableCors, corsOrigin);

      // Handle CORS preflight
      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        // Route: POST /mcp - StreamableHTTP main endpoint
        if (method === "POST" && pathname === "/mcp") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          const body = await parseBody(req);
          let transport: StreamableHTTPServerTransport;

          if (sessionId && transports.streamable[sessionId]) {
            // Reuse existing transport
            transport = transports.streamable[sessionId];
          } else if (!sessionId && isInitializeRequest(body)) {
            // New initialization request
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sessionId) => {
                // Store the transport by session ID
                transports.streamable[sessionId] = transport;
              },
              // DNS rebinding protection is disabled by default for backwards compatibility. If you are running this server
              // locally, make sure to set:
              // enableDnsRebindingProtection: true,
              // allowedHosts: ['127.0.0.1'],
            });

            // Clean up transport when closed
            transport.onclose = () => {
              if (transport.sessionId) {
                delete transports.streamable[transport.sessionId];
              }
            };

            // Connect to the MCP server
            await mcpServer.connect(transport);
          } else {
            // Invalid request
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
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

          // Handle the request directly - no adapters needed
          await transport.handleRequest(req, res, body);
          return;
        }

        // Route: GET /mcp - Server-to-client notifications via SSE
        if (method === "GET" && pathname === "/mcp") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!sessionId || !transports.streamable[sessionId]) {
            res.writeHead(400);
            res.end("Invalid or missing session ID");
            return;
          }

          const transport = transports.streamable[sessionId];
          await transport.handleRequest(req, res);
          return;
        }

        // Route: DELETE /mcp - Session termination
        if (method === "DELETE" && pathname === "/mcp") {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          if (!sessionId || !transports.streamable[sessionId]) {
            res.writeHead(400);
            res.end("Invalid or missing session ID");
            return;
          }

          const transport = transports.streamable[sessionId];
          await transport.handleRequest(req, res);
          return;
        }

        // Route: GET /sse - Legacy SSE endpoint
        if (method === "GET" && pathname === "/sse") {
          const transport = new SSEServerTransport("/messages", res);
          transports.sse[transport.sessionId] = transport;

          res.on("close", () => {
            delete transports.sse[transport.sessionId];
          });

          await mcpServer.connect(transport);
          return;
        }

        // Route: POST /messages - Legacy message endpoint
        if (method === "POST" && pathname === "/messages") {
          const sessionId = url.searchParams.get("sessionId");
          const transport = sessionId ? transports.sse[sessionId] : undefined;
          if (transport) {
            const body = await parseBody(req);
            await transport.handlePostMessage(req, res, body);
          } else {
            res.writeHead(400);
            res.end("No transport found for sessionId");
          }
          return;
        }

        // 404 for unknown routes
        res.writeHead(404);
        res.end("Not Found");
      } catch (error) {
        console.error("Error handling request:", error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal Server Error");
        }
      }
    },
  );

  return httpServer;
}
