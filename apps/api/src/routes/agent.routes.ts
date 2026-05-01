/**
 * Hono passthroughs for the Python AIML agentic surface.
 *
 * Mounted under /api/agent (singular) — the existing /api/agents (plural)
 * is reserved for the legacy multi-agent classifier flow in agents.routes.ts.
 *
 * Each handler computes a stable x-request-id (inbound or freshly generated)
 * and forwards it to the AIML service so logs from both services share the
 * same correlation id. The id is also echoed back on the Hono response.
 */
import { Hono } from "hono";

import {
  AimlServiceError,
  agentRun,
  createConversation,
  getConversation,
  type AgentRunBody,
} from "../services/aiml.client.js";

const agentRoutes = new Hono();

type HonoCtx = { req: { header: (name: string) => string | undefined } };

function authHeader(c: HonoCtx): string | undefined {
  return c.req.header("authorization") ?? c.req.header("Authorization");
}

function requestId(c: HonoCtx): string {
  return c.req.header("x-request-id") ?? c.req.header("X-Request-Id") ?? crypto.randomUUID();
}

function envelope(code: string, message: string, rid?: string) {
  return { error: { code, message, requestId: rid } };
}

agentRoutes.post("/run", async (c) => {
  const rid = requestId(c);
  let body: AgentRunBody;
  try {
    body = (await c.req.json()) as AgentRunBody;
  } catch {
    c.header("x-request-id", rid);
    return c.json(envelope("validation_failed", "invalid JSON body", rid), 400);
  }
  if (!body?.message || typeof body.message !== "string") {
    c.header("x-request-id", rid);
    return c.json(envelope("validation_failed", "message must be a non-empty string", rid), 400);
  }

  try {
    const upstream = await agentRun(body, { authorization: authHeader(c), requestId: rid });
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

agentRoutes.post("/conversations", async (c) => {
  const rid = requestId(c);
  c.header("x-request-id", rid);
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
  const rid = requestId(c);
  c.header("x-request-id", rid);
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
