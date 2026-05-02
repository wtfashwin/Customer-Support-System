import { Hono } from "hono";

import {
  AimlServiceError,
  documentAnalyze,
  ragIngest,
  ragQuery,
  type RagIngestBody,
  type RagQueryBody,
} from "../services/aiml.client.js";
import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  type RequestIdVariables,
} from "../middleware/request-id.middleware.js";
import { authHeader, envelope, getRequestId } from "../utils/request.js";

const ragRoutes = new Hono<{ Variables: RequestIdVariables }>();

ragRoutes.use("*", requestIdMiddleware);

ragRoutes.post("/query", async (c) => {
  const rid = getRequestId(c);
  let body: RagQueryBody;
  try {
    body = (await c.req.json()) as RagQueryBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body", rid), 400);
  }
  if (!body?.query || typeof body.query !== "string") {
    return c.json(envelope("validation_failed", "query must be a non-empty string", rid), 400);
  }
  try {
    const upstream = await ragQuery(body, {
      authorization: authHeader(c),
      requestId: rid,
    });
    if (!upstream.body) {
      return c.json(envelope("upstream_error", "empty stream from aiml service", rid), 502);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        [REQUEST_ID_HEADER]: rid,
      },
    });
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

ragRoutes.post("/ingest", async (c) => {
  const rid = getRequestId(c);
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
  const rid = getRequestId(c);
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
