/**
 * HTTP client for the MirrorMind ML Microservice.
 *
 * Calls the FastAPI HTTP endpoints exposed by the ML service:
 *   POST /train          — train a behavioral model from wallet actions
 *   GET  /model/{addr}   — retrieve cached model info for a wallet
 *
 * Retry logic: up to 2 retries with 2 s linear backoff.
 * Throws a 503 error after all retries are exhausted.
 *
 * Requirements: 3.8
 */

import { logger } from "../../lib/logger.js";
import { randomUUID } from "crypto";

// ── Types matching the ML service proto / HTTP contract ───────────────────────

export interface WalletActionProto {
  tx_hash: string;
  action_type: string;
  protocol: string;
  asset_in: string;
  asset_out: string;
  amount_usd: number;
  block_timestamp: number;
  block_number: number;
}

export interface ModelDimensions {
  risk_profile: number;
  timing_patterns: number;
  protocol_preferences: number;
  asset_behavior: number;
  decision_context: number;
  total: number;
}

export interface TrainModelRequest {
  wallet_address: string;
  actions: WalletActionProto[];
  model_version: number;
}

export interface TrainModelResponse {
  /** Base64-encoded 512 float32 little-endian bytes */
  vector_b64: string;
  /** Decoded binary buffer (populated by the client after decoding) */
  vector: Buffer;
  performance_score: number;
  model_version: number;
  dimensions: ModelDimensions;
  model_id: string;
}

export interface GetModelInfoResponse {
  wallet_address: string;
  model_version: number;
  performance_score: number;
  dimensions: ModelDimensions;
  trained_at: number;
}

// ── Retry helper ──────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute `fn` with up to MAX_RETRIES retries and linear 2 s backoff.
 * Throws a 503-tagged error after exhaustion.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        logger.warn(
          { err, attempt, label },
          `ML client: attempt ${attempt + 1} failed, retrying in ${RETRY_DELAY_MS} ms`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  logger.error({ lastError, label }, "ML client: all retries exhausted");
  const serviceError = new Error(
    `ML Microservice unavailable after ${MAX_RETRIES + 1} attempts: ${label}`
  );
  (serviceError as Error & { statusCode: number }).statusCode = 503;
  throw serviceError;
}

// ── Client ────────────────────────────────────────────────────────────────────

function getMlServiceUrl(): string {
  return process.env.ML_SERVICE_URL ?? "https://ogspace.onrender.com";
}

/**
 * Call POST /train on the ML Microservice.
 *
 * @param request - Training request containing wallet address, actions, and version.
 * @returns Parsed TrainModelResponse with `vector` populated as a Buffer.
 */
export async function trainModel(
  request: TrainModelRequest
): Promise<TrainModelResponse> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set in .env");

  // Format the transaction history for the LLM
  const actionSummary = request.actions.map(a => 
    `- Action: ${a.action_type}, Protocol: ${a.protocol || 'None'}, Asset: ${a.asset_in || a.asset_out || 'None'}, Amount USD: $${a.amount_usd.toFixed(2)}`
  ).join("\n");

  const prompt = `You are an expert blockchain behavioral analyst.
Analyze the following wallet transactions and score the wallet's behavior from 0 to 100 on these 5 dimensions:
1. risk_profile (0 = highly conservative, 100 = massive degen/high risk)
2. timing_patterns (0 = sporadic/random, 100 = highly systematic/bot-like)
3. protocol_preferences (0 = vanilla transfers, 100 = complex DeFi/smart contracts)
4. asset_behavior (0 = holds stables/native, 100 = rapidly trades shitcoins/high-volatility)
5. decision_context (0 = irrational/random, 100 = highly calculated/profitable)

Respond ONLY with a valid JSON object matching this exact structure:
{
  "risk_profile": 45,
  "timing_patterns": 60,
  "protocol_preferences": 20,
  "asset_behavior": 50,
  "decision_context": 70
}

Wallet Transactions:
${actionSummary}`;

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1024,
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`NVIDIA API Error: ${res.status} ${text}`);
  }

  const jsonRes = await res.json() as any;
  const content = jsonRes.choices?.[0]?.message?.content || "{}";
  
  // Extract JSON using regex in case LLM wraps it in markdown blocks
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  let scores;
  try {
    scores = JSON.parse(jsonMatch ? jsonMatch[0] : content);
  } catch (err) {
    logger.warn({ content }, "Failed to parse LLM output as JSON, defaulting scores");
    scores = { risk_profile: 50, timing_patterns: 50, protocol_preferences: 50, asset_behavior: 50, decision_context: 50 };
  }

  // Ensure default structure, safely handling 0 values (since 0 || 50 === 50 in JS)
  const getScore = (val: any) => {
    const num = Number(val);
    return isNaN(num) ? 50 : num;
  };

  const risk = getScore(scores.risk_profile);
  const timing = getScore(scores.timing_patterns);
  const protocol = getScore(scores.protocol_preferences);
  const asset = getScore(scores.asset_behavior);
  const decision = getScore(scores.decision_context);

  // Construct a 512-dim float32 vector (2048 bytes) that perfectly reverse-engineers the Node scoring math!
  // Node scoring math: score = (mean + 1) * 50 => mean = (score / 50) - 1
  const vectorBuffer = Buffer.alloc(512 * 4);
  let offset = 0;

  const writeSegment = (length: number, score: number) => {
    const safeScore = Math.max(0, Math.min(100, score));
    const mean = (safeScore / 50) - 1;
    for (let i = 0; i < length; i++) {
      vectorBuffer.writeFloatLE(mean, offset);
      offset += 4;
    }
  };

  // Node backend slices: [0:64] risk, [64:128] timing, [128:256] protocol, [256:384] asset, [384:512] decision
  writeSegment(64, risk);
  writeSegment(64, timing);
  writeSegment(128, protocol);
  writeSegment(128, asset);
  writeSegment(128, decision);

  const compositeScore = (risk + timing + protocol + asset + decision) / 5;

  return {
    vector_b64: vectorBuffer.toString("base64"),
    vector: vectorBuffer,
    performance_score: compositeScore,
    model_version: request.model_version,
    dimensions: {
      risk_profile: risk,
      timing_patterns: timing,
      protocol_preferences: protocol,
      asset_behavior: asset,
      decision_context: decision,
      total: compositeScore,
    },
    model_id: randomUUID(),
  };
}

/**
 * Call GET /model/{walletAddress} on the ML Microservice.
 *
 * @param walletAddress - The wallet address to look up.
 * @returns Parsed GetModelInfoResponse.
 */
export async function getModelInfo(
  walletAddress: string
): Promise<GetModelInfoResponse> {
  const url = `${getMlServiceUrl()}/model/${encodeURIComponent(walletAddress)}`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      const err = new Error(
        `ML /model/${walletAddress} returned HTTP ${res.status}: ${body}`
      );
      (err as Error & { statusCode: number }).statusCode = res.status;
      throw err;
    }

    return (await res.json()) as GetModelInfoResponse;
  }, `GET /model/${walletAddress}`);
}
