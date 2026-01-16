import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import { healthRoutes } from "../../routes/health.routes.js";

describe("Health Routes", () => {
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.route("/health", healthRoutes);
  });

  describe("GET /health", () => {
    it("should return ok status", async () => {
      const res = await app.request("/health");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("environment");
    });
  });

  describe("GET /health/live", () => {
    it("should return alive status", async () => {
      const res = await app.request("/health/live");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("alive");
      expect(body).toHaveProperty("timestamp");
    });
  });

  describe("GET /health/ready", () => {
    it("should return ready status with checks", async () => {
      const res = await app.request("/health/ready");
      const body = await res.json();

      // Note: This will depend on mocked database response
      expect(res.status).toBe(200);
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("checks");
      expect(body.checks).toHaveProperty("database");
      expect(body.checks).toHaveProperty("redis");
    });
  });
});
