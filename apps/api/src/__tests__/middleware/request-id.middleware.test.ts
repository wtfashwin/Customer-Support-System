import { describe, it, expect } from "vitest";
import { Hono } from "hono";

import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  type RequestIdVariables,
} from "../../middleware/request-id.middleware.js";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function makeApp() {
  const app = new Hono<{ Variables: RequestIdVariables }>();
  app.use("*", requestIdMiddleware);
  app.get("/probe", (c) => c.json({ rid: c.get("requestId") }));
  return app;
}

describe("requestIdMiddleware", () => {
  it("generates a UUIDv4 when no inbound x-request-id is present", async () => {
    const res = await makeApp().request("/probe");
    expect(res.status).toBe(200);

    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).toBeTruthy();
    expect(echoed).toMatch(UUID_V4_RE);

    const body = (await res.json()) as { rid: string };
    expect(body.rid).toBe(echoed);
  });

  it("preserves an inbound lowercase x-request-id verbatim", async () => {
    const res = await makeApp().request("/probe", {
      headers: { "x-request-id": "rid-lower-1" },
    });
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("rid-lower-1");
    const body = (await res.json()) as { rid: string };
    expect(body.rid).toBe("rid-lower-1");
  });

  it("preserves an inbound capitalised X-Request-Id verbatim", async () => {
    const res = await makeApp().request("/probe", {
      headers: { "X-Request-Id": "rid-mixed-case" },
    });
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("rid-mixed-case");
  });

  it("treats a whitespace-only x-request-id as missing and generates a fresh one", async () => {
    const res = await makeApp().request("/probe", {
      headers: { "x-request-id": "   " },
    });
    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).toMatch(UUID_V4_RE);
  });

  it("is idempotent — a second mount does not overwrite a parent-set requestId", async () => {
    const inner = new Hono<{ Variables: RequestIdVariables }>();
    inner.use("*", requestIdMiddleware);
    inner.get("/probe", (c) => c.json({ rid: c.get("requestId") }));

    const outer = new Hono<{ Variables: RequestIdVariables }>();
    outer.use("*", requestIdMiddleware);
    outer.route("/inner", inner);

    const res = await outer.request("/inner/probe", {
      headers: { "x-request-id": "parent-set" },
    });

    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("parent-set");
    const body = (await res.json()) as { rid: string };
    expect(body.rid).toBe("parent-set");
  });

  it("seeds a fresh id when the parent did not, and the child inherits it", async () => {
    const inner = new Hono<{ Variables: RequestIdVariables }>();
    inner.use("*", requestIdMiddleware);
    inner.get("/probe", (c) => c.json({ rid: c.get("requestId") }));

    const outer = new Hono<{ Variables: RequestIdVariables }>();
    outer.use("*", requestIdMiddleware);
    outer.route("/inner", inner);

    const res = await outer.request("/inner/probe");
    const echoed = res.headers.get(REQUEST_ID_HEADER);
    expect(echoed).toMatch(UUID_V4_RE);
    const body = (await res.json()) as { rid: string };
    expect(body.rid).toBe(echoed);
  });
});
