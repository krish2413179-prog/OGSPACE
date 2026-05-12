/**
 * Indexing routes
 *
 * GET /indexing/status (JWT protected)
 * Returns the current indexing status for the authenticated user.
 *
 * Requirements: 2.7
 */

import type { FastifyInstance } from "fastify";
import { redis } from "../plugins/redis.js";
import { authenticate } from "../middleware/authenticate.js";
import type { IndexingStatus } from "../types/index.js";

// Inline to avoid importing indexWorker.ts which creates BullMQ queues at module load
const INDEXING_STATUS_KEY = (userId: string) => `indexing:status:${userId}`;
interface IndexingStatusPayload {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED";
  progress: number;
  totalActions: number;
  lastIndexedAt: string | null;
}

export async function indexingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/status", { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as import("../types/index.js").JwtPayload;
    const raw = await redis.get(INDEXING_STATUS_KEY(userId));

    if (!raw) {
      return reply.status(200).send({
        status: "PENDING" as IndexingStatus,
        progress: 0,
        totalActions: 0,
        lastIndexedAt: null,
      });
    }

    let payload: IndexingStatusPayload;
    try {
      payload = JSON.parse(raw) as IndexingStatusPayload;
    } catch {
      return reply.status(200).send({
        status: "PENDING" as IndexingStatus,
        progress: 0,
        totalActions: 0,
        lastIndexedAt: null,
      });
    }

    return reply.status(200).send({
      status: payload.status as IndexingStatus,
      progress: payload.progress,
      totalActions: payload.totalActions,
      lastIndexedAt: payload.lastIndexedAt ? new Date(payload.lastIndexedAt) : null,
    });
  });
}
