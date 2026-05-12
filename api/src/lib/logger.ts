import { pino } from "pino";

// Plain JSON logger — no worker threads, no pino-pretty
// This avoids blocking the event loop in Node.js v20+ with ESM
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
});
