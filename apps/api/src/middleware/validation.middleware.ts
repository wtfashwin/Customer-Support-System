import type { Context, Next } from "hono";
import type { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../lib/errors.js";

// Validation middleware factory for JSON body
export function validateBody<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set("validatedBody", validated);
      return next();
    } catch (error) {
      if ((error as ZodError).errors) {
        const zodError = error as ZodError;
        const fieldErrors = zodError.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));
        throw new ValidationError("Invalid request body", fieldErrors);
      }
      throw new ValidationError("Invalid JSON body");
    }
  };
}

// Validation middleware factory for query parameters
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      c.set("validatedQuery", validated);
      return next();
    } catch (error) {
      if ((error as ZodError).errors) {
        const zodError = error as ZodError;
        const fieldErrors = zodError.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));
        throw new ValidationError("Invalid query parameters", fieldErrors);
      }
      throw new ValidationError("Invalid query parameters");
    }
  };
}

// Validation middleware factory for URL parameters
export function validateParams<T>(schema: ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const params = c.req.param();
      const validated = schema.parse(params);
      c.set("validatedParams", validated);
      return next();
    } catch (error) {
      if ((error as ZodError).errors) {
        const zodError = error as ZodError;
        const fieldErrors = zodError.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));
        throw new ValidationError("Invalid URL parameters", fieldErrors);
      }
      throw new ValidationError("Invalid URL parameters");
    }
  };
}

// Helper to get validated data from context
export function getValidatedBody<T>(c: Context): T {
  return c.get("validatedBody") as T;
}

export function getValidatedQuery<T>(c: Context): T {
  return c.get("validatedQuery") as T;
}

export function getValidatedParams<T>(c: Context): T {
  return c.get("validatedParams") as T;
}
