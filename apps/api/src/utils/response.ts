/// <reference types="undici-types" />
import type { Context } from "hono";
import type { PaginatedResponse } from "../types/index.js";

// Success response helper
export function successResponse<T>(c: Context, data: T, statusCode: 200 | 201 = 200) {
  return c.json({ success: true as const, data }, statusCode);
}

// Paginated response helper
export function paginatedResponse<T>(
  c: Context,
  data: T[],
  pagination: { page: number; limit: number; total: number }
) {
  const response: PaginatedResponse<T> = {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  };
  return c.json({ success: true as const, ...response }, 200);
}

// Stream event helpers for SSE
export function formatStreamEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Create SSE stream response
export function createStreamResponse(c: Context, stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable buffering for nginx
    },
  });
}

// No content response (204)
export function noContentResponse(c: Context) {
  return c.body(null, 204);
}

// Accepted response (202) for async operations
export function acceptedResponse<T>(c: Context, data: T) {
  return c.json({ success: true as const, data }, 202);
}
