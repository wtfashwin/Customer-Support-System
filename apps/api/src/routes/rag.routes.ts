import { Hono } from "hono";

import {
  AimlServiceError,
  documentAnalyze,
  ragIngest,
  ragQuery,
  type RagIngestBody,
  type RagQueryBody,
} from "../services/aiml.client.js";

const ragRoutes = new Hono();

type HonoCtx = { req: { header: (name: string) => string | undefined } };

function authHeader(c: HonoCtx): string | undefined {
  return c.req.header("authorization") ?? c.req.header("Authorization");
}

/**
 * Read inbound x-request-id; if absent, generate a fresh UUIDv4 so the
 * Python service still sees a stable id and the same id can be echoed
 * to our caller for log correlation.
 */
function requestId(c: HonoCtx): string {
  return c.req.header("x-request-id") ?? c.req.header("X-Request-Id") ?? crypto.randomUUID();
}

function envelope(code: string, message: string, rid?: string) {
  return { error: { code, message, requestId: rid } };
}

ragRoutes.post("/query", async (c) => {
  const rid = requestId(c);
  let body: RagQueryBody;
  try {
    body = (await c.req.json()) as RagQueryBody;
  } catch {
    c.header("x-request-id", rid);
    return c.json(envelope("validation_failed", "invalid JSON body", rid), 400);
  }
  if (!body?.query || typeof body.query !== "string") {
    c.header("x-request-id", rid);
    return c.json(envelope("validation_failed", "query must be a non-empty string", rid), 400);
  }
  try {
    const upstream = await ragQuery(body, {
      authorization: authHeader(c),
      requestId: rid,
    });
    if (!upstream.body) {
      c.header("x-request-id", rid);
      return c.json(envelope("upstream_error", "empty stream from aiml service", rid), 502);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "x-request-id": rid,
      },
    });
  } catch (err) {
    c.header("x-request-id", rid);
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId ?? rid), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown", rid),
      502,
    );
  }
});

ragRoutes.post("/ingest", async (c) => {
  const rid = requestId(c);
  c.header("x-request-id", rid);
  let body: RagIngestBody;
  try {
    body = (await c.req.json()) as RagIngestBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body", rid), 400);
  }
  if (!Array.isArray(body?.documents) || body.documents.length === 0) {
    return c.json(envelope("validation_failed", "documents must be a non-empty array", rid), 400);
  }
  try {
    const result = await ragIngest(body, {
      authorization: authHeader(c),
      requestId: rid,
    });
    return c.json(result);
  } catch (err) {
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId ?? rid), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown", rid),
      502,
    );
  }
});

ragRoutes.post("/document/analyze", async (c) => {
  const rid = requestId(c);
  c.header("x-request-id", rid);
  const contentType = c.req.header("content-type") ?? "application/octet-stream";
  const buf = await c.req.arrayBuffer();
  try {
    const upstream = await documentAnalyze(buf, contentType, {
      authorization: authHeader(c),
      requestId: rid,
    });
    const data = await upstream.json();
    return c.json(data);
  } catch (err) {
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId ?? rid), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown", rid),
      502,
    );
  }
});

export { ragRoutes };
