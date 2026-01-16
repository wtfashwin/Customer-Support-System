import type { Context, Next } from "hono";
import { getRateLimiter } from "../lib/redis.js";
import { RateLimitError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("rate-limiter");

export async function rateLimitMiddleware(c: Context, next: Next) {
  const rateLimiter = getRateLimiter();

  // If rate limiter is not configured, skip rate limiting
  if (!rateLimiter) {
    return next();
  }

  // Use X-User-Id or IP as identifier
  const identifier =
    c.req.header("x-user-id") ||
    c.req.header("x-forwarded-for") ||
    c.req.header("x-real-ip") ||
    "anonymous";

  try {
    const { success, limit, remaining, reset } = await rateLimiter.limit(identifier);

    // Set rate limit headers
    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", reset.toString());

    if (!success) {
      logger.warn({ identifier, path: c.req.path }, "Rate limit exceeded");
      throw new RateLimitError(reset);
    }

    return next();
  } catch (error) {
    // Re-throw rate limit errors
    if (error instanceof RateLimitError) {
      throw error;
    }

    // Log but don't block on rate limiter errors
    logger.error({ error, identifier }, "Rate limiter error");
    return next();
  }
}
