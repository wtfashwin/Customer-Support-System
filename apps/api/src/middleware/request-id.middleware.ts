import type { Context, Next } from "hono";

/**
 * Stable correlation id surfaced to handlers via `c.var.requestId` and
 * echoed on the response. Reads inbound `x-request-id` (case-insensitive)
 * or generates a fresh UUIDv4 so logs from this service and downstream
 * services share the same id end-to-end.
 *
 * Idempotent: if a parent middleware already set `requestId`, this is a
 * no-op. That lets us mount it both on the `/api` sub-app (for global
 * coverage) and on individual sub-routers (so route-level tests that
 * mount the sub-router in isolation still get correlation).
 */
export type RequestIdVariables = { requestId: string };

export const REQUEST_ID_HEADER = "x-request-id";

export async function requestIdMiddleware(c: Context, next: Next): Promise<void> {
  if (!c.get("requestId")) {
    const inbound = c.req.header(REQUEST_ID_HEADER) ?? c.req.header("X-Request-Id");
    const rid = inbound && inbound.trim().length > 0 ? inbound : crypto.randomUUID();
    c.set("requestId", rid);
    c.header(REQUEST_ID_HEADER, rid);
  }
  await next();
}
