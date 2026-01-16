import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
          },
        }
      : undefined,
  base: {
    env: process.env.NODE_ENV,
  },
  redact: ["req.headers.authorization", "req.headers['x-api-key']"],
});

// Child logger factory for services
export function createServiceLogger(service: string) {
  return logger.child({ service });
}
