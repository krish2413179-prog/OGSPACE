import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fp from "fastify-plugin";
import { authRoutes, userRoutes } from "./routes/auth.js";
import { indexingRoutes } from "./routes/indexing.js";
import { modelRoutes } from "./routes/models.js";
import { agentRoutes } from "./routes/agents.js";
import { nftRoutes } from "./routes/nfts.js";
import { marketplaceRoutes } from "./routes/marketplace.js";
import { logger } from "./lib/logger.js";
import type { JwtPayload } from "./types/index.js";

export const wsClients = new Map<string, Set<{ send: (msg: string) => void }>>();

export function broadcast(userId: string, event: string, payload: unknown): void {
  const clients = wsClients.get(userId);
  if (!clients) return;
  const message = JSON.stringify({ type: event, payload });
  for (const ws of clients) {
    try { ws.send(message); } catch { clients.delete(ws); }
  }
}

export function buildApp() {
  const app = Fastify({ logger });

  // Register cors and jwt with fp() so they're available in all child plugins
  app.register(fp(cors), {
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      "http://localhost:3003",
      process.env.FRONTEND_URL,
    ].filter(Boolean) as string[],
    credentials: true,
  });

  app.register(fp(jwt), {
    secret: process.env.JWT_SECRET ?? "dev-secret-change-in-production",
    sign: { expiresIn: "24h" },
  });

  app.decorate("authenticate", async function authenticate(
    request: import("fastify").FastifyRequest,
    reply: import("fastify").FastifyReply
  ) {
    try {
      await request.jwtVerify();
    } catch (err) {
      const message = err instanceof Error && err.message.includes("expired")
        ? "Token has expired. Please sign in again."
        : "Authentication required. Please provide a valid JWT.";
      reply.status(401).send({ error: "Unauthorized", message });
    }
  });

  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  // Routes
  app.register(authRoutes, { prefix: "/auth" });
  app.register(userRoutes, { prefix: "/users" });
  app.register(indexingRoutes, { prefix: "/indexing" });
  app.register(modelRoutes, { prefix: "/models" });
  app.register(agentRoutes, { prefix: "/agents" });
  app.register(nftRoutes, { prefix: "/nfts" });
  app.register(marketplaceRoutes, { prefix: "/marketplace" });

  return app;
}

export async function start() {
  const app = buildApp();

  try {
    const port = parseInt(process.env.PORT ?? "3001", 10);
    const host = process.env.HOST ?? "0.0.0.0";
    await app.listen({ port, host });
    console.log(`MirrorMind API listening on ${host}:${port}`);

    // Start workers asynchronously — don't block the event loop
    setImmediate(async () => {
      try {
        const { startAllWorkers } = await import("./workers/index.js");
        startAllWorkers(broadcast);
        console.log("BullMQ workers started");
      } catch (e) {
        console.error("Workers failed:", e);
      }
    });
  } catch (err) {
    console.error("Server failed to start:", err);
    process.exit(1);
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply): Promise<void>;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  start();
}
