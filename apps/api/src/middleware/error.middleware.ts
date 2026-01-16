import type { Context, Next } from "hono";
import { AppError } from "../lib/errors.js";
import { createServiceLogger } from "../lib/logger.js";

const logger = createServiceLogger("error-handler");

export async function errorMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    // Handle known application errors
    if (error instanceof AppError) {
      logger.warn(
        {
          code: error.code,
          message: error.message,
          statusCode: error.statusCode,
          path: c.req.path,
          method: c.req.method,
        },
        "Application error"
      );

      return c.json(error.toJSON(), error.statusCode as 400 | 401 | 403 | 404 | 409 | 429 | 500 | 502 | 503);
    }

    // Handle unexpected errors
    const unexpectedError = error as Error;
    logger.error(
      {
        error: unexpectedError.message,
        stack: unexpectedError.stack,
        path: c.req.path,
        method: c.req.method,
      },
      "Unexpected error"
    );

    // Never expose internal error details to clients
    return c.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred. Please try again later.",
        },
      },
      500
    );
  }
}
