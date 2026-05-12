/**
 * 0G Storage client — hackathon implementation.
 *
 * For the hackathon, model weights and metadata are stored in Redis
 * instead of the real 0G Storage network.  Each upload returns a
 * deterministic mock CID so the rest of the system can treat it as
 * an opaque content identifier.
 *
 * Key patterns:
 *   og:model:{walletAddress}:{version}   — binary model weights
 *   og:meta:{cid}                        — metadata JSON
 *   og:cid:{cid}                         — raw blob by CID
 *
 * Requirements: 9.1, 9.6
 */

import { createHash } from "crypto";
import { redis } from "../../plugins/redis.js";
import { logger } from "../../lib/logger.js";

// TTL for stored objects (30 days in seconds)
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

// ── CID generation ────────────────────────────────────────────────────────────

/**
 * Generate a deterministic mock CID from content bytes.
 * Format: "bafymock{sha256hex[0:48]}" — resembles a real CIDv1 base32 string.
 */
function generateMockCid(content: Buffer | string): string {
  const buf = typeof content === "string" ? Buffer.from(content, "utf8") : content;
  const hash = createHash("sha256").update(buf).digest("hex");
  return `bafymock${hash.slice(0, 48)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload model weights binary blob to storage.
 *
 * @param walletAddress - Owner wallet address.
 * @param modelBuffer   - Raw binary model weights (512 float32 LE bytes).
 * @param metadata      - Arbitrary metadata object stored alongside the weights.
 * @returns Mock CID string.
 */
export async function uploadModel(
  walletAddress: string,
  modelBuffer: Buffer,
  metadata: Record<string, unknown>
): Promise<string> {
  const cid = generateMockCid(modelBuffer);
  const version = (metadata.version as number | undefined) ?? 1;

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
      JSON.stringify({ ...metadata, walletAddress, cid }),
      "EX",
      STORAGE_TTL_SECONDS
    );

    await pipeline.exec();
  }, `uploadModel(${walletAddress}, v${version})`);

  logger.info({ walletAddress, version, cid }, "0G Storage: model uploaded");
  return cid;
}

/**
 * Upload NFT / model metadata JSON to storage.
 *
 * @param tokenId  - Token ID (or any unique identifier for the metadata).
 * @param metadata - Metadata object to store.
 * @returns Mock CID string.
 */
export async function uploadMetadata(
  tokenId: string | number,
  metadata: Record<string, unknown>
): Promise<string> {
  const json = JSON.stringify(metadata);
  const cid = generateMockCid(json);

  await withUploadRetry(async () => {
    const pipeline = redis.pipeline();
    pipeline.set(`og:cid:${cid}`, json, "EX", STORAGE_TTL_SECONDS);
    pipeline.set(`og:nft:${tokenId}`, cid, "EX", STORAGE_TTL_SECONDS);
    await pipeline.exec();
  }, `uploadMetadata(tokenId=${tokenId})`);

  logger.info({ tokenId, cid }, "0G Storage: metadata uploaded");
  return cid;
}

/**
 * Download a model blob by CID.
 *
 * @param cid - The CID returned by a previous uploadModel call.
 * @returns Buffer containing the raw model weights, or null if not found.
 */
export async function downloadModel(cid: string): Promise<Buffer | null> {
  const raw = await redis.get(`og:cid:${cid}`);
  if (!raw) {
    logger.warn({ cid }, "0G Storage: CID not found");
    return null;
  }
  return Buffer.from(raw, "base64");
}
