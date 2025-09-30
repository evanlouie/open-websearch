#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from "./config.js";
import { createMcpServer, createHttpServer } from "./server.js";

async function main() {
  // Create MCP server with tools configured
  const server = createMcpServer();

  // Enable STDIO mode if MODE is 'both' or 'stdio' or not specified
  if (process.env.MODE === undefined || process.env.MODE === 'both' || process.env.MODE === 'stdio') {
    console.error('🔌 Starting STDIO transport...');
    const stdioTransport = new StdioServerTransport();
    await server.connect(stdioTransport).then(() => {
      console.error('✅ STDIO transport enabled');
    }).catch(error => {
      console.error('❌ Failed to initialize STDIO transport:', error);
    });
  }

  // Only set up HTTP server if enabled
  if (config.enableHttpServer) {
    console.error('🔌 Starting HTTP server...');

    // Create HTTP server with MCP transports
    const httpServer = createHttpServer(server, {
      enableCors: config.enableCors,
      corsOrigin: config.corsOrigin,
    });

    // Read the port number from the environment variable; use the default port 3000 if it is not set.
    // Setting PORT=0 will let the OS automatically assign an available port
    const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

    httpServer.listen(PORT, '0.0.0.0', () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : PORT;
      console.error(`✅ HTTP server running on port ${actualPort}`);
    });
  } else {
    console.error('ℹ️ HTTP server disabled, running in STDIO mode only')
  }
}

main().catch(console.error);
