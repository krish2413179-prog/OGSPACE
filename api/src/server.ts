import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyWebsocket from "@fastify/websocket";
import jwt from "@fastify/jwt";
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

export async function buildApp() {
  const app = Fastify({ logger });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(fastifyWebsocket);

  app.get("/ws", { websocket: true }, (connection, req) => {
    const token = (req.query as any).token;
    if (!token) {
      connection.socket.close();
      return;
    }
    try {
      const decoded = app.jwt.verify(token) as JwtPayload;
      const userId = decoded.userId;
      if (!wsClients.has(userId)) wsClients.set(userId, new Set());
      wsClients.get(userId)!.add(connection.socket);

      connection.socket.on("close", () => {
        wsClients.get(userId)?.delete(connection.socket);
      });
    } catch {
      connection.socket.close();
    }
  });

  await app.register(jwt, {
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

  app.get("/", async () => ({ status: "alive", service: "MirrorMind API" }));
  app.get("/health", async () => ({ status: "ok", timestamp: new Date().toISOString() }));

  const { authRoutes, userRoutes } = await import("./routes/auth.js");
  const { indexingRoutes } = await import("./routes/indexing.js");
  const { modelRoutes } = await import("./routes/models.js");
  const { agentRoutes } = await import("./routes/agents.js");
  const { nftRoutes } = await import("./routes/nfts.js");
  const { marketplaceRoutes } = await import("./routes/marketplace.js");

  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(userRoutes, { prefix: "/users" });
  await app.register(indexingRoutes, { prefix: "/indexing" });
  await app.register(modelRoutes, { prefix: "/models" });
  await app.register(agentRoutes, { prefix: "/agents" });
  await app.register(nftRoutes, { prefix: "/nfts" });
  await app.register(marketplaceRoutes, { prefix: "/marketplace" });

  return app;
}

export async function start() {
  const app = await buildApp();

  try {
    const port = parseInt(process.env.PORT ?? "3001", 10);
    const host = "0.0.0.0";
    
    app.log.info(`MirrorMind API: attempting to listen on ${host}:${port}...`);
    const address = await app.listen({ port, host });
    app.log.info(`MirrorMind API: successfully listening at ${address}`);

    setImmediate(async () => {
      try {
        const { startAllWorkers } = await import("./workers/index.js");
        startAllWorkers(broadcast);
        app.log.info("BullMQ workers initialized");
      } catch (e) {
        app.log.error(e, "Workers failed to initialize");
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

import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}
