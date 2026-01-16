import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";

console.log("-----------------------------------------");
console.log("🚀 BOOTING API SERVER");
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("PORT:", process.env.PORT);
console.log("CWD:", process.cwd());
console.log("-----------------------------------------");

const app = new Hono();

// ROOT HEALTH CHECK (Railway Liveness)
app.get("/health", (c) => {
  console.log("📥 [HEALTH] Root health check hit");
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.1"
  });
});

// DELAYED LOAD: Mount other routes later to ensure health check is fast
async function startServer() {
  try {
    const { createCorsMiddleware } = await import("./middleware/cors.middleware.js");
    const { errorMiddleware } = await import("./middleware/error.middleware.js");
    const { chatRoutes } = await import("./routes/chat.routes.js");
    const { agentRoutes } = await import("./routes/agents.routes.js");
    const { healthRoutes } = await import("./routes/health.routes.js");
    const { logger: honoLogger } = await import("hono/logger");

    const api = new Hono();
    api.use("*", createCorsMiddleware());
    api.use("*", (honoLogger as any)());
    api.use("*", errorMiddleware);

    api.route("/chat", chatRoutes);
    api.route("/agents", agentRoutes);
    api.route("/health", healthRoutes);

    app.route("/api", api);

    console.log("✅ All routes mounted");
  } catch (err) {
    console.error("❌ Error loading routes:", err);
  }

  const port = parseInt(process.env.PORT || "3001", 10);

  try {
    serve({
      fetch: app.fetch,
      port,
      hostname: "0.0.0.0",
    }, (info) => {
      console.log(`🚀 API server is listening on 0.0.0.0:${info.port}`);
    });
  } catch (err) {
    console.error("❌ CRITICAL: Failed to start server listen:", err);
    process.exit(1);
  }
}

startServer();

export default app;
