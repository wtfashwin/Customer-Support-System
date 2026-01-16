import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger as honoLogger } from "hono/logger";
import { chatRoutes } from "./routes/chat.routes.js";
import { agentRoutes } from "./routes/agents.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { createCorsMiddleware } from "./middleware/cors.middleware.js";
import { logger, createServiceLogger } from "./lib/logger.js";

const serverLogger = createServiceLogger("server");

console.log("🚀 Starting API server initialization...");

// Main app for health checks and top-level middleware
const app = new Hono();

// BASIC HEALTH CHECK - MUST BE FIRST
app.get("/health", (c) => {
  console.log("📥 Health check hit");
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "api"
  });
});

// API Sub-app
const api = new Hono();

// Global middleware for API
api.use("*", createCorsMiddleware());
api.use("*", honoLogger());
api.use("*", errorMiddleware);

// Mount API routes
api.route("/chat", chatRoutes);
api.route("/agents", agentRoutes);
api.route("/health", healthRoutes);

// Mount everything under /api
app.route("/api", api);

// Start server
const port = parseInt(process.env.PORT || "3001", 10);

serverLogger.info({ port, env: process.env.NODE_ENV }, "Starting server...");

try {
  serve(
    {
      fetch: app.fetch,
      port,
      hostname: "0.0.0.0",
    },
    (info: any) => {
      serverLogger.info(
        {
          port: info.port,
          address: info.address,
        },
        "Server started successfully"
      );
      console.log(`✅ API server listening on 0.0.0.0:${info.port}`);
      console.log(`🚀 API server running at http://localhost:${info.port}/api`);
      console.log(`📚 Health check: http://localhost:${info.port}/health`);
    }
  );
} catch (err) {
  console.error("❌ FAILED TO START SERVER:", err);
  process.exit(1);
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  serverLogger.info({ signal }, "Received shutdown signal");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export type AppType = typeof api;
export default app;
