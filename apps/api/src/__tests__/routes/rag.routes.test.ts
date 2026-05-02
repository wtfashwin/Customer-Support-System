import { Hono } from "hono";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { ragRoutes } from "../../routes/rag.routes.js";
import * as aimlClient from "../../services/aiml.client.js";

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

  it("/api/rag/query returns 502 when upstream body is missing", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 200, headers: { "content-type": "text/event-stream" } }),
    );
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hi" }),
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBeTruthy();
    const body = await res.json();
    expect(body.error.code).toBe("upstream_error");
    expect(body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  it("/api/rag/query rejects invalid JSON body with 400", async () => {
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: "validation_failed" },
    });
  });

  it("/api/rag/query propagates upstream AimlServiceError envelope", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "missing_scope", message: "needs aiml:read", requestId: "rid-up" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "hi" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("missing_scope");
  });

  it("/api/rag/query rejects empty query string with 400", async () => {
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("/api/rag/document/analyze proxies multipart and propagates errors", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ text: "hello", pages: [], tables: [], key_value_pairs: [] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const app = makeApp();
    const res = await app.request("/api/rag/document/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/pdf", "x-request-id": "doc-1" },
      body: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("doc-1");

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("application/pdf");
    expect(headers.get("x-request-id")).toBe("doc-1");
  });

  it("/api/rag/document/analyze surfaces upstream 4xx envelope", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { code: "payload_too_large", message: "too big" } }),
        { status: 413, headers: { "content-type": "application/json" } },
      ),
    );
    const app = makeApp();
    const res = await app.request("/api/rag/document/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array([0]),
    });
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("payload_too_large");
  });

  it("/api/rag/ingest rejects invalid JSON with 400 + rid", async () => {
    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "x-request-id": "ingest-bad-json", "Content-Type": "application/json" },
      body: "not-json",
    });
    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBe("ingest-bad-json");
    expect((await res.json()).error.code).toBe("validation_failed");
  });

  it("/api/rag/query maps a non-AimlServiceError thrown by the client to 502", async () => {
    // Defense-in-depth branch: client today only throws AimlServiceError, but
    // the route still has a generic Error fallback. Force-cover it by mocking
    // ragQuery to throw a plain Error.
    const spy = vi.spyOn(aimlClient, "ragQuery").mockRejectedValue(new Error("kaboom"));
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "x-request-id": "boom-1", "Content-Type": "application/json" },
      body: JSON.stringify({ query: "x" }),
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBe("boom-1");
    const body = await res.json();
    expect(body.error.code).toBe("upstream_error");
    expect(body.error.message).toBe("kaboom");
    spy.mockRestore();
  });

  it("/api/rag/ingest maps a non-AimlServiceError to 502 envelope", async () => {
    const spy = vi.spyOn(aimlClient, "ragIngest").mockRejectedValue(new Error("ingest blew up"));
    const app = makeApp();
    const res = await app.request("/api/rag/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documents: [{ id: "d", text: "t", metadata: {} }] }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe("ingest blew up");
    spy.mockRestore();
  });

  it("/api/rag/document/analyze maps a non-AimlServiceError to 502 envelope", async () => {
    const spy = vi.spyOn(aimlClient, "documentAnalyze").mockRejectedValue(new Error("doc blew up"));
    const app = makeApp();
    const res = await app.request("/api/rag/document/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/pdf" },
      body: new Uint8Array([0]),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe("doc blew up");
    spy.mockRestore();
  });

  it("/api/rag/query returns 502 with rid when fetch itself rejects", async () => {
    // Make every retry attempt reject — the client should ultimately surface
    // an AimlServiceError, which the route maps back to the upstream_error
    // envelope via the AimlServiceError branch (not the generic catch).
    fetchSpy.mockRejectedValue(new Error("ECONNREFUSED"));
    const app = makeApp();
    const res = await app.request("/api/rag/query", {
      method: "POST",
      headers: { "x-request-id": "net-1", "Content-Type": "application/json" },
      body: JSON.stringify({ query: "x" }),
    });
    expect(res.status).toBe(502);
    expect(res.headers.get("x-request-id")).toBe("net-1");
    expect((await res.json()).error.code).toBe("upstream_error");
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
