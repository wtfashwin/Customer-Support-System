import type { Context } from "hono";
import type { PaginatedResponse } from "../types/index.js";

// Success response helper
export function successResponse<T>(c: Context, data: T, statusCode: 200 | 201 = 200): Response {
  return c.json({ success: true, data }, statusCode);
}

// Paginated response helper
export function paginatedResponse<T>(
  c: Context,
  data: T[],
  pagination: { page: number; limit: number; total: number }
): Response {
  const response: PaginatedResponse<T> = {
    data,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  };
  return c.json({ success: true, ...response }, 200);
}

// Stream event helpers for SSE
export function formatStreamEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Create SSE stream response
export function createStreamResponse(c: Context, stream: ReadableStream): Response {
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
export function noContentResponse(c: Context): Response {
  return c.body(null, 204);
}

// Accepted response (202) for async operations
export function acceptedResponse<T>(c: Context, data: T): Response {
  return c.json({ success: true, data }, 202);
}
