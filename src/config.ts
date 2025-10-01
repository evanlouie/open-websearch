// src/config.ts - Minimal v2.0 configuration
export interface AppConfig {
  // Server configuration
  port: number;
  mode: "both" | "http" | "stdio";
  enableHttpServer: boolean;
}

// Read from environment variables or use defaults
export const config: AppConfig = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
  mode: (process.env.MODE as "both" | "http" | "stdio") || "both",
  enableHttpServer: process.env.MODE
    ? ["both", "http"].includes(process.env.MODE)
    : true,
};

// Log configuration
const mode = config.mode.toUpperCase();
console.error(`🖥️ Server mode: ${mode}`);

if (config.enableHttpServer) {
  console.error(`🌐 HTTP server will run on port ${config.port}`);
  console.error(`🔒 CORS: enabled (always on in v2.0)`);
}
