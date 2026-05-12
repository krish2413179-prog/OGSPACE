/**
 * Model routes
 *
 * POST /models/train   (JWT protected)
 *   Enqueue a ModelTrainingWorker job for the authenticated user.
 *   Returns 422 immediately if fewer than 10 wallet actions exist.
 *
 * GET  /models/current (JWT protected)
 *   Return the latest behavior_models record for the authenticated user.
 *
 * Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 9.1, 9.6
 */

import type { FastifyInstance } from "fastify";
import { eq, desc, count } from "drizzle-orm";
import { db } from "../plugins/db.js";
import { walletActions, behaviorModels } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { MIN_ACTIONS_REQUIRED } from "../workers/trainWorker.js";
import { logger } from "../lib/logger.js";
import type { JwtPayload } from "../types/index.js";

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /models/train
   *
   * Checks the wallet action count first.  If fewer than MIN_ACTIONS_REQUIRED
   * exist, returns 422 without enqueuing a job.  Otherwise enqueues a
   * ModelTrainingWorker job and returns 202 Accepted.
   */
  app.post(
    "/train",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId, walletAddress } = request.user as JwtPayload;

      // Count existing wallet actions for this user
      const [row] = await db
        .select({ total: count() })
        .from(walletActions)
        .where(eq(walletActions.userId, userId));

      const actionCount = Number(row?.total ?? 0);

      if (actionCount < MIN_ACTIONS_REQUIRED) {
        return reply.status(422).send({
          error: "Unprocessable Entity",
          message: `Insufficient wallet actions for model training. Found ${actionCount}, need at least ${MIN_ACTIONS_REQUIRED}.`,
          actionCount,
          required: MIN_ACTIONS_REQUIRED,
        });
      }

      // Enqueue the training job (dynamic import to avoid blocking startup)
      const { modelTrainingQueue } = await import("../workers/trainWorker.js");
      const job = await modelTrainingQueue.add(
        "train-model",
        { userId, walletAddress },
        {
          jobId: `train:${userId}:${Date.now()}`,
        }
      );

      logger.info(
        { jobId: job.id, userId, walletAddress, actionCount },
        "Model training job enqueued"
      );

      return reply.status(202).send({
        message: "Model training job enqueued.",
        jobId: job.id,
        actionCount,
      });
    }
  );

  /**
   * GET /models/current
   *
   * Returns the most recent behavior_models record for the authenticated user.
   * Returns 404 if no model has been trained yet.
   */
  app.get(
    "/current",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as JwtPayload;

      const [model] = await db
        .select()
        .from(behaviorModels)
        .where(eq(behaviorModels.userId, userId))
        .orderBy(desc(behaviorModels.version))
        .limit(1);

      if (!model) {
        return reply.status(404).send({
          error: "Not Found",
          message: "No behavioral model found for this user. Train a model first.",
        });
      }

      return reply.status(200).send({
        id: model.id,
        userId: model.userId,
        walletAddress: model.walletAddress,
        version: model.version,
        ogStorageCid: model.ogStorageCid,
        performanceScore: model.performanceScore
          ? parseFloat(model.performanceScore)
          : null,
        vectorDimensions: model.vectorDimensions,
        totalActionsTrained: model.totalActionsTrained,
        modelMetadata: model.modelMetadata,
        isCurrent: model.isCurrent,
        createdAt: model.createdAt,
      });
    }
  );
}
