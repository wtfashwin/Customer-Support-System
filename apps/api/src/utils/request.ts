import type { Context } from "hono";

/**
 * Inbound `Authorization` header (case-insensitive). Use this when
 * forwarding the user's bearer token to a downstream service.
 */
export function authHeader(c: Context): string | undefined {
  return c.req.header("authorization") ?? c.req.header("Authorization");
}

/**
 * Read the correlation id seeded by `requestIdMiddleware`. Falls back to
 * empty string if the middleware is not mounted — callers that depend on
 * it should always mount the middleware on their router.
 */
export function getRequestId(c: Context): string {
  return (c.get("requestId") as string | undefined) ?? "";
}

/**
 * Standard error envelope: `{ error: { code, message, requestId } }`.
 * Matches the shape returned by the AIML service for symmetry.
 */
export function envelope(code: string, message: string, requestId?: string) {
  return { error: { code, message, requestId } };
}
