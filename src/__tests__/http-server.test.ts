import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createMcpServer, createHttpServer } from "../server.js";
import type { Server } from "node:http";

describe("HTTP Server Integration Tests", () => {
  let server: Server;
  let serverUrl: string;
  let port: number;

  beforeAll(async () => {
    // Create MCP server
    const mcpServer = createMcpServer();

    // Create HTTP server without CORS
    server = createHttpServer(mcpServer, {
      enableCors: false,
    });

    // Listen on random port
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = typeof address === 'object' && address !== null ? address.port : 0;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe("Basic Routes", () => {
    test("404 for unknown routes", async () => {
      const response = await fetch(`${serverUrl}/unknown`);
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).toBe('Not Found');
    });

    test("POST /mcp without session ID or valid initialization returns 400", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'request' }),
      });
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.code).toBe(-32000);
    });

    test("GET /mcp without session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'GET',
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid or missing session ID');
    });

    test("GET /mcp with invalid session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'GET',
        headers: { 'mcp-session-id': 'invalid-session-id' },
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid or missing session ID');
    });

    test("DELETE /mcp without session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid or missing session ID');
    });

    test("DELETE /mcp with invalid session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'DELETE',
        headers: { 'mcp-session-id': 'invalid-session-id' },
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('Invalid or missing session ID');
    });

    test("POST /messages without session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('No transport found for sessionId');
    });

    test("POST /messages with invalid session ID returns 400", async () => {
      const response = await fetch(`${serverUrl}/messages?sessionId=invalid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toBe('No transport found for sessionId');
    });

    test("GET /sse creates SSE transport", async () => {
      // Make SSE request
      const response = await fetch(`${serverUrl}/sse`, {
        method: 'GET',
      });

      // SSE should return 200 and have proper content type
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // Close the connection
      await response.body?.cancel();
    });
  });

  describe("MCP Protocol Initialization", () => {
    test("POST /mcp without Accept header returns 406", async () => {
      // Send MCP initialize request without proper Accept header
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initRequest),
      });

      // Should return 406 because Accept header is missing
      expect(response.status).toBe(406);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error.message).toContain('Not Acceptable');
    });

    test("POST /mcp with valid initialization request creates session", async () => {
      // Send MCP initialize request with proper Accept header
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
      };

      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify(initRequest),
      });

      // Should return 200 and include session ID in headers
      expect(response.status).toBe(200);
      const sessionId = response.headers.get('mcp-session-id');
      expect(sessionId).toBeDefined();
      expect(sessionId).not.toBe('');

      // Response should be SSE stream
      expect(response.headers.get('content-type')).toContain('text/event-stream');

      // Close the stream - we've verified session creation works
      await response.body?.cancel();
    });
  });
});

describe("HTTP Server with CORS", () => {
  let server: Server;
  let serverUrl: string;
  let port: number;

  beforeAll(async () => {
    // Create MCP server
    const mcpServer = createMcpServer();

    // Create HTTP server WITH CORS
    server = createHttpServer(mcpServer, {
      enableCors: true,
      corsOrigin: 'https://example.com',
    });

    // Listen on random port
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        port = typeof address === 'object' && address !== null ? address.port : 0;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Close server
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe("CORS Headers", () => {
    test("OPTIONS request returns CORS headers", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'OPTIONS',
      });
      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, DELETE');
      expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type');
    });

    test("GET request includes CORS headers", async () => {
      const response = await fetch(`${serverUrl}/unknown`, {
        method: 'GET',
      });
      expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, DELETE');
    });

    test("POST request includes CORS headers", async () => {
      const response = await fetch(`${serverUrl}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'request' }),
      });
      expect(response.headers.get('access-control-allow-origin')).toBe('https://example.com');
    });
  });
});

describe("Server Port Configuration", () => {
  test("Server starts on PORT=0 and assigns random port", async () => {
    const mcpServer = createMcpServer();
    const server = createHttpServer(mcpServer);

    // Listen on port 0 (auto-assign)
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        const port = typeof address === 'object' && address !== null ? address.port : 0;

        // Should have assigned a non-zero port
        expect(port).toBeGreaterThan(0);
        expect(port).toBeLessThan(65536);

        resolve();
      });
    });

    // Clean up
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test("Server starts on custom port", async () => {
    const mcpServer = createMcpServer();
    const server = createHttpServer(mcpServer);
    const customPort = 54321; // Using a high port number to avoid conflicts

    // Listen on custom port
    await new Promise<void>((resolve, reject) => {
      server.listen(customPort, '127.0.0.1', (err?: Error) => {
        if (err) reject(err);
        else {
          const address = server.address();
          const port = typeof address === 'object' && address !== null ? address.port : 0;

          // Should be listening on the custom port
          expect(port).toBe(customPort);

          resolve();
        }
      });
    });

    // Clean up
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
});