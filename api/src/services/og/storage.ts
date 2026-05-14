/**
 * 0G Storage client — real integration using @0gfoundation/0g-storage-ts-sdk
 *
 * Uploads model weights and metadata directly to the 0G Galileo testnet
 * using MemData (in-memory buffer upload — no temp files required).
 *
 * Falls back to Redis mock CID if the upload fails or config is missing,
 * so the system never breaks in dev/staging environments.
 *
 * Key patterns (Redis fallback):
 *   og:model:{walletAddress}:{version}   — binary model weights
 *   og:meta:{cid}                        — metadata JSON
 *   og:cid:{cid}                         — raw blob by CID
 *
 * Requirements: 9.1, 9.6
 */

import { createHash } from "crypto";
import { redis } from "../../plugins/redis.js";
import { logger } from "../../lib/logger.js";

// TTL for Redis fallback objects (30 days in seconds)
const STORAGE_TTL_SECONDS = 30 * 24 * 60 * 60;

// ── Retry helper (exponential backoff: 1 s, 2 s, 4 s) ────────────────────────

const MAX_UPLOAD_RETRIES = 3;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withUploadRetry<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const delayMs = 1_000 * Math.pow(2, attempt); // 1s, 2s, 4s
      logger.warn(
        { err, attempt, label },
        `0G Storage: attempt ${attempt + 1} failed, retrying in ${delayMs} ms`
      );
      await sleep(delayMs);
    }
  }

  logger.error({ lastError, label }, "0G Storage: all upload retries exhausted");
  throw lastError;
}

// ── CID generation (fallback) ─────────────────────────────────────────────────

function generateMockCid(content: Buffer | string): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const hash = createHash("sha256").update(buf).digest("hex");
  return `bafymock${hash.slice(0, 48)}`;
}

// ── Real 0G Storage upload ────────────────────────────────────────────────────

async function uploadToOgStorage(
  data: Buffer,
  label: string
): Promise<string | null> {
  const privateKey = process.env.BACKEND_PRIVATE_KEY;
  const indexerRpc = process.env.OG_STORAGE_TURBO_RPC ?? process.env.OG_STORAGE_RPC;
  const evmRpc = process.env.OG_RPC_URL;

  if (
    !privateKey ||
    privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000" ||
    !indexerRpc ||
    !evmRpc
  ) {
    logger.warn(
      { label },
      "0G Storage: BACKEND_PRIVATE_KEY not set or RPC missing — falling back to mock CID"
    );
    return null;
  }

  try {
    // Dynamically import SDK + ethers to avoid bundling issues in test envs
    const [{ MemData, Indexer }, { ethers }] = await Promise.all([
      import("@0gfoundation/0g-storage-ts-sdk"),
      import("ethers"),
    ]);

    const provider = new ethers.JsonRpcProvider(evmRpc);
    const signer = new ethers.Wallet(privateKey, provider);
    const indexer = new Indexer(indexerRpc);

    // MemData accepts a raw Buffer — no temp file needed!
    const memData = new MemData(data);
    const [tree, treeErr] = await memData.merkleTree();
    if (treeErr !== null) {
      logger.error({ treeErr, label }, "0G Storage: merkle tree failed");
      return null;
    }

    const rootHash = tree!.rootHash();
    logger.info({ rootHash, label }, "0G Storage: uploading to 0G network...");

    // Cast signer to any to avoid ESM/CJS ethers type conflict
    const [tx, uploadErr] = await indexer.upload(memData, evmRpc, signer as any);
    if (uploadErr !== null) {
      logger.error({ uploadErr, label }, "0G Storage: upload failed");
      return null;
    }

    logger.info({ tx, rootHash, label }, "0G Storage: upload successful");
    // Return the root hash as the CID — this is a real verifiable hash on 0G
    return rootHash ?? null;
  } catch (err) {
    logger.error({ err, label }, "0G Storage: unexpected error during upload");
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload model weights binary blob to 0G Storage.
 *
 * Tries real 0G Storage first. Falls back to Redis mock if unavailable.
 *
 * @param walletAddress - Owner wallet address.
 * @param modelBuffer   - Raw binary model weights (512 float32 LE bytes).
 * @param metadata      - Arbitrary metadata object stored alongside the weights.
 * @returns CID string (real rootHash or mock bafymock* fallback).
 */
export async function uploadModel(
  walletAddress: string,
  modelBuffer: Buffer,
  metadata: Record<string, unknown>
): Promise<string> {
  const version = (metadata.version as number | undefined) ?? 1;
  const label = `uploadModel(${walletAddress}:v${version})`;

  // Wrap everything in metadata JSON for richer on-chain payload
  const fullPayload = Buffer.from(
    JSON.stringify({
      walletAddress: walletAddress.toLowerCase(),
      version,
      uploadedAt: new Date().toISOString(),
      modelWeightsB64: modelBuffer.toString("base64"),
      ...metadata,
    }),
    "utf8"
  );

  // Try real 0G Storage upload
  let cid: string | null = null;
  try {
    cid = await withUploadRetry(
      () => uploadToOgStorage(fullPayload, label),
      label
    );
  } catch {
    cid = null;
  }

  // Fall back to deterministic mock CID if upload fails
  if (!cid) {
    cid = generateMockCid(modelBuffer);
    logger.warn({ cid, walletAddress, version }, "0G Storage: using mock CID fallback");
  }

  // Always cache in Redis for fast lookups by the Agent & API
  await withUploadRetry(async () => {
    const pipeline = redis.pipeline();

    // Store raw weights by CID
    pipeline.set(`og:cid:${cid}`, modelBuffer.toString("base64"), "EX", STORAGE_TTL_SECONDS);

    // Store by wallet + version for easy lookup
    pipeline.set(
      `og:model:${walletAddress.toLowerCase()}:${version}`,
      modelBuffer.toString("base64"),
      "EX",
      STORAGE_TTL_SECONDS
    );

    // Store metadata alongside
    pipeline.set(
      `og:meta:${cid}`,
      JSON.stringify({
        walletAddress: walletAddress.toLowerCase(),
        version,
        uploadedAt: new Date().toISOString(),
        ...metadata,
      }),
      "EX",
      STORAGE_TTL_SECONDS
    );

    await pipeline.exec();
  }, `redis-cache:${label}`);

  logger.info({ walletAddress, version, cid }, "0G Storage: model uploaded");
  return cid;
}

/**
 * Upload arbitrary JSON metadata to 0G Storage (used for Soul NFT minting).
 *
 * @param label    - A descriptive label for logs (e.g., "soul:0xabc...").
 * @param metadata - Arbitrary JSON object to persist on 0G Storage.
 * @returns CID string.
 */
export async function uploadMetadata(
  label: string,
  metadata: Record<string, unknown>
): Promise<string> {
  const payload = Buffer.from(JSON.stringify(metadata), "utf8");
  let cid: string | null = null;
  try {
    cid = await withUploadRetry(() => uploadToOgStorage(payload, label), label);
  } catch {
    cid = null;
  }
  if (!cid) {
    cid = generateMockCid(payload);
    logger.warn({ cid, label }, "0G Storage: uploadMetadata using mock CID fallback");
  }
  await redis.set(`og:meta:${cid}`, JSON.stringify(metadata), "EX", STORAGE_TTL_SECONDS);
  logger.info({ label, cid }, "0G Storage: metadata uploaded");
  return cid;
}

/**
 * Download model weights from Redis cache (populated on upload).
 */
export async function downloadModel(cid: string): Promise<Buffer | null> {
  const b64 = await redis.get(`og:cid:${cid}`);
  if (!b64) return null;
  return Buffer.from(b64, "base64");
}

/**
 * Retrieve model metadata from Redis cache.
 */
export async function getModelMetadata(
  cid: string
): Promise<Record<string, unknown> | null> {
  const raw = await redis.get(`og:meta:${cid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
