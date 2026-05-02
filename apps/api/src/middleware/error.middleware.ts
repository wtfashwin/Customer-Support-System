import type { Context, Next } from "hono";
import { AppError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";
import { getRequestId } from "../utils/request.js";

const logger = createServiceLogger("error-handler");

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    const requestId = getRequestId(c) || undefined;

    // Handle known application errors
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
        "Application error"
      );

      const json = error.toJSON();
      return c.json(
        { error: { ...json.error, requestId } },
        error.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503,
      );
    }

    // Handle unexpected errors
    const unexpectedError = error as Error;
    logger.error(
      {
        error: unexpectedError.message,
        stack: unexpectedError.stack,
        path: c.req.path,
        method: c.req.method,
        requestId,
      },
      "Unexpected error"
    );

    // Never expose internal error details to clients
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
          requestId,
        },
      },
      500
    );
  }
}
