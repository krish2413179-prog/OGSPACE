/**
 * ModelTrainingWorker — BullMQ worker that trains behavioral models.
 *
 * Job data: { userId, walletAddress }
 *
 * Process:
 * 1. Fetch all wallet_actions for the user from PostgreSQL.
 * 2. Return 422 (reject job) if fewer than 10 actions exist.
 * 3. Call ML Microservice via mlClient (HTTP).
 * 4. Upload model weights to 0G Storage (mock: Redis for hackathon).
 * 5. Persist new behavior_models record with incremented version.
 *
 * Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 9.1, 9.6
 */

import { Queue, Worker, type Job } from "bullmq";
import { eq, desc } from "drizzle-orm";
import { db } from "../plugins/db.js";
import { redis, bullmqConnection } from "../plugins/redis.js";
import { walletActions, behaviorModels } from "../db/schema.js";
import { trainModel, type WalletActionProto } from "../services/ml/mlClient.js";
import { uploadModel } from "../services/og/storage.js";
import { logger } from "../lib/logger.js";

// ── Job data types ─────────────────────────────────────────────────────────────

export interface TrainModelJobData {
  userId: string;
  walletAddress: string;
}

export interface TrainModelJobResult {
  modelId: string;
  version: number;
  ogStorageCid: string;
  performanceScore: number;
}

// ── Minimum actions threshold ─────────────────────────────────────────────────

export const MIN_ACTIONS_REQUIRED = 10;

// ── Queue ─────────────────────────────────────────────────────────────────────

export const modelTrainingQueue = new Queue<TrainModelJobData>("model-training", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 1, // Training failures should not auto-retry (data-dependent)
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  },
});

// ── Worker processor ──────────────────────────────────────────────────────────

export async function processTrainModelJob(
  job: Job<TrainModelJobData>
): Promise<TrainModelJobResult> {
  const { userId, walletAddress } = job.data;

  logger.info({ jobId: job.id, userId, walletAddress }, "ModelTrainingWorker: starting");

  // ── Step 1: Fetch wallet actions ──────────────────────────────────────────

  const actions = await db
    .select()
    .from(walletActions)
    .where(eq(walletActions.userId, userId))
    .orderBy(walletActions.blockTimestamp);

  logger.info(
    { jobId: job.id, userId, actionCount: actions.length },
    "ModelTrainingWorker: fetched wallet actions"
  );

  // ── Step 2: Enforce minimum action threshold ──────────────────────────────

  if (actions.length < MIN_ACTIONS_REQUIRED) {
    const msg = `Insufficient wallet actions: ${actions.length} found, ${MIN_ACTIONS_REQUIRED} required.`;
    logger.warn({ jobId: job.id, userId, actionCount: actions.length }, msg);
    // Throw an unrecoverable error so BullMQ marks the job as failed
    const err = new Error(msg);
    (err as Error & { statusCode: number }).statusCode = 422;
    throw err;
  }

  // ── Step 3: Determine next model version ─────────────────────────────────

  const [latestModel] = await db
    .select({ version: behaviorModels.version })
    .from(behaviorModels)
    .where(eq(behaviorModels.userId, userId))
    .orderBy(desc(behaviorModels.version))
    .limit(1);

  const nextVersion = latestModel ? latestModel.version + 1 : 1;

  // ── Step 4: Call ML Microservice ──────────────────────────────────────────

  const protoActions: WalletActionProto[] = actions.map((a) => ({
    tx_hash: a.txHash,
    action_type: a.actionType,
    protocol: a.protocol ?? "",
    asset_in: a.assetIn ?? "",
    asset_out: a.assetOut ?? "",
    amount_usd: a.amountUsd ? parseFloat(a.amountUsd) : 0,
    block_timestamp: a.blockTimestamp
      ? Math.floor(a.blockTimestamp.getTime() / 1000)
      : 0,
    block_number: a.blockNumber,
  }));

  logger.info(
    { jobId: job.id, userId, walletAddress, version: nextVersion },
    "ModelTrainingWorker: calling ML Microservice"
  );

  const mlResponse = await trainModel({
    wallet_address: walletAddress,
    actions: protoActions,
    model_version: nextVersion,
  });

  logger.info(
    {
      jobId: job.id,
      userId,
      modelId: mlResponse.model_id,
      performanceScore: mlResponse.performance_score,
      version: mlResponse.model_version,
    },
    "ModelTrainingWorker: ML Microservice responded"
  );

  // ── Step 5: Upload model weights to 0G Storage ────────────────────────────

  const dimensionScores = computeDimensionScores(mlResponse.vector);

  const modelMetadata: Record<string, unknown> = {
    modelId: mlResponse.model_id,
    version: nextVersion,
    walletAddress,
    performanceScore: mlResponse.performance_score,
    dimensions: mlResponse.dimensions,
    dimensionScores,
    totalActionsTrained: actions.length,
    trainedAt: new Date().toISOString(),
  };

  const ogStorageCid = await uploadModel(
    walletAddress,
    mlResponse.vector,
    modelMetadata
  );

  logger.info(
    { jobId: job.id, userId, ogStorageCid },
    "ModelTrainingWorker: model uploaded to 0G Storage"
  );

  // ── Step 6: Mark previous models as not current ───────────────────────────

  // (best-effort; ignore errors)
  try {
    await db
      .update(behaviorModels)
      .set({ isCurrent: false })
      .where(eq(behaviorModels.userId, userId));
  } catch (err) {
    logger.warn({ err, userId }, "ModelTrainingWorker: failed to unset isCurrent on old models");
  }

  // ── Step 7: Persist behavior_models record ────────────────────────────────

  const [newModel] = await db
    .insert(behaviorModels)
    .values({
      userId,
      walletAddress,
      version: nextVersion,
      ogStorageCid,
      performanceScore: mlResponse.performance_score.toFixed(2),
      vectorDimensions: 512,
      totalActionsTrained: actions.length,
      modelMetadata,
      isCurrent: true,
    })
    .returning();

  if (!newModel) {
    throw new Error("ModelTrainingWorker: failed to persist behavior_models record");
  }

  logger.info(
    {
      jobId: job.id,
      userId,
      modelId: newModel.id,
      version: nextVersion,
      ogStorageCid,
      performanceScore: mlResponse.performance_score,
    },
    "ModelTrainingWorker: completed successfully"
  );

  return {
    modelId: newModel.id,
    version: nextVersion,
    ogStorageCid,
    performanceScore: mlResponse.performance_score,
  };
}

// ── Dimension score computation ───────────────────────────────────────────────

/**
 * Convert the raw 512-dim float32 vector into per-segment scalar scores (0–100).
 *
 * Segments:
 *   Risk Profile:          dims [0:64]
 *   Timing Patterns:       dims [64:128]
 *   Protocol Preferences:  dims [128:256]
 *   Asset Behavior:        dims [256:384]
 *   Decision Context:      dims [384:512]
 */
function computeDimensionScores(vectorBuffer: Buffer): {
  riskProfile: number;
  timingPatterns: number;
  protocolPreferences: number;
  assetBehavior: number;
  decisionContext: number;
  compositeScore: number;
} {
  // Decode little-endian float32 values
  const floats: number[] = [];
  for (let i = 0; i < vectorBuffer.length; i += 4) {
    floats.push(vectorBuffer.readFloatLE(i));
  }

  const segmentMean = (start: number, end: number): number => {
    const slice = floats.slice(start, end);
    if (slice.length === 0) return 50;
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    // Sigmoid-like normalisation to [0, 100]
    return Math.min(100, Math.max(0, (mean + 1) * 50));
  };

  const riskProfile = segmentMean(0, 64);
  const timingPatterns = segmentMean(64, 128);
  const protocolPreferences = segmentMean(128, 256);
  const assetBehavior = segmentMean(256, 384);
  const decisionContext = segmentMean(384, 512);

  // Weighted composite (equal weights for now)
  const compositeScore =
    (riskProfile + timingPatterns + protocolPreferences + assetBehavior + decisionContext) / 5;

  return {
    riskProfile,
    timingPatterns,
    protocolPreferences,
    assetBehavior,
    decisionContext,
    compositeScore,
  };
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createModelTrainingWorker(): Worker<TrainModelJobData, TrainModelJobResult> {
  const worker = new Worker<TrainModelJobData, TrainModelJobResult>(
    "model-training",
    processTrainModelJob,
    {
      connection: bullmqConnection,
      concurrency: 2,
    }
  );

  worker.on("completed", (job, result) =>
    logger.info(
      { jobId: job.id, modelId: result.modelId, version: result.version },
      "ModelTrainingWorker: job completed"
    )
  );

  worker.on("failed", (job, err) =>
    logger.error({ jobId: job?.id, err }, "ModelTrainingWorker: job failed")
  );

  worker.on("error", (err) =>
    logger.error({ err }, "ModelTrainingWorker: worker error")
  );

  return worker;
}
