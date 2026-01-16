import { Hono } from "hono";
import { prisma } from "@repo/database";
import { checkRedisHealth } from "../lib/redis.js";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("health");

const healthRoutes = new Hono()
  // GET /health - Basic health check
  .get("/", async (c) => {
    return c.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  })

  // GET /health/ready - Readiness check (includes DB)
  .get("/ready", async (c) => {
    const checks: Record<string, { status: string; latency?: number }> = {};

    // Check database
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: "healthy",
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      logger.error({ error }, "Database health check failed");
      checks.database = { status: "unhealthy" };
    }

    // Check Redis (optional)
    const redisStart = Date.now();
    const redisHealthy = await checkRedisHealth();
    checks.redis = {
      status: redisHealthy ? "healthy" : "not_configured",
      latency: redisHealthy ? Date.now() - redisStart : undefined,
    };

    // Determine overall status
    const isHealthy = checks.database.status === "healthy";

    return c.json(
      {
        status: isHealthy ? "ready" : "not_ready",
        timestamp: new Date().toISOString(),
        checks,
      },
      (isHealthy ? 200 : 503) as any
    );
  })

  // GET /health/live - Liveness check (lightweight)
  .get("/live", (c) => {
    return c.json({
      status: "alive",
      timestamp: new Date().toISOString(),
    });
  });

export { healthRoutes };
