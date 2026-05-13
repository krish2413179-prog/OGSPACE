import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
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

    // MirrorMind API v1.0.4 - WS Fix
    const rawUrl = request.raw.url || request.url || "";
    const url = new URL(rawUrl, "http://localhost");
    const token = url.searchParams.get("token") || (request.query as any)?.token;

    app.log.info({ 
      rawUrl,
      hasToken: !!token,
      version: "1.0.4"
    }, "Incoming WebSocket connection");

    const closeConnection = () => {
      try {
        if (connection.socket && typeof connection.socket.close === "function") {
          connection.socket.close();
        } else if (typeof connection.destroy === "function") {
          connection.destroy();
        } else {
          connection.end();
        }
      } catch (e) {
        // Last resort
      }
    };

    if (!token) {
      app.log.warn("WebSocket connection rejected: No token found in URL (v1.0.4)");
      closeConnection();
      return;
    }

    // Use a self-executing async function for the verification logic
    (async () => {
      try {
        app.log.info("Verifying WebSocket token (v1.0.4)...");
        const payload = await app.jwt.verify<JwtPayload>(token);
        const { userId } = payload;

        app.log.info({ userId }, "WebSocket authenticated successfully");

        if (!wsClients.has(userId)) {
          wsClients.set(userId, new Set());
        }
        const userClients = wsClients.get(userId)!;
        userClients.add(connection.socket as any);

        connection.socket.on("close", () => {
          app.log.info({ userId }, "WebSocket connection closed");
          userClients.delete(connection.socket as any);
          if (userClients.size === 0) {
            wsClients.delete(userId);
          }
        });
      } catch (err) {
        app.log.error({ err, token: token.slice(0, 10) + "..." }, "WebSocket JWT verification failed");
        closeConnection();
      }
    })();
  });

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
  console.log("MirrorMind API v1.0.4 starting...");
  const app = buildApp();

  try {
    // Run migrations before starting the server
    const { runMigration } = await import("./db/migrate.js");
    await runMigration();

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

const isMain = process.argv[1] && (
  process.argv[1].includes("server.js") || 
  process.argv[1].includes("server.ts") ||
  process.argv[1].endsWith("api") // For some runtime environments
);

if (isMain) {
  start();
}
