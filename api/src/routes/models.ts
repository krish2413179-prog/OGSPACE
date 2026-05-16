/**
 * Model routes
 *
 * POST /models/train            — enqueue training for own wallet
 * GET  /models/current          — get own current model (modelType="own")
 * POST /models/analyze          — one-time snapshot of any public wallet address
 * GET  /models/snapshots        — list all snapshots this user has created
 * DELETE /models/snapshots/:id  — delete a snapshot
 *
 * Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 9.1, 9.6
 */

import type { FastifyInstance } from "fastify";
import { eq, desc, count, and, ne } from "drizzle-orm";
import { isAddress } from "viem";
import { db } from "../plugins/db.js";
import { walletActions, behaviorModels, users } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { MIN_ACTIONS_REQUIRED } from "../workers/trainWorker.js";
import { fullIndex } from "../services/indexer/ogIndexer.js";
import { trainModel } from "../services/ml/mlClient.js";
import { uploadModel } from "../services/og/storage.js";
import { logger } from "../lib/logger.js";
import type { JwtPayload } from "../types/index.js";
import type { Address } from "viem";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatModel(model: typeof behaviorModels.$inferSelect) {
  return {
    id: model.id,
    userId: model.userId,
    walletAddress: model.walletAddress,
    sourceAddress: model.sourceAddress,
    modelType: model.modelType,
    version: model.version,
    ogStorageCid: model.ogStorageCid,
    ogStorageTx: model.ogStorageTx,
    ogStorageSeq: model.ogStorageSeq,
    performanceScore: model.performanceScore ? parseFloat(model.performanceScore) : null,
    vectorDimensions: model.vectorDimensions,
    totalActionsTrained: model.totalActionsTrained,
    modelMetadata: model.modelMetadata,
    isCurrent: model.isCurrent,
    createdAt: model.createdAt,
  };
}

// Compute dimension scores from modelMetadata the same way trainWorker does
function computeDimensionScores(meta: Record<string, unknown>) {
  const dimScores = meta?.dimensionScores as Record<string, number> | undefined;
  if (dimScores) return dimScores;
  const dims = meta?.dimensions as Record<string, number> | undefined;
  if (!dims) return null;
  return {
    riskProfile: dims.risk_profile ?? 50,
    timingPatterns: dims.timing_patterns ?? 50,
    protocolPreferences: dims.protocol_preferences ?? 50,
    assetBehavior: dims.asset_behavior ?? 50,
    decisionContext: dims.decision_context ?? 50,
    compositeScore: Object.values(dims).reduce((a, b) => a + b, 0) / Object.values(dims).length,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

export async function modelRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /models/train
   * Enqueue a ModelTrainingWorker job for the authenticated user's own wallet.
   */
  app.post("/train", { preHandler: authenticate }, async (request, reply) => {
    const { userId, walletAddress } = request.user as JwtPayload;

    const [row] = await db
      .select({ total: count() })
      .from(walletActions)
      .where(eq(walletActions.userId, userId));

    const actionCount = Number(row?.total ?? 0);

    if (actionCount < MIN_ACTIONS_REQUIRED) {
      return reply.status(422).send({
        error: "Unprocessable Entity",
        message: `Insufficient wallet actions. Found ${actionCount}, need at least ${MIN_ACTIONS_REQUIRED}.`,
        actionCount,
        required: MIN_ACTIONS_REQUIRED,
      });
    }

    const { modelTrainingQueue } = await import("../workers/trainWorker.js");
    const job = await modelTrainingQueue.add(
      "train-model",
      { userId, walletAddress },
      { jobId: `train:${userId}:${Date.now()}` }
    );

    logger.info({ jobId: job.id, userId, walletAddress, actionCount }, "Model training job enqueued");
    return reply.status(202).send({ message: "Model training job enqueued.", jobId: job.id, actionCount });
  });

  /**
   * GET /models/current
   * Returns the most recent OWN model (modelType = "own") for the authenticated user.
   */
  app.get("/current", { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as JwtPayload;

    const [model] = await db
      .select()
      .from(behaviorModels)
      .where(and(
        eq(behaviorModels.userId, userId),
        eq(behaviorModels.modelType, "own")
      ))
      .orderBy(desc(behaviorModels.version))
      .limit(1);

    if (!model) {
      return reply.status(404).send({
        error: "Not Found",
        message: "No behavioral model found for this user. Train a model first.",
      });
    }

    const meta = model.modelMetadata as Record<string, unknown> | null;
    return reply.status(200).send({
      ...formatModel(model),
      dimensionScores: meta ? computeDimensionScores(meta) : null,
    });
  });

  /**
   * POST /models/analyze
   *
   * One-time behavioral analysis of any public wallet address.
   * - Indexes the target wallet's full on-chain history
   * - Runs NVIDIA LLM behavioral profiling
   * - Saves as modelType="snapshot" (never auto-retrains)
   * - Body: { targetAddress: "0x..." }
   */
  app.post("/analyze", { preHandler: authenticate }, async (request, reply) => {
    const { userId, walletAddress: ownerAddress } = request.user as JwtPayload;
    const body = request.body as { targetAddress?: string } | undefined;
    const targetAddress = body?.targetAddress?.trim().toLowerCase();

    if (!targetAddress || !isAddress(targetAddress)) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid wallet address. Must be a valid 0x Ethereum address.",
      });
    }

    // Check for existing snapshot of this address by this user (don't duplicate)
    const [existing] = await db
      .select({ id: behaviorModels.id, ogStorageCid: behaviorModels.ogStorageCid, performanceScore: behaviorModels.performanceScore, modelMetadata: behaviorModels.modelMetadata, totalActionsTrained: behaviorModels.totalActionsTrained, createdAt: behaviorModels.createdAt })
      .from(behaviorModels)
      .where(and(
        eq(behaviorModels.userId, userId),
        eq(behaviorModels.modelType, "snapshot"),
        eq(behaviorModels.sourceAddress, targetAddress)
      ))
      .limit(1);

    if (existing) {
      logger.info({ userId, targetAddress }, "Snapshot already exists, returning cached result");
      const meta = existing.modelMetadata as Record<string, unknown> | null;
      return reply.status(200).send({
        message: "Snapshot already exists for this address.",
        cached: true,
        snapshot: {
          id: existing.id,
          sourceAddress: targetAddress,
          modelType: "snapshot",
          ogStorageCid: existing.ogStorageCid,
          performanceScore: existing.performanceScore ? parseFloat(existing.performanceScore) : null,
          totalActionsTrained: existing.totalActionsTrained,
          dimensionScores: meta ? computeDimensionScores(meta) : null,
          createdAt: existing.createdAt,
        },
      });
    }

    // We need a userId linked to the target address OR reuse the requesting user's userId
    // Since we're analyzing a public address, we store the snapshot under the requesting user's ID
    const chainId = 16602; // 0G Galileo

    logger.info({ userId, targetAddress }, "Starting one-time snapshot analysis");

    // Step 1: Full index of target address (stored under requesting user to avoid creating ghost users)
    // We use a temporary userId namespace trick — store actions tagged to requesting user
    // but with targetAddress as the walletAddress
    let totalActions = 0;
    try {
      const result = await fullIndex({
        userId,
        walletAddress: targetAddress as Address,
        chainId,
        onProgress: async () => {},
      });
      totalActions = result.total;
    } catch (err) {
      logger.error({ err, targetAddress }, "Snapshot: indexing failed");
      return reply.status(502).send({
        error: "Bad Gateway",
        message: "Failed to fetch on-chain data for this address. It may not exist on 0G Galileo testnet.",
      });
    }

    if (totalActions === 0) {
      return reply.status(422).send({
        error: "Unprocessable Entity",
        message: `No transactions found for ${targetAddress} on 0G Galileo testnet. This address has no on-chain history to analyze.`,
        targetAddress,
      });
    }

    // Step 2: Fetch indexed actions for the target wallet
    const actions = await db
      .select()
      .from(walletActions)
      .where(and(
        eq(walletActions.userId, userId),
        eq(walletActions.walletAddress, targetAddress)
      ));

    // Step 3: Run NVIDIA LLM behavioral profiling (same as trainWorker)
    type WalletActionProto = {
      tx_hash: string;
      action_type: string;
      protocol: string;
      asset_in: string;
      asset_out: string;
      amount_usd: number;
      block_timestamp: number;
      block_number: number;
    };

    const protoActions: WalletActionProto[] = actions.map((a) => ({
      tx_hash: a.txHash,
      action_type: a.actionType,
      protocol: a.protocol ?? "",
      asset_in: a.assetIn ?? "",
      asset_out: a.assetOut ?? "",
      amount_usd: a.amountUsd ? parseFloat(a.amountUsd) : 0,
      block_timestamp: a.blockTimestamp ? Math.floor(a.blockTimestamp.getTime() / 1000) : 0,
      block_number: a.blockNumber,
    }));

    let mlResponse;
    try {
      mlResponse = await trainModel({
        wallet_address: targetAddress,
        actions: protoActions,
        model_version: 1,
      });
    } catch (err) {
      logger.error({ err, targetAddress }, "Snapshot: LLM inference failed");
      return reply.status(502).send({
        error: "Bad Gateway",
        message: "Behavioral analysis failed. Please try again.",
      });
    }

    // Step 4: Build dimension scores
    const dimScores = {
      riskProfile: mlResponse.dimensions?.risk_profile ?? 50,
      timingPatterns: mlResponse.dimensions?.timing_patterns ?? 50,
      protocolPreferences: mlResponse.dimensions?.protocol_preferences ?? 50,
      assetBehavior: mlResponse.dimensions?.asset_behavior ?? 50,
      decisionContext: mlResponse.dimensions?.decision_context ?? 50,
      compositeScore: mlResponse.performance_score,
    };

    const modelMetadata: Record<string, unknown> = {
      modelId: mlResponse.model_id,
      version: 1,
      sourceAddress: targetAddress,
      analyzedBy: ownerAddress,
      performanceScore: mlResponse.performance_score,
      dimensions: mlResponse.dimensions,
      dimensionScores: dimScores,
      totalActionsTrained: actions.length,
      isSnapshot: true,
      trainedAt: new Date().toISOString(),
    };

    // Step 5: Upload to 0G Storage
    const { rootHash: ogStorageCid, txHash: ogStorageTx, sequenceId: ogStorageSeq } = await uploadModel(targetAddress, mlResponse.vector, modelMetadata);

    // Step 6: Save as snapshot model (modelType="snapshot", no isCurrent)
    const [newSnapshot] = await db
      .insert(behaviorModels)
      .values({
        userId,
        walletAddress: ownerAddress.toLowerCase(), // belongs to requesting user
        sourceAddress: targetAddress,
        modelType: "snapshot",
        version: 1,
        ogStorageCid,
        ogStorageTx,
        ogStorageSeq,
        performanceScore: mlResponse.performance_score.toFixed(2),
        vectorDimensions: 512,
        totalActionsTrained: actions.length,
        modelMetadata,
        isCurrent: false, // snapshots never become "current"
      })
      .returning();

    logger.info({ userId, targetAddress, ogStorageCid, ogStorageSeq, totalActions }, "Snapshot analysis complete");

    return reply.status(201).send({
      message: "Snapshot analysis complete.",
      cached: false,
      snapshot: {
        id: newSnapshot?.id,
        sourceAddress: targetAddress,
        modelType: "snapshot",
        ogStorageCid,
        performanceScore: mlResponse.performance_score,
        totalActionsTrained: actions.length,
        dimensionScores: dimScores,
        createdAt: newSnapshot?.createdAt,
      },
    });
  });

  /**
   * GET /models/snapshots
   * List all one-time snapshots created by the authenticated user.
   */
  app.get("/snapshots", { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as JwtPayload;

    const snapshots = await db
      .select()
      .from(behaviorModels)
      .where(and(
        eq(behaviorModels.userId, userId),
        ne(behaviorModels.modelType, "own")
      ))
      .orderBy(desc(behaviorModels.createdAt));

    return reply.status(200).send({
      snapshots: snapshots.map((s) => {
        const meta = s.modelMetadata as Record<string, unknown> | null;
        return {
          ...formatModel(s),
          dimensionScores: meta ? computeDimensionScores(meta) : null,
        };
      }),
      total: snapshots.length,
    });
  });

  /**
   * DELETE /models/snapshots/:id
   * Delete a snapshot (soft delete — removes from DB, not from 0G Storage).
   */
  app.delete("/snapshots/:id", { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user as JwtPayload;
    const { id } = request.params as { id: string };

    const [snapshot] = await db
      .select({ id: behaviorModels.id, modelType: behaviorModels.modelType })
      .from(behaviorModels)
      .where(and(
        eq(behaviorModels.id, id),
        eq(behaviorModels.userId, userId),
        ne(behaviorModels.modelType, "own")
      ))
      .limit(1);

    if (!snapshot) {
      return reply.status(404).send({ error: "Not Found", message: "Snapshot not found." });
    }

    await db.delete(behaviorModels).where(eq(behaviorModels.id, id));
    return reply.status(200).send({ message: "Snapshot deleted." });
  });
}
