import type { Context, Next } from "hono";
import { prisma } from "@repo/database";
import { UnauthorizedError, NotFoundError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("auth");

export async function authMiddleware(c: Context, next: Next) {
  const userId = c.req.header("x-user-id");

  if (!userId) {
    throw new UnauthorizedError("X-User-Id header is required");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError("User", userId);
    }

    // Set user in context for downstream handlers
    c.set("user", user);

    logger.debug({ userId: user.id, email: user.email }, "User authenticated");

    return next();
  } catch (error) {
    // Re-throw known errors
    if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
      throw error;
    }

    logger.error({ error, userId }, "Auth middleware error");
    throw new UnauthorizedError("Authentication failed");
  }
}

// Helper to get current user from context
export function getCurrentUser(c: Context) {
  const user = c.get("user");
  if (!user) {
    throw new UnauthorizedError("User not authenticated");
  }
  return user;
}
