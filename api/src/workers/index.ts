/**
 * Worker registry — starts all BullMQ workers at application startup.
 *
 * Workers started here:
 *   IndexingWorker      — concurrency 5
 *   ModelTrainingWorker — concurrency 2
 *   AgentExecuteWorker  — concurrency 10
 *   AgentSuggestWorker  — concurrency 10
 *   ArchiveWorker       — concurrency 1
 *
 * Requirements: 2.1, 4.5, 4.6
 */

import { createIndexingWorker } from "./indexWorker.js";
import { createModelTrainingWorker } from "./trainWorker.js";
import { createAgentExecuteWorker, createAgentSuggestWorker } from "./agentWorker.js";
import { createArchiveWorker, scheduleWeeklyArchive } from "./archiveWorker.js";
import { logger } from "../lib/logger.js";
import type { BroadcastFn } from "./indexWorker.js";

let workersStarted = false;

export function startAllWorkers(broadcast: BroadcastFn): void {
  if (workersStarted) {
    logger.warn("Workers already started — skipping duplicate startup");
    return;
  }
  workersStarted = true;

  // Indexing worker (concurrency 5)
  const indexingWorker = createIndexingWorker(broadcast);
  logger.info("IndexingWorker started (concurrency 5)");

  // Model training worker (concurrency 2)
  const trainingWorker = createModelTrainingWorker();
  logger.info("ModelTrainingWorker started (concurrency 2)");

  // Agent execute worker (concurrency 10)
  const agentExecuteWorker = createAgentExecuteWorker(broadcast);
  logger.info("AgentExecuteWorker started (concurrency 10)");

  // Agent suggest worker (concurrency 10)
  const agentSuggestWorker = createAgentSuggestWorker(broadcast);
  logger.info("AgentSuggestWorker started (concurrency 10)");

  // Archive worker (concurrency 1)
  const archiveWorker = createArchiveWorker();
  logger.info("ArchiveWorker started (concurrency 1)");

  // Schedule weekly archive
  scheduleWeeklyArchive().catch((err) =>
    logger.error({ err }, "Failed to schedule weekly archive")
  );

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down workers…");
    await Promise.allSettled([
      indexingWorker.close(),
      trainingWorker.close(),
      agentExecuteWorker.close(),
      agentSuggestWorker.close(),
      archiveWorker.close(),
    ]);
    logger.info("All workers shut down");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}
