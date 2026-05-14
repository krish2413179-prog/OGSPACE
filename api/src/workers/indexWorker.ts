/**
 * IndexingWorker — BullMQ worker that processes indexing jobs.
 *
 * Job types:
 *   - `index:full`        — full historical indexing for a wallet
 *   - `index:incremental` — index new blocks for tracked wallets
 *
 * WebSocket events emitted:
 *   - `indexing:status`   — { userId, status, progress } during indexing
 *   - `indexing:complete` — { userId, walletAddress, totalActions } on finish
 *
 * Requirements: 2.1, 2.6, 2.7, 2.8
 */

import { Queue, Worker, type Job } from "bullmq";
import { redis, bullmqConnection } from "../plugins/redis.js";
import { fullIndex, incrementalIndex } from "../services/indexer/ogIndexer.js";
import { modelTrainingQueue } from "./trainWorker.js";
import { logger } from "../lib/logger.js";
import type { Address } from "viem";

export interface FullIndexJobData {
  type: "index:full";
  userId: string;
  walletAddress: string;
  chainId: number;
}

export interface IncrementalIndexJobData {
  type: "index:incremental";
  userId: string;
  walletAddress: string;
  chainId: number;
  fromBlock: string;
}

export type IndexingJobData = FullIndexJobData | IncrementalIndexJobData;

export const INDEXING_STATUS_KEY = (userId: string) => `indexing:status:${userId}`;

export interface IndexingStatusPayload {
  status: "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED";
  progress: number;
  totalActions: number;
  lastIndexedAt: string | null;
}

export type BroadcastFn = (userId: string, event: string, payload: unknown) => void;

export const indexingQueue = new Queue<IndexingJobData>("indexing", {
  connection: bullmqConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

export function createIndexingProcessor(broadcast: BroadcastFn) {
  return async function processIndexingJob(job: Job<IndexingJobData>): Promise<void> {
    const { userId, walletAddress, chainId } = job.data;
    const statusKey = INDEXING_STATUS_KEY(userId);

    logger.info({ userId, walletAddress, jobId: job.id }, "Indexing worker: starting job processing");

    try {
      logger.info({ userId }, "Indexing worker: connecting to 0G Chain...");
      if (job.data.type === "index:full") {
        await redis.set(
          statusKey,
          JSON.stringify({ status: "IN_PROGRESS", progress: 0, totalActions: 0, lastIndexedAt: null })
        );
        broadcast(userId, "indexing:status", { userId, status: "IN_PROGRESS", progress: 0 });

        const result = await fullIndex({
          userId,
          walletAddress: walletAddress as Address,
          chainId,
          onProgress: async ({ percent, indexed }) => {
            await job.updateProgress(percent);
            await redis.set(
              statusKey,
              JSON.stringify({ status: "IN_PROGRESS", progress: percent, totalActions: indexed, lastIndexedAt: null })
            );
            broadcast(userId, "indexing:status", { userId, status: "IN_PROGRESS", progress: percent });
          },
        });

        await redis.set(
          statusKey,
          JSON.stringify({ status: "COMPLETE", progress: 100, totalActions: result.total, lastIndexedAt: new Date().toISOString() })
        );
        broadcast(userId, "indexing:complete", { userId, walletAddress, totalActions: result.total, newRecords: result.newRecords });
        logger.info({ userId, walletAddress, total: result.total }, "Full indexing complete");

        // ── Auto-trigger model retraining after full index ─────────────────
        if (result.total > 0) {
          const jobId = `train:${userId}:auto:full:${Date.now()}`;
          await modelTrainingQueue.add("train:auto", { userId, walletAddress }, { jobId, removeOnComplete: { count: 20 }, removeOnFail: { count: 10 } });
          logger.info({ userId, walletAddress, totalActions: result.total }, "Auto-triggered model retraining after full index");
          broadcast(userId, "model:retraining", { userId, walletAddress, trigger: "full_index", totalActions: result.total });
        }
      } else {
        const fromBlock = BigInt(job.data.fromBlock);
        const result = await incrementalIndex({ userId, walletAddress: walletAddress as Address, chainId, fromBlock });

        const currentRaw = await redis.get(statusKey);
        const current: IndexingStatusPayload = currentRaw
          ? (JSON.parse(currentRaw) as IndexingStatusPayload)
          : { status: "COMPLETE", progress: 100, totalActions: 0, lastIndexedAt: null };

        await redis.set(
          statusKey,
          JSON.stringify({ status: "COMPLETE", progress: 100, totalActions: current.totalActions + result.newRecords, lastIndexedAt: new Date().toISOString() })
        );

        if (result.newRecords > 0) {
          broadcast(userId, "indexing:complete", { userId, walletAddress, totalActions: current.totalActions + result.newRecords, newRecords: result.newRecords });

          // ── Auto-trigger model retraining when new transactions found ──
          const jobId = `train:${userId}:auto:incremental:${Date.now()}`;
          await modelTrainingQueue.add("train:auto", { userId, walletAddress }, { jobId, removeOnComplete: { count: 20 }, removeOnFail: { count: 10 } });
          logger.info({ userId, walletAddress, newRecords: result.newRecords }, "Auto-triggered model retraining after new transactions indexed");
          broadcast(userId, "model:retraining", { userId, walletAddress, trigger: "new_transactions", newRecords: result.newRecords });
        }
      }
    } catch (err) {
      await redis.set(statusKey, JSON.stringify({ status: "FAILED", progress: 0, totalActions: 0, lastIndexedAt: null }));
      broadcast(userId, "indexing:status", { userId, status: "FAILED", progress: 0 });
      logger.error({ err, userId, walletAddress }, "Indexing job failed");
      throw err;
    }
  };
}

export function createIndexingWorker(broadcast: BroadcastFn): Worker<IndexingJobData> {
  const processor = createIndexingProcessor(broadcast);
  const worker = new Worker<IndexingJobData>("indexing", processor, {
    connection: bullmqConnection,
    concurrency: 5,
    lockDuration: 60000, // Increase lock duration to 60s
    stalledInterval: 30000, // Check for stalls every 30s
  });

  worker.on("completed", (job) => logger.info({ jobId: job.id }, "Indexing job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "Indexing job failed"));
  worker.on("error", (err) => logger.error({ err }, "Indexing worker error"));

  return worker;
}

const INCREMENTAL_POLL_INTERVAL_MS = 30_000;

export function startIncrementalPolling(
  getTrackedWallets: () => Promise<Array<{ userId: string; walletAddress: string; chainId: number; lastBlock: bigint }>>
): NodeJS.Timeout {
  const schedule = async () => {
    try {
      const wallets = await getTrackedWallets();
      for (const wallet of wallets) {
        await indexingQueue.add(
          "index:incremental",
          { type: "index:incremental", userId: wallet.userId, walletAddress: wallet.walletAddress, chainId: wallet.chainId, fromBlock: wallet.lastBlock.toString() },
          { jobId: `incremental:${wallet.userId}:${Date.now()}` }
        );
      }
    } catch (err) {
      logger.error({ err }, "Failed to schedule incremental indexing jobs");
    }
  };

  void schedule();
  return setInterval(() => void schedule(), INCREMENTAL_POLL_INTERVAL_MS);
}
