/**
 * Hono passthroughs for the Python AIML agentic surface.
 *
 * Mounted under /api/agent (singular) — the existing /api/agents (plural)
 * is reserved for the legacy multi-agent classifier flow in agents.routes.ts.
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

function authHeader(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  return c.req.header("authorization") ?? c.req.header("Authorization");
}

function envelope(code: string, message: string, requestId?: string) {
  return { error: { code, message, requestId } };
}

agentRoutes.post("/run", async (c) => {
  let body: AgentRunBody;
  try {
    body = (await c.req.json()) as AgentRunBody;
  } catch {
    return c.json(envelope("validation_failed", "invalid JSON body"), 400);
  }
  if (!body?.message || typeof body.message !== "string") {
    return c.json(envelope("validation_failed", "message must be a non-empty string"), 400);
  }

  try {
    const upstream = await agentRun(body, { authorization: authHeader(c) });
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

agentRoutes.post("/conversations", async (c) => {
  let body: { title?: string; metadata?: Record<string, unknown> } = {};
  try {
    body = (await c.req.json()) as typeof body;
  } catch {
    // Empty body is OK — the AIML service accepts it.
  }
  try {
    const created = await createConversation(body, { authorization: authHeader(c) });
    return c.json(created);
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

agentRoutes.get("/conversations/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const convo = await getConversation(id, { authorization: authHeader(c) });
    return c.json(convo);
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

export { agentRoutes };
