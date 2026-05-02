import type { Context, Next } from "hono";

import { AppError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";
import { getRequestId } from "../utils/request.js";

const logger = createServiceLogger("error-handler");

type AppStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503;

/**
 * Build the JSON envelope for any thrown error. Shared by both
 * `errorMiddleware` (a Hono middleware) and `errorHandler` (the Hono
 * `app.onError` shape) so they emit identical responses.
 */
function buildErrorResponse(error: unknown, c: Context): Response {
  const requestId = getRequestId(c) || undefined;

  if (error instanceof AppError) {
    logger.warn(
      {
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        path: c.req.path,
        method: c.req.method,
        requestId,
      },
      "Application error",
    );
    const json = error.toJSON();
    return c.json(
      { error: { ...json.error, requestId } },
      error.statusCode as AppStatus,
    );
  }

  const unexpected = error as Error;
  logger.error(
    {
      error: unexpected.message,
      stack: unexpected.stack,
      path: c.req.path,
      method: c.req.method,
      requestId,
    },
    "Unexpected error",
  );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred. Please try again later.",
        requestId,
      },
    },
    500,
  );
}

/**
 * Try/catch wrapper. Useful as the outermost middleware on a top-level
 * Hono app where `app.onError` would otherwise compete with the parent
 * app's own error handler.
 */
export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    return buildErrorResponse(error, c);
  }
}

/**
 * Use as `subRouter.onError(errorHandler)` on every Hono sub-router that
 * is mounted under a parent via `parent.route("/x", subRouter)`. Without
 * this, a throw in any sub-router middleware (e.g. authMiddleware) is
 * caught by Hono's per-sub-app default error handler — which returns
 * plaintext "Internal Server Error" 500 — and the throw never bubbles
 * back to errorMiddleware on the parent.
 */
export function errorHandler(error: Error, c: Context): Response {
  return buildErrorResponse(error, c);
}
