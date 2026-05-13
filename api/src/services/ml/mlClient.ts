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
  const url = `${getMlServiceUrl()}/train`;

  return withRetry(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "(no body)");
      const err = new Error(
        `ML /train returned HTTP ${res.status}: ${body}`
      );
      (err as Error & { statusCode: number }).statusCode = res.status;
      throw err;
    }

    const json = (await res.json()) as Omit<TrainModelResponse, "vector">;
    const vector = Buffer.from(json.vector_b64, "base64");

    return { ...json, vector };
  }, "POST /train");
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
