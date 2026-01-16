import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger as honoLogger } from "hono/logger";
import { chatRoutes } from "./routes/chat.routes.js";
import { agentRoutes } from "./routes/agents.routes.js";
import { healthRoutes } from "./routes/health.routes.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { createCorsMiddleware } from "./middleware/cors.middleware.js";

console.log("-----------------------------------------");
console.log("🚀 BOOTING API SERVER");
console.log("-----------------------------------------");

const app = new Hono();

// ROOT HEALTH CHECK (Railway Liveness)
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.2"
  });
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
const routes = app.route("/api", api);

const port = parseInt(process.env.PORT || "3001", 10);

if (process.env.NODE_ENV !== "test") {
  try {
    serve({
      fetch: app.fetch,
      port,
      hostname: "0.0.0.0",
    }, (info) => {
      console.log(`🚀 API server listening on 0.0.0.0:${info.port}`);
    });
  } catch (err) {
    console.error("❌ CRITICAL: Failed to start server listen:", err);
  }
}

export type AppType = typeof api;
export default app;
