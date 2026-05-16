/**
 * Soul NFT routes
 *
 * POST /nfts/mint/prepare          — JWT protected; prepare mint tx params
 * POST /nfts/sync                  — internal; sync Transfer event to DB
 * GET  /nfts/:tokenId              — public; get NFT by tokenId
 * GET  /nfts/owned/:address        — public; get all NFTs owned by address
 * POST /nfts/:tokenId/rental-config — JWT protected; update rental config
 *
 * Requirements: 6.1, 6.5, 6.7
 */

import type { FastifyInstance } from "fastify";
import { eq, desc } from "drizzle-orm";
import { db } from "../plugins/db.js";
import { behaviorModels, soulNfts } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { uploadMetadata } from "../services/og/storage.js";
import { logger } from "../lib/logger.js";
import type { JwtPayload } from "../types/index.js";

export async function nftRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /nfts/mint/prepare
   * Assembles mint transaction parameters for the frontend to sign.
   */
  app.post("/mint/prepare", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress, userId } = request.user as JwtPayload;

    const [latestModel] = await db
      .select()
      .from(behaviorModels)
      .where(eq(behaviorModels.walletAddress, walletAddress.toLowerCase()))
      .orderBy(desc(behaviorModels.version))
      .limit(1);

    if (!latestModel) {
      return reply.status(422).send({
        error: "Unprocessable Entity",
        message: "No behavioral model found. Train a model before minting.",
      });
    }

    // Check if Soul NFT already minted for this wallet
    const [existing] = await db
      .select({ tokenId: soulNfts.tokenId })
      .from(soulNfts)
      .where(eq(soulNfts.walletAddress, walletAddress.toLowerCase()))
      .limit(1);

    if (existing) {
      return reply.status(409).send({
        error: "Conflict",
        message: "A Soul NFT has already been minted for this wallet.",
        tokenId: existing.tokenId,
      });
    }

    // Build Soul NFT metadata
    const nftMetadata = {
      name: `MirrorMind Soul — ${walletAddress.slice(0, 8)}`,
      description: "A behavioral fingerprint of on-chain decision patterns, stored permanently on 0G Storage.",
      walletAddress,
      modelVersion: latestModel.version,
      performanceScore: latestModel.performanceScore ? parseFloat(latestModel.performanceScore) : 0,
      totalActionsTrained: latestModel.totalActionsTrained ?? 0,
      vectorDimensions: latestModel.vectorDimensions ?? 512,
      modelMetadata: latestModel.modelMetadata,
      createdAt: new Date().toISOString(),
    };

    // Upload metadata to 0G Storage
    const { rootHash: ogStorageCid } = await uploadMetadata(`soul:${walletAddress}`, nftMetadata);

    logger.info({ walletAddress, ogStorageCid, modelVersion: latestModel.version }, "NFT mint prepared");

    return reply.status(200).send({
      ogStorageCid,
      performanceScore: latestModel.performanceScore ? parseFloat(latestModel.performanceScore) : 0,
      totalActionsTrained: latestModel.totalActionsTrained ?? 0,
      modelMetadata: latestModel.modelMetadata,
      modelVersion: latestModel.version,
      modelId: latestModel.id,
      // These are the params the frontend passes to SoulNFT_Contract.mint()
      mintParams: {
        modelCID: ogStorageCid,
        totalActions: latestModel.totalActionsTrained ?? 0,
        trainingTimestamp: Math.floor((latestModel.createdAt?.getTime() ?? Date.now()) / 1000),
        performanceScore: Math.round((latestModel.performanceScore ? parseFloat(latestModel.performanceScore) : 0) * 100),
        isRentable: false,
        rentalPricePerDay: "0",
        isForSale: false,
        salePrice: "0",
      },
    });
  });

  /**
   * POST /nfts/sync
   * Internal endpoint to sync a Transfer event from SoulNFT_Contract to the DB.
   * In production this would be called by the on-chain event listener.
   */
  app.post("/sync", async (request, reply) => {
    const body = request.body as {
      tokenId: number;
      walletAddress: string;
      mintTx?: string;
      ogStorageCid: string;
      modelId?: string;
      performanceScore?: number;
      totalActionsTrained?: number;
      isRentable?: boolean;
      rentalPricePerDay?: string;
      isForSale?: boolean;
      salePrice?: string;
    };

    if (!body.tokenId || !body.walletAddress || !body.ogStorageCid) {
      return reply.status(400).send({ error: "Bad Request", message: "tokenId, walletAddress, and ogStorageCid are required." });
    }

    const [upserted] = await db
      .insert(soulNfts)
      .values({
        tokenId: body.tokenId,
        walletAddress: body.walletAddress.toLowerCase(),
        modelId: body.modelId ?? null,
        ogStorageCid: body.ogStorageCid,
        mintTx: body.mintTx ?? null,
        performanceScore: body.performanceScore != null ? body.performanceScore.toFixed(2) : null,
        totalActionsTrained: body.totalActionsTrained ?? null,
        isRentable: body.isRentable ?? false,
        rentalPricePerDay: body.rentalPricePerDay ?? null,
        isForSale: body.isForSale ?? false,
        salePrice: body.salePrice ?? null,
        timesRented: 0,
      })
      .onConflictDoUpdate({
        target: soulNfts.tokenId,
        set: {
          ogStorageCid: body.ogStorageCid,
          mintTx: body.mintTx ?? null,
          performanceScore: body.performanceScore != null ? body.performanceScore.toFixed(2) : undefined,
          totalActionsTrained: body.totalActionsTrained ?? undefined,
          isRentable: body.isRentable ?? undefined,
          rentalPricePerDay: body.rentalPricePerDay ?? undefined,
          isForSale: body.isForSale ?? undefined,
          salePrice: body.salePrice ?? undefined,
        },
      })
      .returning();

    logger.info({ tokenId: body.tokenId, walletAddress: body.walletAddress }, "NFT synced to DB");
    return reply.status(200).send(upserted);
  });

  /**
   * GET /nfts/:tokenId
   */
  app.get("/:tokenId", async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const id = parseInt(tokenId, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Bad Request", message: "Invalid tokenId." });

    const [nft] = await db.select().from(soulNfts).where(eq(soulNfts.tokenId, id)).limit(1);
    if (!nft) return reply.status(404).send({ error: "Not Found", message: `Soul NFT #${id} not found.` });

    return reply.status(200).send(nft);
  });

  /**
   * GET /nfts/owned/:address
   */
  app.get("/owned/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    const nfts = await db.select().from(soulNfts).where(eq(soulNfts.walletAddress, address.toLowerCase()));
    return reply.status(200).send({ address, nfts, total: nfts.length });
  });

  /**
   * POST /nfts/:tokenId/rental-config
   */
  app.post("/:tokenId/rental-config", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const { tokenId } = request.params as { tokenId: string };
    const id = parseInt(tokenId, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Bad Request", message: "Invalid tokenId." });

    const body = request.body as { isRentable?: boolean; rentalPricePerDay?: string; isForSale?: boolean; salePrice?: string };

    const [nft] = await db.select({ walletAddress: soulNfts.walletAddress }).from(soulNfts).where(eq(soulNfts.tokenId, id)).limit(1);
    if (!nft) return reply.status(404).send({ error: "Not Found", message: `Soul NFT #${id} not found.` });
    if (nft.walletAddress !== walletAddress.toLowerCase()) return reply.status(403).send({ error: "Forbidden", message: "You do not own this Soul NFT." });

    const [updated] = await db
      .update(soulNfts)
      .set({
        isRentable: body.isRentable ?? undefined,
        rentalPricePerDay: body.rentalPricePerDay ?? undefined,
        isForSale: body.isForSale ?? undefined,
        salePrice: body.salePrice ?? undefined,
      })
      .where(eq(soulNfts.tokenId, id))
      .returning();

    return reply.status(200).send(updated);
  });

  /**
   * POST /nfts/admin/list
   * Admin-only: update listing status for any NFT using ADMIN_SECRET.
   * Used to sync already-minted NFTs whose listing status was not set correctly.
   */
  app.post("/admin/list", async (request, reply) => {
    const adminSecret = process.env.ADMIN_SECRET ?? "mirrormind-admin-2024";
    const authHeader = request.headers["x-admin-secret"];
    if (authHeader !== adminSecret) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const body = request.body as {
      tokenId: number;
      isRentable?: boolean;
      rentalPricePerDay?: string;
      isForSale?: boolean;
      salePrice?: string;
      performanceScore?: number;
      totalActionsTrained?: number;
    };

    if (!body.tokenId) {
      return reply.status(400).send({ error: "tokenId is required" });
    }

    const [updated] = await db
      .update(soulNfts)
      .set({
        isRentable: body.isRentable ?? undefined,
        rentalPricePerDay: body.rentalPricePerDay ?? undefined,
        isForSale: body.isForSale ?? undefined,
        salePrice: body.salePrice ?? undefined,
        performanceScore: body.performanceScore != null ? body.performanceScore.toFixed(2) : undefined,
        totalActionsTrained: body.totalActionsTrained ?? undefined,
      })
      .where(eq(soulNfts.tokenId, body.tokenId))
      .returning();

    if (!updated) return reply.status(404).send({ error: "NFT not found" });
    logger.info({ tokenId: body.tokenId }, "Admin: NFT listing status updated");
    return reply.status(200).send(updated);
  });
}
