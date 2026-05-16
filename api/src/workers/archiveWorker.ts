/**
 * ArchiveWorker — BullMQ worker that compresses and archives weekly action
 * history per wallet to 0G Storage.
 *
 * Requirements: 9.4
 */

import { Queue, Worker, type Job } from "bullmq";
import { eq, and, gte, lt } from "drizzle-orm";
import { createGzip } from "zlib";
import { promisify } from "util";
import { uploadMetadata } from "../services/og/storage.js";
import { db } from "../plugins/db.js";
import { redis, bullmqConnection } from "../plugins/redis.js";
import { walletActions, users } from "../db/schema.js";
import { logger } from "../lib/logger.js";

const ARCHIVE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHIVE_CID_TTL_SECONDS = 365 * 24 * 60 * 60;

const gzip = promisify<Buffer, Buffer>(
  (buf: Buffer, cb: (err: Error | null, result: Buffer) => void) => {
    const gz = createGzip();
    const chunks: Buffer[] = [];
    gz.on("data", (chunk: Buffer) => chunks.push(chunk));
    gz.on("end", () => cb(null, Buffer.concat(chunks)));
    gz.on("error", (err: Error) => cb(err, Buffer.alloc(0)));
    gz.write(buf);
    gz.end();
  }
);

export interface ArchiveJobData {
  walletAddress?: string;
  weekISO?: string;
}

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function getWeekBounds(weekISO: string): [Date, Date] {
  const [yearStr, weekStr] = weekISO.split("-W");
  const year = parseInt(yearStr!, 10);
  const week = parseInt(weekStr!, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime());
  weekStart.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  weekStart.setUTCHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
  return [weekStart, weekEnd];
}

function getPreviousWeekISO(): string {
  return getISOWeek(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
}

async function archiveWallet(walletAddress: string, weekISO: string): Promise<string | null> {
  const [weekStart, weekEnd] = getWeekBounds(weekISO);

  const actions = await db
    .select()
    .from(walletActions)
    .where(and(eq(walletActions.walletAddress, walletAddress.toLowerCase()), gte(walletActions.blockTimestamp, weekStart), lt(walletActions.blockTimestamp, weekEnd)))
    .orderBy(walletActions.blockTimestamp);

  if (actions.length === 0) return null;

  const payload = { walletAddress, weekISO, weekStart: weekStart.toISOString(), weekEnd: weekEnd.toISOString(), totalActions: actions.length, archivedAt: new Date().toISOString(), actions: actions.map((a) => ({ id: a.id, txHash: a.txHash, actionType: a.actionType, protocol: a.protocol, blockNumber: a.blockNumber, blockTimestamp: a.blockTimestamp, chainId: a.chainId })) };

  const jsonBuffer = Buffer.from(JSON.stringify(payload), "utf8");
  const compressed = await gzip(jsonBuffer);

  const { rootHash: cid } = await uploadMetadata(`archive:${walletAddress.toLowerCase()}:${weekISO}`, payload);

  await redis.set(`og:archive:${walletAddress.toLowerCase()}:${weekISO}`, compressed.toString("base64"), "EX", ARCHIVE_CID_TTL_SECONDS);
  await redis.set(`og:cid:${cid}`, compressed.toString("base64"), "EX", ARCHIVE_CID_TTL_SECONDS);
  await redis.set(`archive:cid:${walletAddress.toLowerCase()}:${weekISO}`, cid, "EX", ARCHIVE_CID_TTL_SECONDS);

  logger.info({ walletAddress, weekISO, cid, actionCount: actions.length }, "ArchiveWorker: archive complete");
  return cid;
}

export const archiveQueue = new Queue<ArchiveJobData>("archive", {
  connection: bullmqConnection,
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 }, removeOnComplete: { count: 52 }, removeOnFail: { count: 20 } },
});

export async function processArchiveJob(job: Job<ArchiveJobData>): Promise<void> {
  const weekISO = job.data.weekISO ?? getPreviousWeekISO();

  if (job.data.walletAddress) {
    await archiveWallet(job.data.walletAddress, weekISO);
  } else {
    const allUsers = await db.select({ walletAddress: users.walletAddress }).from(users);
    let archived = 0;
    let skipped = 0;
    for (const user of allUsers) {
      try {
        const cid = await archiveWallet(user.walletAddress, weekISO);
        if (cid) archived++; else skipped++;
      } catch (err) {
        logger.error({ err, walletAddress: user.walletAddress }, "ArchiveWorker: failed to archive wallet");
      }
      await job.updateProgress(Math.round(((archived + skipped) / allUsers.length) * 100));
    }
    logger.info({ weekISO, archived, skipped }, "ArchiveWorker: all wallets processed");
  }
}

export function createArchiveWorker(): Worker<ArchiveJobData> {
  const worker = new Worker<ArchiveJobData>("archive", processArchiveJob, { connection: bullmqConnection, concurrency: 1 });
  worker.on("completed", (job) => logger.info({ jobId: job.id }, "ArchiveWorker: job completed"));
  worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "ArchiveWorker: job failed"));
  return worker;
}

export async function scheduleWeeklyArchive(): Promise<void> {
  await archiveQueue.add("archive:weekly", {}, { jobId: "archive:weekly:recurring", repeat: { every: ARCHIVE_INTERVAL_MS } });
  logger.info("ArchiveWorker: weekly archive job scheduled");
}
