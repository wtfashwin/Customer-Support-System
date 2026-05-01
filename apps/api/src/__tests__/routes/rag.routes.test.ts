import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

import { ragRoutes } from "../../routes/rag.routes.js";

function makeApp() {
  const app = new Hono();
  app.route("/api/rag", ragRoutes);
  return app;
}

describe("rag.routes proxy", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    process.env.AIML_SERVICE_URL = "http://aiml.test";
    originalFetch = global.fetch;
    fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.AIML_SERVICE_URL;
    vi.clearAllMocks();
  });

  it("forwards Authorization header to /v1/rag/ingest", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ingested: 1, nodes: 3 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token-abc",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documents: [{ id: "d1", text: "hello", metadata: {} }] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ingested: 1, nodes: 3 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://aiml.test/v1/rag/ingest");
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token-abc");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("rejects an empty documents array with 400", async () => {
    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates upstream error envelope on 4xx", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "missing_scope", message: "needs aiml:write", requestId: "rid-1" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [{ id: "d", text: "t", metadata: {} }] }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("missing_scope");
    expect(body.error.requestId).toBe("rid-1");
  });

  it("retries on upstream 5xx then succeeds", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response("oops", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ingested: 1, nodes: 1 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [{ id: "d", text: "t", metadata: {} }] }),
    });
    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("forwards inbound x-request-id verbatim and echoes it on the response", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ingested: 1, nodes: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = makeApp();
    const inboundRid = "req-abc-123";
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: {
        "x-request-id": inboundRid,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ documents: [{ id: "d", text: "t", metadata: {} }] }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe(inboundRid);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("x-request-id")).toBe(inboundRid);
  });

  it("generates a fresh x-request-id when caller omits the header", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ingested: 1, nodes: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [{ id: "d", text: "t", metadata: {} }] }),
    });

    expect(res.status).toBe(200);
    const echoed = res.headers.get("x-request-id");
    expect(echoed).toBeTruthy();
    // UUIDv4 shape
    expect(echoed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("x-request-id")).toBe(echoed);
  });

  it("/api/rag/query passes through SSE body and forwards auth", async () => {
    const sse = "event: token\ndata: {\"delta\":\"hi\"}\n\nevent: done\ndata: {\"answer\":\"hi\"}\n\n";
    fetchSpy.mockResolvedValueOnce(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: {
        Authorization: "Bearer t",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "hello", top_k: 2 }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    const text = await res.text();
    expect(text).toContain("event: token");
    expect(text).toContain("event: done");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer t");
  });
});
