import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

import { agentRoutes } from "../../routes/agent.routes.js";

function makeApp() {
  const app = new Hono();
  app.route("/api/agent", agentRoutes);
  return app;
}

describe("agent.routes proxy", () => {
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

  it("proxies /api/agent/run as SSE pass-through with auth forwarding", async () => {
    const sse =
      "event: tool_call\ndata: {\"callId\":\"c1\",\"name\":\"echo\",\"args\":{}}\n\n" +
      "event: tool_result\ndata: {\"callId\":\"c1\",\"ok\":true,\"result\":{}}\n\n" +
      "event: token\ndata: {\"delta\":\"hi\"}\n\n" +
      "event: done\ndata: {\"answer\":\"hi\",\"conversationId\":\"c\",\"messageId\":\"m\"}\n\n";

    fetchSpy.mockResolvedValueOnce(
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = makeApp();
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    const text = await res.text();
    expect(text).toContain("event: tool_call");
    expect(text).toContain("event: tool_result");
    expect(text).toContain("event: done");

    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://aiml.test/v1/agents/run");
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(headers.get("Accept")).toBe("text/event-stream");
  });

  it("rejects /api/agent/run with no message via 400", async () => {
    const app = makeApp();
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("validation_failed");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates upstream 403 envelope (e.g., missing scope)", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: "missing_scope", message: "needs aiml:tools:invoke", requestId: "rid-9" },
        }),
        { status: 403, headers: { "content-type": "application/json" } },
      ),
    );

    const app = makeApp();
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("missing_scope");
    expect(body.error.requestId).toBe("rid-9");
  });

  it("creates a conversation via POST /api/agent/conversations", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ id: "conv-1", title: null, createdAt: "2026-05-08T00:00:00Z" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const app = makeApp();
    const res = await app.request("/api/agent/conversations", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "first" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("conv-1");

    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://aiml.test/v1/conversations");
    const headers = (init as RequestInit).headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token");
  });

  it("forwards inbound x-request-id to /v1/agents/run and echoes it back", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response("event: done\ndata: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const app = makeApp();
    const inboundRid = "agent-rid-42";
    const res = await app.request("/api/agent/run", {
      method: "POST",
      headers: {
        "x-request-id": inboundRid,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "hi" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe(inboundRid);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Headers;
    expect(headers.get("x-request-id")).toBe(inboundRid);
  });

  it("fetches a conversation by id", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "conv-2",
          title: "t",
          createdAt: "2026-05-08T00:00:00Z",
          updatedAt: "2026-05-08T00:00:00Z",
          messages: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const app = makeApp();
    const res = await app.request("/api/agent/conversations/conv-2", {
      headers: { Authorization: "Bearer t" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("conv-2");

    const [calledUrl] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe("http://aiml.test/v1/conversations/conv-2");
  });
});
