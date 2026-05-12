import Redis from "ioredis";
import Fastify from "fastify";

console.log("1. Creating Redis...");
const redis = new Redis("redis://localhost:6379", { lazyConnect: false, enableReadyCheck: false });
redis.on("connect", () => console.log("2. Redis connected"));

console.log("3. Creating Fastify...");
const app = Fastify({ logger: false });
app.get("/health", async () => ({ ok: true }));

console.log("4. Listening...");
await app.listen({ port: 3002, host: "0.0.0.0" });
console.log("5. Server up on :3002");
