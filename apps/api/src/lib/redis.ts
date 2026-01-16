import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { createServiceLogger } from "./logger.js";

const logger = createServiceLogger("redis");

// Redis client singleton (only initialize if credentials are available)
let redisClient: Redis | null = null;
let rateLimiter: Ratelimit | null = null;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn("Redis credentials not configured. Rate limiting disabled.");
    return null;
  }

  try {
    redisClient = new Redis({ url, token });
    logger.info("Redis client initialized");
    return redisClient;
  } catch (error) {
    logger.error({ error }, "Failed to initialize Redis client");
    return null;
  }
}

export function getRateLimiter(): Ratelimit | null {
  if (rateLimiter) return rateLimiter;

  const redis = getRedisClient();
  if (!redis) return null;

  try {
    // Token bucket: 20 requests per 10 seconds for chat endpoints
    rateLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "10 s"),
      analytics: true,
      prefix: "ratelimit:chat",
    });
    logger.info("Rate limiter initialized");
    return rateLimiter;
  } catch (error) {
    logger.error({ error }, "Failed to initialize rate limiter");
    return null;
  }
}

// Health check for Redis connection
export async function checkRedisHealth(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return true; // If Redis is not configured, consider it healthy (optional dependency)

  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
