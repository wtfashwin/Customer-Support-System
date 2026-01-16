import { cors } from "hono/cors";

export function createCorsMiddleware() {
  const allowedOrigins = process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL]
    : ["http://localhost:3000"];

  // In development, allow any localhost origin
  if (process.env.NODE_ENV !== "production") {
    allowedOrigins.push("http://localhost:3000", "http://127.0.0.1:3000");
  }

  return cors({
    origin: (origin) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return allowedOrigins[0];

      // Check if origin is allowed
      if (allowedOrigins.includes(origin)) {
        return origin;
      }

      // In development, allow any localhost origin
      if (process.env.NODE_ENV !== "production" && origin.includes("localhost")) {
        return origin;
      }

      return allowedOrigins[0];
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-User-Id", "X-Request-Id"],
    exposeHeaders: [
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  });
}
