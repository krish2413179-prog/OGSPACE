/**
 * Agent lifecycle routes
 *
 * POST   /agents/deploy          — deploy agent
 * GET    /agents/current         — current agent status
 * PATCH  /agents/current/mode    — update agent mode
 * DELETE /agents/current         — deactivate agent
 * GET    /agents/current/actions — paginated action log
 *
 * Requirements: 4.1, 4.2, 4.4, 4.8
 */

import { createHash } from "crypto";
import type { FastifyInstance } from "fastify";
import { eq, desc, and, count } from "drizzle-orm";
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { db } from "../plugins/db.js";
import { agentDeployments, agentActions, behaviorModels } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { logger } from "../lib/logger.js";
import type { JwtPayload, AgentMode } from "../types/index.js";

const AGENT_REGISTRY_ABI = parseAbi([
  "function registerAgent(string calldata agentId, uint256 soulTokenId, uint8 mode, address agentAddress) external",
  "function deactivateAgent() external",
  "function updateMode(uint8 newMode) external",
]);

const MODE_MAP: Record<AgentMode, number> = { OBSERVE: 0, SUGGEST: 1, EXECUTE: 2 };

async function callAgentRegistry(
  fnName: "registerAgent" | "deactivateAgent" | "updateMode",
  args: unknown[],
  ownerAddress: string
): Promise<string | null> {
  const privateKey = process.env.BACKEND_PRIVATE_KEY as `0x${string}` | undefined;
  const registryAddress = process.env.AGENT_REGISTRY_ADDRESS as `0x${string}` | undefined;
  const rpcUrl = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";

  if (!privateKey || privateKey === "0x0000000000000000000000000000000000000000000000000000000000000000" || !registryAddress || registryAddress === "0x0000000000000000000000000000000000000000") {
    logger.warn({ ownerAddress, fnName }, "AgentRoutes: contract not configured, skipping on-chain call");
    return null;
  }

  try {
    const account = privateKeyToAccount(privateKey);
    const publicClient = createPublicClient({ transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, transport: http(rpcUrl) });
    const { request } = await publicClient.simulateContract({
      address: registryAddress,
      abi: AGENT_REGISTRY_ABI,
      functionName: fnName as any,
      args: args as any,
      account,
    });
    const txHash = await walletClient.writeContract(request);
    logger.info({ txHash, fnName, ownerAddress }, "AgentRoutes: on-chain tx sent");
    return txHash;
  } catch (err) {
    logger.error({ err, fnName, ownerAddress }, "AgentRoutes: on-chain call failed (non-fatal)");
    return null;
  }
}

async function getUnscheduleAgent(): Promise<(id: string) => Promise<void>> {
  const { unscheduleAgent } = await import("../workers/agentWorker.js");
  return unscheduleAgent;
}

const VALID_MODES: AgentMode[] = ["OBSERVE", "SUGGEST", "EXECUTE"];

function generateMockAgentId(ownerAddress: string): string {
  const hash = createHash("sha256").update(`agent:${ownerAddress}:${Date.now()}`).digest("hex");
  return `0g-agent-${hash.slice(0, 32)}`;
}

async function enqueueDecisionLoop(agentId: string, ownerAddress: string, mode: AgentMode): Promise<void> {
  const { scheduleExecuteAgent, scheduleSuggestAgent, unscheduleAgent } = await import("../workers/agentWorker.js");
  await unscheduleAgent(agentId);
  if (mode === "EXECUTE") await scheduleExecuteAgent(agentId, ownerAddress);
  else if (mode === "SUGGEST") await scheduleSuggestAgent(agentId, ownerAddress);
}

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.post("/deploy", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;

    const [existingAgent] = await db
      .select({ id: agentDeployments.id })
      .from(agentDeployments)
      .where(and(eq(agentDeployments.ownerAddress, walletAddress.toLowerCase()), eq(agentDeployments.isActive, true)))
      .limit(1);

    if (existingAgent) {
      return reply.status(409).send({ error: "Conflict", message: "An active agent already exists. Deactivate it first.", agentId: existingAgent.id });
    }

    const [latestModel] = await db
      .select({ id: behaviorModels.id, ogStorageCid: behaviorModels.ogStorageCid, version: behaviorModels.version })
      .from(behaviorModels)
      .where(eq(behaviorModels.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(behaviorModels.version))
      .limit(1);

    if (!latestModel) {
      return reply.status(422).send({ error: "Unprocessable Entity", message: "No behavioral model found. Train a model before deploying an agent." });
    }

    const body = request.body as { mode?: string; soulTokenId?: number } | undefined;
    const mode: AgentMode = body?.mode && VALID_MODES.includes(body.mode as AgentMode) ? (body.mode as AgentMode) : "OBSERVE";
    const soulTokenId = body?.soulTokenId ?? null;
    const ogAgentId = generateMockAgentId(walletAddress);

    const [newAgent] = await db
      .insert(agentDeployments)
      .values({ ownerAddress: walletAddress.toLowerCase(), ogAgentId, soulTokenId, mode, isActive: true, actionsTaken: 0, deployedAt: new Date() })
      .returning();

    if (!newAgent) return reply.status(500).send({ error: "Internal Server Error", message: "Failed to persist agent record." });

    await enqueueDecisionLoop(newAgent.id, walletAddress, mode);

    // Register agent on-chain in AgentRegistry (non-fatal if fails)
    const backendAddress = process.env.BACKEND_PRIVATE_KEY
      ? (await import("viem/accounts")).privateKeyToAccount(process.env.BACKEND_PRIVATE_KEY as `0x${string}`).address
      : "0x0000000000000000000000000000000000000000" as `0x${string}`;
    const onChainTx = await callAgentRegistry(
      "registerAgent",
      [ogAgentId, BigInt(soulTokenId ?? 0), MODE_MAP[mode], backendAddress],
      walletAddress
    );

    logger.info({ agentId: newAgent.id, walletAddress, mode, onChainTx }, "AgentRoutes: agent deployed");

    return reply.status(201).send({ id: newAgent.id, ownerAddress: newAgent.ownerAddress, ogAgentId: newAgent.ogAgentId, soulTokenId: newAgent.soulTokenId, mode: newAgent.mode, isActive: newAgent.isActive, actionsTaken: newAgent.actionsTaken, deployedAt: newAgent.deployedAt, modelCid: latestModel.ogStorageCid, modelVersion: latestModel.version, onChainTx });
  });

  app.get("/current", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const [agent] = await db.select().from(agentDeployments).where(and(eq(agentDeployments.ownerAddress, walletAddress.toLowerCase()), eq(agentDeployments.isActive, true))).orderBy(desc(agentDeployments.deployedAt)).limit(1);
    if (!agent) return reply.status(404).send({ error: "Not Found", message: "No active agent found." });
    return reply.status(200).send({ id: agent.id, ownerAddress: agent.ownerAddress, ogAgentId: agent.ogAgentId, soulTokenId: agent.soulTokenId, mode: agent.mode, isActive: agent.isActive, actionsTaken: agent.actionsTaken, lastActionAt: agent.lastActionAt, deployedAt: agent.deployedAt });
  });

  app.patch("/current/mode", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const body = request.body as { mode?: string } | undefined;
    const newMode = body?.mode;

    if (!newMode || !VALID_MODES.includes(newMode as AgentMode)) {
      return reply.status(400).send({ error: "Bad Request", message: `Invalid mode. Must be one of: ${VALID_MODES.join(", ")}.` });
    }

    const [agent] = await db.select({ id: agentDeployments.id, mode: agentDeployments.mode }).from(agentDeployments).where(and(eq(agentDeployments.ownerAddress, walletAddress.toLowerCase()), eq(agentDeployments.isActive, true))).limit(1);
    if (!agent) return reply.status(404).send({ error: "Not Found", message: "No active agent found." });
    if (agent.mode === newMode) return reply.status(200).send({ message: `Agent is already in ${newMode} mode.`, mode: newMode });

    const [updated] = await db.update(agentDeployments).set({ mode: newMode }).where(eq(agentDeployments.id, agent.id)).returning();
    await enqueueDecisionLoop(agent.id, walletAddress, newMode as AgentMode);

    return reply.status(200).send({ id: updated?.id, mode: updated?.mode, message: `Agent mode updated to ${newMode}.` });
  });

  app.delete("/current", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const [agent] = await db.select({ id: agentDeployments.id, ogAgentId: agentDeployments.ogAgentId }).from(agentDeployments).where(and(eq(agentDeployments.ownerAddress, walletAddress.toLowerCase()), eq(agentDeployments.isActive, true))).limit(1);
    if (!agent) return reply.status(404).send({ error: "Not Found", message: "No active agent found." });

    const unscheduleAgent = await getUnscheduleAgent();
    await unscheduleAgent(agent.id);
    await db.update(agentDeployments).set({ isActive: false }).where(eq(agentDeployments.id, agent.id));
    logger.info({ agentId: agent.id, walletAddress }, "AgentRoutes: agent deactivated");

    return reply.status(200).send({ message: "Agent deactivated successfully.", agentId: agent.id });
  });

  app.get("/current/actions", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const query = request.query as { page?: string; limit?: string };
    const page = Math.max(1, parseInt(query.page ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? "20", 10)));
    const offset = (page - 1) * limit;

    const [agent] = await db.select({ id: agentDeployments.id }).from(agentDeployments).where(and(eq(agentDeployments.ownerAddress, walletAddress.toLowerCase()), eq(agentDeployments.isActive, true))).limit(1);
    if (!agent) return reply.status(404).send({ error: "Not Found", message: "No active agent found." });

    const [actions, [totalRow]] = await Promise.all([
      db.select().from(agentActions).where(eq(agentActions.agentId, agent.id)).orderBy(desc(agentActions.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(agentActions).where(eq(agentActions.agentId, agent.id)),
    ]);

    const total = Number(totalRow?.total ?? 0);
    return reply.status(200).send({
      agentId: agent.id,
      actions: actions.map((a) => ({ id: a.id, actionType: a.actionType, decisionReasoning: a.decisionReasoning, confidenceScore: a.confidenceScore ? parseFloat(a.confidenceScore) : null, wasExecuted: a.wasExecuted, guardianBlocked: a.guardianBlocked, txHash: a.txHash, ogDecisionCid: a.ogDecisionCid, userOverrode: a.userOverrode, createdAt: a.createdAt })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasNextPage: page < Math.ceil(total / limit), hasPrevPage: page > 1 },
    });
  });
}
