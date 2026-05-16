/**
 * AgentExecuteWorker and AgentSuggestWorker — BullMQ workers for the agent
 * decision loop.
 *
 * Requirements: 4.5, 4.6, 4.7, 5.1–5.8, 9.3, 10.1–10.4
 */

import { Queue, Worker, type Job } from "bullmq";
import { eq, desc, and } from "drizzle-orm";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { db } from "../plugins/db.js";
import { redis, bullmqConnection } from "../plugins/redis.js";
import { agentDeployments, agentActions, behaviorModels } from "../db/schema.js";
import { evaluate as guardianEvaluate } from "../services/agent/guardian.js";
import { runInference } from "../services/agent/ogCompute.js";
import { logger } from "../lib/logger.js";
import type { BroadcastFn } from "./indexWorker.js";
import type { AgentMode } from "../types/index.js";

const MIN_CONFIDENCE_SCORE = 0.6;
const SUGGEST_INTERVAL_MS = 15 * 60 * 1000;

export interface AgentJobData {
  agentId: string;
  ownerAddress: string;
  mode: AgentMode;
}

export const agentSuggestQueue = new Queue<AgentJobData>("agent-suggest", {
  connection: bullmqConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: { count: 200 }, removeOnFail: { count: 100 } },
});

async function fetchMarketContext(ownerAddress: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  let ethPriceUsd = 3000;
  let gasPriceGwei = 20;
  let portfolioValueUsd = 0;

  try {
    const priceRaw = await redis.get("market:eth:price");
    if (priceRaw) ethPriceUsd = parseFloat(priceRaw);
    const gasRaw = await redis.get("market:gas:gwei");
    if (gasRaw) gasPriceGwei = parseFloat(gasRaw);
    const portfolioRaw = await redis.get(`portfolio:${ownerAddress.toLowerCase()}`);
    if (portfolioRaw) {
      const p = JSON.parse(portfolioRaw) as { totalValueUsd?: number };
      portfolioValueUsd = p.totalValueUsd ?? 0;
    }
  } catch (err) {
    logger.warn({ err }, "AgentWorker: failed to load market data");
  }

  return { timestamp, ethPriceUsd, gasPriceGwei, portfolioValueUsd };
}

async function getDailySpendUsd(agentId: string): Promise<number> {
  try {
    const spendRaw = await redis.get(`agent:daily_spend:${agentId}`);
    if (spendRaw) return parseFloat(spendRaw);
  } catch (err) {
    logger.warn({ err, agentId }, "AgentWorker: failed to get daily spend");
  }
  return 0;
}

async function incrementDailySpend(agentId: string, amountUsd: number): Promise<void> {
  const key = `agent:daily_spend:${agentId}`;
  try {
    const current = await redis.get(key);
    const newTotal = (current ? parseFloat(current) : 0) + amountUsd;
    await redis.set(key, newTotal.toString(), "EX", 24 * 60 * 60);
  } catch (err) {
    logger.warn({ err, agentId }, "AgentWorker: failed to update daily spend");
  }
}


// ── Real on-chain transaction via AgentRegistry ───────────────────────────────


// ── Real 0G Storage decision log upload ──────────────────────────────────────

async function uploadDecisionLog(
  agentId: string,
  log: Record<string, unknown>
): Promise<string> {
  const cid = await uploadMetadata(`agent:decision:${agentId}:${Date.now()}`, log);
  // Still cache in Redis for performance
  await redis.set(`og:decision:${cid}`, JSON.stringify(log), "EX", 30 * 24 * 60 * 60);
  return cid;
}

export async function runDecisionCycle(
  agentId: string,
  ownerAddress: string,
  mode: AgentMode,
  broadcast: BroadcastFn
): Promise<void> {
  logger.info({ agentId, ownerAddress, mode }, "AgentWorker: starting decision cycle");

  const marketContext = await fetchMarketContext(ownerAddress);

  // Fetch agent to see if it has a specific model to follow
  const [agent] = await db
    .select({ activeModelId: agentDeployments.activeModelId })
    .from(agentDeployments)
    .where(eq(agentDeployments.id, agentId))
    .limit(1);

  let latestModel;
  if (agent?.activeModelId) {
    [latestModel] = await db
      .select({ ogStorageCid: behaviorModels.ogStorageCid })
      .from(behaviorModels)
      .where(eq(behaviorModels.id, agent.activeModelId))
      .limit(1);
  } else {
    [latestModel] = await db
      .select({ ogStorageCid: behaviorModels.ogStorageCid })
      .from(behaviorModels)
      .where(and(
        eq(behaviorModels.walletAddress, ownerAddress.toLowerCase()),
        eq(behaviorModels.modelType, "own")
      ))
      .orderBy(desc(behaviorModels.version))
      .limit(1);
  }

  if (!latestModel) {
    logger.warn({ agentId, activeModelId: agent?.activeModelId }, "AgentWorker: no model found, skipping cycle");
    return;
  }

  let recommendation;
  try {
    recommendation = await runInference(latestModel.ogStorageCid, {
      timestamp: marketContext.timestamp,
      ethPriceUsd: marketContext.ethPriceUsd,
      gasPriceGwei: marketContext.gasPriceGwei,
      signals: { portfolioValueUsd: marketContext.portfolioValueUsd },
    });
  } catch (err) {
    logger.error({ err, agentId }, "AgentWorker: 0G Compute failed, skipping cycle");
    return;
  }

  // Skip if confidence < 0.6
  if (recommendation.confidenceScore < MIN_CONFIDENCE_SCORE) {
    await db.insert(agentActions).values({
      agentId,
      actionType: recommendation.actionType,
      decisionReasoning: `Skipped: confidence ${recommendation.confidenceScore} below threshold ${MIN_CONFIDENCE_SCORE}.`,
      confidenceScore: recommendation.confidenceScore.toFixed(3),
      wasExecuted: false,
      guardianBlocked: false,
    });
    return;
  }

  // OBSERVE mode — record only
  if (mode === "OBSERVE") {
    await db.insert(agentActions).values({
      agentId,
      actionType: recommendation.actionType,
      decisionReasoning: `[OBSERVE] ${recommendation.reasoning}`,
      confidenceScore: recommendation.confidenceScore.toFixed(3),
      wasExecuted: false,
      guardianBlocked: false,
    });
    return;
  }

  // Guardian evaluation
  const dailySpendUsd = await getDailySpendUsd(agentId);
  const guardianResult = guardianEvaluate(
    { actionType: recommendation.actionType, protocol: recommendation.protocol, amountUsd: recommendation.amountUsd, isContractVerified: true, isHoneypot: false },
    dailySpendUsd
  );

  if (!guardianResult.allowed) {
    await db.insert(agentActions).values({
      agentId,
      actionType: recommendation.actionType,
      decisionReasoning: recommendation.reasoning,
      confidenceScore: recommendation.confidenceScore.toFixed(3),
      wasExecuted: false,
      guardianBlocked: true,
    });
    broadcast(ownerAddress, "agent:blocked", { agentId, reason: guardianResult.reason, violatedRule: guardianResult.violatedRule });
    return;
  }

  // SUGGEST mode
  if (mode === "SUGGEST") {
    await db.insert(agentActions).values({
      agentId,
      actionType: recommendation.actionType,
      decisionReasoning: recommendation.reasoning,
      confidenceScore: recommendation.confidenceScore.toFixed(3),
      wasExecuted: false,
      guardianBlocked: false,
    });
    broadcast(ownerAddress, "agent:suggestion", {
      agentId,
      action: { actionType: recommendation.actionType, protocol: recommendation.protocol, asset: recommendation.asset, amountUsd: recommendation.amountUsd },
      confidence: recommendation.confidenceScore,
      reasoning: recommendation.reasoning,
    });
    return;
  }
}


export function createAgentSuggestProcessor(broadcast: BroadcastFn) {
  return async function processAgentSuggestJob(job: Job<AgentJobData>): Promise<void> {
    const { agentId, ownerAddress, mode } = job.data;
    const [agent] = await db.select({ isActive: agentDeployments.isActive, mode: agentDeployments.mode }).from(agentDeployments).where(eq(agentDeployments.id, agentId)).limit(1);
    if (!agent?.isActive) return;
    await runDecisionCycle(agentId, ownerAddress, (agent.mode as AgentMode) ?? mode, broadcast);
  };
}


export function createAgentSuggestWorker(broadcast: BroadcastFn): Worker<AgentJobData> {
  const worker = new Worker<AgentJobData>("agent-suggest", createAgentSuggestProcessor(broadcast), { connection: bullmqConnection, concurrency: 10 });
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "AgentSuggestWorker: job failed"));
  return worker;
}


export async function scheduleSuggestAgent(agentId: string, ownerAddress: string): Promise<void> {
  await agentSuggestQueue.add("agent:suggest", { agentId, ownerAddress, mode: "SUGGEST" }, { jobId: `suggest:${agentId}`, repeat: { every: SUGGEST_INTERVAL_MS } });
}

export async function unscheduleAgent(agentId: string): Promise<void> {
  try { await agentSuggestQueue.removeRepeatable("agent:suggest", { every: SUGGEST_INTERVAL_MS, jobId: `suggest:${agentId}` }); } catch { /* ignore */ }
}
