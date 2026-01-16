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

// Basic health check at root for Railway liveness probes
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "api",
    env: process.env.NODE_ENV
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

// 404 handler for any other route
app.notFound((c) => {
  serverLogger.warn({ method: c.req.method, path: c.req.path }, "Route not found");
  return c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: `Route ${c.req.method} ${c.req.path} not found`,
      },
    },
    404
  );
});

// Start server
const port = parseInt(process.env.PORT || "3001", 10);
const host = "0.0.0.0";

// Export type for Hono RPC
export type AppType = typeof api;

serverLogger.info({ port, env: process.env.NODE_ENV }, "Starting server...");

serve(
  {
    fetch: app.fetch,
    port,
    hostname: "0.0.0.0",
  },
  (info) => {
    serverLogger.info(
      {
        port: info.port,
        address: info.address,
      },
      "Server started successfully"
    );
    console.log(`🚀 API server running at http://localhost:${info.port}/api`);
    console.log(`📚 Health check: http://localhost:${info.port}/api/health`);
  }
);

// Graceful shutdown
const shutdown = async (signal: string) => {
  serverLogger.info({ signal }, "Received shutdown signal");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

export default app;
