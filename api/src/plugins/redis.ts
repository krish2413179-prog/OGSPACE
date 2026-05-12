import { Redis } from "ioredis";

if (!process.env.REDIS_URL) {
  throw new Error("REDIS_URL environment variable is required");
}

/** Shared Redis instance for direct get/set/pub/sub operations */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const redis: any = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
  lazyConnect: true,
});

/**
 * BullMQ connection — typed as `any` to bypass the strict ConnectionOptions
 * type mismatch between ioredis versions bundled by BullMQ and the top-level
 * ioredis package. At runtime this is the same IORedis instance.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const bullmqConnection: any = redis;

redis.on("error", (err: Error) => {
  console.error("[Redis] Connection error:", err);
});

redis.on("connect", () => {
  console.info("[Redis] Connected");
});
