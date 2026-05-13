/**
 * ogIndexer — core indexing logic for 0G Chain.
 *
 * Fetches transactions for a wallet address using the viem ogClient,
 * classifies each transaction, and upserts into the wallet_actions table
 * via Drizzle ORM (deduplicating by tx_hash using ON CONFLICT DO NOTHING).
 *
 * Requirements: 2.2, 2.4, 2.5, 2.8
 */

import { ogClient } from "../../lib/viemClient.js";
import { db } from "../../plugins/db.js";
import { walletActions } from "../../db/schema.js";
import { classifyTransaction } from "./classifier.js";
import type { Address, Hash } from "viem";

export interface IndexingProgress {
  indexed: number;
  total: number;
  percent: number;
}

export interface IndexTransactionResult {
  txHash: string;
  actionType: string;
  isNew: boolean;
}

/**
 * Retry an async operation up to `maxRetries` times with exponential backoff.
 * Delays: 1s, 2s, 4s.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

const BLOCK_PAGE_SIZE = 2000n;

export async function fetchWalletTransactionHashes(
  walletAddress: Address,
  fromBlock: bigint,
  toBlock: bigint,
  onProgress?: (progress: IndexingProgress) => void
): Promise<Hash[]> {
  try {
    const url = `https://chainscan-galileo.0g.ai/open/api?module=account&action=txlist&address=${walletAddress}&startblock=${fromBlock}&endblock=${toBlock}&sort=asc`;
    
    // Log intent
    console.log(`Indexer: Fetching via 0G API...`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`0G API responded with status: ${response.status}`);
    }

    const data = await response.json() as any;
    
    // Etherscan-compatible APIs return status "1" for OK and "0" for No transactions found
    if (data.status !== "1" && data.message !== "No transactions found") {
      console.warn(`0G API returned non-success status: ${data.status} - ${data.message}`);
    }

    const txs = Array.isArray(data.result) ? data.result : [];
    const hashes = txs.map((tx: any) => tx.hash as Hash);

    if (onProgress) {
      // 100% complete instantly!
      onProgress({ indexed: hashes.length, total: hashes.length, percent: 100 });
    }
    
    console.log(`Indexer: API fetch complete... found ${hashes.length} txs instantly`);
    
    return hashes;
  } catch (error) {
    console.error("Indexer: Failed to fetch from 0G API", error);
    // Fallback to empty array to prevent complete crash
    return [];
  }
}

export async function indexTransaction(
  txHash: Hash,
  userId: string,
  walletAddress: string,
  chainId: number
): Promise<IndexTransactionResult> {
  const [rawTx, receipt] = await withRetry(() =>
    Promise.all([
      ogClient.getTransaction({ hash: txHash }),
      ogClient.getTransactionReceipt({ hash: txHash }),
    ])
  );

  const block = await withRetry(() =>
    ogClient.getBlock({ blockNumber: rawTx.blockNumber! })
  );

  const actionType = classifyTransaction({
    hash: rawTx.hash,
    from: rawTx.from,
    to: rawTx.to ?? null,
    input: rawTx.input ?? null,
    value: rawTx.value?.toString() ?? null,
    protocol: null,
    functionName: null,
  });

  const result = await db
    .insert(walletActions)
    .values({
      userId,
      walletAddress: walletAddress.toLowerCase(),
      chainId,
      txHash: rawTx.hash,
      actionType,
      protocol: null,
      assetIn: null,
      assetOut: null,
      amountUsd: null,
      gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
      blockNumber: Number(rawTx.blockNumber!),
      blockTimestamp: new Date(Number(block.timestamp) * 1000),
      rawData: {
        hash: rawTx.hash,
        from: rawTx.from,
        to: rawTx.to,
        value: rawTx.value?.toString(),
        input: rawTx.input,
        blockNumber: rawTx.blockNumber?.toString(),
        nonce: rawTx.nonce,
      },
    })
    .onConflictDoNothing({ target: walletActions.txHash })
    .returning({ id: walletActions.id });

  return { txHash: rawTx.hash, actionType, isNew: result.length > 0 };
}

export interface FullIndexOptions {
  userId: string;
  walletAddress: Address;
  chainId: number;
  onProgress?: (progress: IndexingProgress) => void;
}

export async function fullIndex(options: FullIndexOptions): Promise<{
  total: number;
  newRecords: number;
}> {
  const { userId, walletAddress, chainId, onProgress } = options;
  const currentBlock = await withRetry(() => ogClient.getBlockNumber());
  // Default to the last 50,000 blocks to prevent stalling, unless INDEXER_START_BLOCK is set
  const startBlock = process.env.INDEXER_START_BLOCK 
    ? BigInt(process.env.INDEXER_START_BLOCK) 
    : (currentBlock > 200000n ? currentBlock - 200000n : 0n);

  const hashes = await fetchWalletTransactionHashes(walletAddress, startBlock, currentBlock, onProgress);

  let newRecords = 0;
  for (let i = 0; i < hashes.length; i++) {
    const result = await indexTransaction(hashes[i], userId, walletAddress, chainId);
    if (result.isNew) newRecords++;
    if (onProgress) {
      const percent = Math.round(((i + 1) / hashes.length) * 100);
      onProgress({ indexed: i + 1, total: hashes.length, percent });
    }
  }

  return { total: hashes.length, newRecords };
}

export interface IncrementalIndexOptions {
  userId: string;
  walletAddress: Address;
  chainId: number;
  fromBlock: bigint;
  onProgress?: (progress: IndexingProgress) => void;
}

export async function incrementalIndex(options: IncrementalIndexOptions): Promise<{
  total: number;
  newRecords: number;
  latestBlock: bigint;
}> {
  const { userId, walletAddress, chainId, fromBlock, onProgress } = options;
  const currentBlock = await withRetry(() => ogClient.getBlockNumber());

  if (fromBlock > currentBlock) {
    return { total: 0, newRecords: 0, latestBlock: currentBlock };
  }

  const hashes = await fetchWalletTransactionHashes(walletAddress, fromBlock, currentBlock, onProgress);

  let newRecords = 0;
  for (const hash of hashes) {
    const result = await indexTransaction(hash, userId, walletAddress, chainId);
    if (result.isNew) newRecords++;
  }

  return { total: hashes.length, newRecords, latestBlock: currentBlock };
}
