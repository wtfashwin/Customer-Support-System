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

// Create Hono app
const app = new Hono().basePath("/api");

// Global middleware
app.use("*", createCorsMiddleware());
app.use("*", honoLogger());
app.use("*", errorMiddleware);

// Mount routes
const routes = app
  .route("/chat", chatRoutes)
  .route("/agents", agentRoutes)
  .route("/health", healthRoutes);

// 404 handler
app.notFound((c) => {
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

// Export type for Hono RPC (frontend type safety)
export type AppType = typeof routes;

// Start server
const port = parseInt(process.env.PORT || "3001", 10);

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
