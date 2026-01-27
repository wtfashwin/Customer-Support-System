import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger as honoLogger } from "hono/logger";
import { prisma } from "@repo/database";
import { chatRoutes } from "./routes/chat.routes.js";
import { agentRoutes } from "./routes/agents.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { createCorsMiddleware } from "./middleware/cors.middleware.js";

// Global error handlers for better debugging in production
process.on("uncaughtException", (err) => {
  console.error("❌ FATAL: Uncaught Exception:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ FATAL: Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

console.log("-----------------------------------------");
console.log("🚀 BOOTING API SERVER (v1.0.3)");
console.log("-----------------------------------------");

const app = new Hono();

// ROOT HEALTH CHECK (Railway Liveness)
// This is defined outside any middleware to be as fast as possible
app.get("/health", (c) => {
  return c.json(
    {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.3",
      uptime: process.uptime()
    },
    200
  );
});

// Root path redirect or info
app.get("/", (c) => {
  return c.text("Customer Support API is running. Health check at /health");
});

// API Sub-app
const api = new Hono()
  .use("*", createCorsMiddleware())
  .use("*", honoLogger())
  .use("*", errorMiddleware)
  .route("/chat", chatRoutes)
  .route("/agents", agentRoutes)
  .route("/health", healthRoutes);

// Mount everything under /api
app.route("/api", api);

// Robust port handling for Railway/Nixpacks
const port = Number(process.env.PORT) || 3001;

if (process.env.NODE_ENV !== "test") {
  (async () => {
    try {
      console.log("Starting server initialization...");
      console.log(`📡 Preparing to listen on 0.0.0.0:${port}`);

      // Verify Prisma connection before starting server
      console.log("🔗 Verifying Prisma connection...");
      try {
        await Promise.race([
          prisma.$queryRaw`SELECT 1`,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Prisma connection timeout")), 5000)
          ),
        ]);
        console.log("✅ Prisma connection verified");
      } catch (dbError) {
        const msg = dbError instanceof Error ? dbError.message : "Unknown error";
        console.error(`⚠️ Warning: Prisma health check failed - ${msg}`);
        console.log("ℹ️ Server will start anyway, but /api/health/ready will fail");
      }

      const server = serve({
        fetch: app.fetch,
        port,
        hostname: "0.0.0.0",
      }, (info) => {
        console.log(`-----------------------------------------`);
        console.log(`✅ API server listening on 0.0.0.0:${info.port}`);
        console.log(`🏥 Liveness: GET /health (returns 200)`);
        console.log(`📋 Readiness: GET /api/health/ready (checks DB)`);
        console.log(`💓 Live: GET /api/health/live (lightweight)`);
        console.log(`-----------------------------------------`);
      });

      // Handle graceful shutdown
      const shutdown = () => {
        console.log("👋 Shutting down server...");
        server.close();
        process.exit(0);
      };

      process.on("SIGTERM", shutdown);
      process.on("SIGINT", shutdown);

    } catch (err) {
      console.error("❌ CRITICAL: Failed to start server:", err);
      process.exit(1);
    }
  })();
}

export type AppType = typeof api;
export default app;
