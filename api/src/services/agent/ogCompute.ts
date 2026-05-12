/**
 * 0G Compute mock client — hackathon implementation.
 *
 * Generates a deterministic ActionRecommendation from model metadata
 * stored in Redis, simulating the 0G Compute API with a 30-second timeout.
 *
 * Requirements: 5.1, 10.1, 10.2, 10.4
 */

import { redis } from "../../plugins/redis.js";
import { logger } from "../../lib/logger.js";
import type { ActionType } from "../../types/index.js";

export interface MarketContext {
  timestamp: number;
  ethPriceUsd?: number;
  gasPriceGwei?: number;
  signals?: Record<string, unknown>;
}

export interface ActionRecommendation {
  actionType: ActionType;
  protocol: string;
  asset: string;
  amountUsd: number;
  confidenceScore: number;
  reasoning: string;
  rawResponse?: unknown;
}

const COMPUTE_TIMEOUT_MS = 30_000;

const ACTION_POOL: Array<{ actionType: ActionType; protocol: string; asset: string }> = [
  { actionType: "TRADE", protocol: "Uniswap", asset: "ETH" },
  { actionType: "DEFI_POSITION", protocol: "Aave", asset: "USDC" },
  { actionType: "LIQUIDITY_MOVE", protocol: "Curve", asset: "DAI" },
  { actionType: "TRADE", protocol: "1inch", asset: "WBTC" },
  { actionType: "DEFI_POSITION", protocol: "Compound", asset: "ETH" },
  { actionType: "GOVERNANCE_VOTE", protocol: "Uniswap", asset: "UNI" },
  { actionType: "NFT_PURCHASE", protocol: "OpenSea", asset: "ETH" },
  { actionType: "TRADE", protocol: "Uniswap", asset: "USDC" },
];

function deterministicHash(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`0G Compute timeout after ${ms}ms for ${label}`));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); }
    );
  });
}

export async function runInference(
  modelCid: string,
  context: MarketContext
): Promise<ActionRecommendation> {
  return withTimeout(_runInferenceMock(modelCid, context), COMPUTE_TIMEOUT_MS, `runInference(${modelCid})`);
}

async function _runInferenceMock(
  modelCid: string,
  context: MarketContext
): Promise<ActionRecommendation> {
  const latencyMs = 50 + (deterministicHash(modelCid + context.timestamp) % 150);
  await new Promise((resolve) => setTimeout(resolve, latencyMs));

  let performanceScore = 50;
  let totalActions = 100;

  try {
    const metaRaw = await redis.get(`og:meta:${modelCid}`);
    if (metaRaw) {
      const meta = JSON.parse(metaRaw) as Record<string, unknown>;
      if (typeof meta.performanceScore === "number") performanceScore = meta.performanceScore;
      if (typeof meta.totalActionsTrained === "number") totalActions = meta.totalActionsTrained;
    }
  } catch (err) {
    logger.warn({ err, modelCid }, "0G Compute mock: failed to load model metadata");
  }

  const timeBucket = Math.floor(context.timestamp / 900);
  const hash = deterministicHash(`${modelCid}:${timeBucket}`);
  const actionEntry = ACTION_POOL[hash % ACTION_POOL.length]!;

  const baseConfidence = 0.45 + (performanceScore / 100) * 0.5;
  const jitter = ((hash % 100) / 1000) - 0.05;
  const confidenceScore = Math.min(0.99, Math.max(0.0, baseConfidence + jitter));

  const baseAmount = 50 + Math.min(750, totalActions * 2);
  const amountUsd = Math.round(baseAmount * (0.8 + (hash % 40) / 100));

  return {
    actionType: actionEntry.actionType,
    protocol: actionEntry.protocol,
    asset: actionEntry.asset,
    amountUsd,
    confidenceScore: Math.round(confidenceScore * 1000) / 1000,
    reasoning: `Behavioral model (CID: ${modelCid.slice(0, 16)}...) recommends ${actionEntry.actionType} on ${actionEntry.protocol}. Performance score: ${performanceScore.toFixed(1)}/100. Confidence: ${(confidenceScore * 100).toFixed(1)}%.`,
    rawResponse: { modelCid, timeBucket, performanceScore, totalActions, latencyMs },
  };
}
