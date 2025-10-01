#!/usr/bin/env bun
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from "./config.js";
import { createMcpServer, createHttpServer } from "./server.js";
import { browserPool } from "./browser/BrowserPool.js";

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

    // Create HTTP server with MCP transports (CORS always enabled in v2.0)
    const httpServer = createHttpServer(server, {
      enableCors: true,
      corsOrigin: '*',
    });

    httpServer.listen(config.port, '0.0.0.0', () => {
      const address = httpServer.address();
      const actualPort = typeof address === 'object' && address !== null ? address.port : config.port;
      console.error(`✅ HTTP server running on port ${actualPort}`);
    });
  } else {
    console.error('ℹ️ HTTP server disabled, running in STDIO mode only')
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('\n🛑 Shutting down...');
  await browserPool.close();
  console.error('✅ Browser pool closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\n🛑 Shutting down...');
  await browserPool.close();
  console.error('✅ Browser pool closed');
  process.exit(0);
});

main().catch(console.error);
