// Minimal test to isolate the hang
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";

console.log("1. Creating Fastify app...");
const app = Fastify({ logger: false });

console.log("2. Registering cors...");
await app.register(cors);

console.log("3. Registering jwt...");
await app.register(jwt, { secret: "test-secret" });

console.log("4. Adding health route...");
app.get("/health", async () => ({ ok: true }));

console.log("5. Calling app.listen...");
await app.listen({ port: 3001, host: "0.0.0.0" });
console.log("6. Server listening on :3001");
