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

function authHeader(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  return c.req.header("authorization") ?? c.req.header("Authorization");
}

function envelope(code: string, message: string, requestId?: string) {
  return { error: { code, message, requestId } };
}

ragRoutes.post("/query", async (c) => {
  let body: RagQueryBody;
  try {
    body = (await c.req.json()) as RagQueryBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body"), 400);
  }
  if (!body?.query || typeof body.query !== "string") {
    return c.json(envelope("validation_failed", "query must be a non-empty string"), 400);
  }
  try {
    const upstream = await ragQuery(body, { authorization: authHeader(c) });
    if (!upstream.body) {
      return c.json(envelope("upstream_error", "empty stream from aiml service"), 502);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown"),
      502,
    );
  }
});

ragRoutes.post("/ingest", async (c) => {
  let body: RagIngestBody;
  try {
    body = (await c.req.json()) as RagIngestBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body"), 400);
  }
  if (!Array.isArray(body?.documents) || body.documents.length === 0) {
    return c.json(envelope("validation_failed", "documents must be a non-empty array"), 400);
  }
  try {
    const result = await ragIngest(body, { authorization: authHeader(c) });
    return c.json(result);
  } catch (err) {
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown"),
      502,
    );
  }
});

ragRoutes.post("/document/analyze", async (c) => {
  const contentType = c.req.header("content-type") ?? "application/octet-stream";
  const buf = await c.req.arrayBuffer();
  try {
    const upstream = await documentAnalyze(buf, contentType, {
      authorization: authHeader(c),
    });
    const data = await upstream.json();
    return c.json(data);
  } catch (err) {
    if (err instanceof AimlServiceError) {
      return c.json(envelope(err.code, err.message, err.requestId), err.status as 400);
    }
    return c.json(
      envelope("upstream_error", err instanceof Error ? err.message : "unknown"),
      502,
    );
  }
});

export { ragRoutes };
