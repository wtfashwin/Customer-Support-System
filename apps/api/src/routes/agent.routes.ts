/**
 * Hono passthroughs for the Python AIML agentic surface.
 *
 * Mounted under /api/agent (singular) — the existing /api/agents (plural)
 * is reserved for the legacy multi-agent classifier flow in agents.routes.ts.
 *
 * Correlation: `requestIdMiddleware` seeds `c.var.requestId` from the
 * inbound `x-request-id` (or generates a UUIDv4) and echoes it on the
 * response. Each handler forwards the same id to the AIML service so
 * logs from both services share a single correlation key.
 */
import { Hono } from "hono";

import {
  REQUEST_ID_HEADER,
  requestIdMiddleware,
  type RequestIdVariables,
} from "../middleware/request-id.middleware.js";
import {
  AimlServiceError,
  agentRun,
  createConversation,
  getConversation,
  type AgentRunBody,
} from "../services/aiml.client.js";
import { authHeader, envelope, getRequestId } from "../utils/request.js";

const agentRoutes = new Hono<{ Variables: RequestIdVariables }>();

agentRoutes.use("*", requestIdMiddleware);

agentRoutes.post("/run", async (c) => {
  const rid = getRequestId(c);
  let body: AgentRunBody;
  try {
    body = (await c.req.json()) as AgentRunBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body", rid), 400);
  }
  if (!body?.message || typeof body.message !== "string") {
    return c.json(envelope("validation_failed", "message must be a non-empty string", rid), 400);
  }

  try {
    const upstream = await agentRun(body, { authorization: authHeader(c), requestId: rid });
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

agentRoutes.post("/conversations", async (c) => {
  const rid = getRequestId(c);
  let body: { title?: string; metadata?: Record<string, unknown> } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    // Empty body is OK — the AIML service accepts it.
  }
  try {
    const created = await createConversation(body, {
      authorization: authHeader(c),
      requestId: rid,
    });
    return c.json(created);
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

agentRoutes.get("/conversations/:id", async (c) => {
  const rid = getRequestId(c);
  const id = c.req.param("id");
  try {
    const convo = await getConversation(id, {
      authorization: authHeader(c),
      requestId: rid,
    });
    return c.json(convo);
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

export { agentRoutes };
