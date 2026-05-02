import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { prisma } from "@repo/database";
import { healthRoutes } from "../../routes/health.routes.js";

describe("Health Routes", () => {
  let app: Hono;
  let originalFetch: typeof fetch;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.AIML_SERVICE_URL = "http://aiml.test";
    app = new Hono();
    app.route("/health", healthRoutes);
    originalFetch = global.fetch;
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AIML_SERVICE_URL;
    vi.clearAllMocks();
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
      fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

      const res = await app.request("/health/ready");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("checks");
      expect(body.checks).toHaveProperty("database");
      expect(body.checks).toHaveProperty("redis");
      expect(body.checks).toHaveProperty("aiml");
    });

    it("reports aiml healthy when upstream /health returns 200", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 200 }));

      const res = await app.request("/health/ready");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("ready");
      expect(body.checks.aiml.status).toBe("healthy");
      expect(typeof body.checks.aiml.latency).toBe("number");

      const [calledUrl, init] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe("http://aiml.test/health");
      expect((init as RequestInit).method).toBe("GET");
    });

    it("reports aiml unhealthy on upstream 5xx but keeps overall ready (DB still healthy)", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("oops", { status: 503 }));

      const res = await app.request("/health/ready");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe("ready");
      expect(body.checks.database.status).toBe("healthy");
      expect(body.checks.aiml.status).toBe("unhealthy");
    });

    it("reports aiml unhealthy when fetch rejects (network/abort)", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("ECONNREFUSED"));

      const res = await app.request("/health/ready");
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.checks.aiml.status).toBe("unhealthy");
    });

    it("skips the aiml check entirely when DB is unhealthy", async () => {
      const queryRawMock = prisma.$queryRaw as unknown as ReturnType<typeof vi.fn>;
      queryRawMock.mockRejectedValueOnce(new Error("db down"));

      const res = await app.request("/health/ready");
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.status).toBe("not_ready");
      expect(body.checks.database.status).toBe("unhealthy");
      expect(body.checks).not.toHaveProperty("aiml");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});
