/**
 * Marketplace routes
 *
 * GET  /marketplace/listings           — public; browse active listings
 * GET  /marketplace/listings/:tokenId  — public; single listing detail
 * POST /marketplace/rent               — JWT protected; record rental
 * POST /marketplace/buy                — JWT protected; record purchase
 * GET  /marketplace/leases/:address    — public; active leases for address
 *
 * Requirements: 7.5, 8.7, 13.2
 */

import type { FastifyInstance } from "fastify";
import { eq, desc, or, and, sql } from "drizzle-orm";
import { db } from "../plugins/db.js";
import { soulNfts, behaviorModels, marketplaceTransactions } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import { logger } from "../lib/logger.js";
import type { JwtPayload } from "../types/index.js";

export async function marketplaceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /marketplace/listings
   * Returns all active listings (isRentable=true OR isForSale=true).
   * Supports sortBy: performanceScore (default desc), rentalPricePerDay (asc), salePrice (asc).
   */
  app.get("/listings", async (request, reply) => {
    const query = request.query as { sortBy?: string; order?: string };
    const sortBy = query.sortBy ?? "performanceScore";
    const order = query.order ?? "desc";

    const listings = await db
      .select({
        tokenId: soulNfts.tokenId,
        walletAddress: soulNfts.walletAddress,
        ogStorageCid: soulNfts.ogStorageCid,
        performanceScore: soulNfts.performanceScore,
        totalActionsTrained: soulNfts.totalActionsTrained,
        isRentable: soulNfts.isRentable,
        rentalPricePerDay: soulNfts.rentalPricePerDay,
        isForSale: soulNfts.isForSale,
        salePrice: soulNfts.salePrice,
        timesRented: soulNfts.timesRented,
        createdAt: soulNfts.createdAt,
        modelMetadata: behaviorModels.modelMetadata,
        modelVersion: behaviorModels.version,
      })
      .from(soulNfts)
      .leftJoin(behaviorModels, eq(soulNfts.modelId, behaviorModels.id))
      .where(or(eq(soulNfts.isRentable, true), eq(soulNfts.isForSale, true)));

    // Sort in-memory (simple for hackathon scale)
    const sorted = listings.sort((a, b) => {
      if (sortBy === "rentalPricePerDay") {
        const aVal = parseFloat(a.rentalPricePerDay ?? "0");
        const bVal = parseFloat(b.rentalPricePerDay ?? "0");
        return order === "asc" ? aVal - bVal : bVal - aVal;
      }
      if (sortBy === "salePrice") {
        const aVal = parseFloat(a.salePrice ?? "0");
        const bVal = parseFloat(b.salePrice ?? "0");
        return order === "asc" ? aVal - bVal : bVal - aVal;
      }
      // Default: performanceScore desc
      const aVal = parseFloat(a.performanceScore ?? "0");
      const bVal = parseFloat(b.performanceScore ?? "0");
      return order === "asc" ? aVal - bVal : bVal - aVal;
    });

    return reply.status(200).send({ listings: sorted, total: sorted.length });
  });

  /**
   * GET /marketplace/listings/:tokenId
   */
  app.get("/listings/:tokenId", async (request, reply) => {
    const { tokenId } = request.params as { tokenId: string };
    const id = parseInt(tokenId, 10);
    if (isNaN(id)) return reply.status(400).send({ error: "Bad Request", message: "Invalid tokenId." });

    const [listing] = await db
      .select({
        tokenId: soulNfts.tokenId,
        walletAddress: soulNfts.walletAddress,
        ogStorageCid: soulNfts.ogStorageCid,
        performanceScore: soulNfts.performanceScore,
        totalActionsTrained: soulNfts.totalActionsTrained,
        isRentable: soulNfts.isRentable,
        rentalPricePerDay: soulNfts.rentalPricePerDay,
        isForSale: soulNfts.isForSale,
        salePrice: soulNfts.salePrice,
        timesRented: soulNfts.timesRented,
        createdAt: soulNfts.createdAt,
        modelMetadata: behaviorModels.modelMetadata,
        modelVersion: behaviorModels.version,
      })
      .from(soulNfts)
      .leftJoin(behaviorModels, eq(soulNfts.modelId, behaviorModels.id))
      .where(eq(soulNfts.tokenId, id))
      .limit(1);

    if (!listing) return reply.status(404).send({ error: "Not Found", message: `Soul NFT #${id} not found.` });

    return reply.status(200).send(listing);
  });

  /**
   * POST /marketplace/rent
   * Records a RENTAL_START transaction after on-chain confirmation.
   */
  app.post("/rent", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const body = request.body as { tokenId: number; durationDays: number; txHash?: string; priceEth?: string };

    if (!body.tokenId || !body.durationDays) {
      return reply.status(400).send({ error: "Bad Request", message: "tokenId and durationDays are required." });
    }

    const [nft] = await db.select({ isRentable: soulNfts.isRentable, walletAddress: soulNfts.walletAddress, rentalPricePerDay: soulNfts.rentalPricePerDay }).from(soulNfts).where(eq(soulNfts.tokenId, body.tokenId)).limit(1);
    if (!nft) return reply.status(404).send({ error: "Not Found", message: `Soul NFT #${body.tokenId} not found.` });
    if (!nft.isRentable) return reply.status(422).send({ error: "Unprocessable Entity", message: "This Soul NFT is not listed for rental." });

    // Record marketplace transaction
    const [tx] = await db
      .insert(marketplaceTransactions)
      .values({
        tokenId: body.tokenId,
        transactionType: "RENTAL_START",
        sellerAddress: nft.walletAddress,
        buyerAddress: walletAddress.toLowerCase(),
        priceEth: body.priceEth ?? null,
        rentalDurationDays: body.durationDays,
        txHash: body.txHash ?? null,
      })
      .returning();

    // Increment times_rented
    await db
      .update(soulNfts)
      .set({ timesRented: sql`${soulNfts.timesRented} + 1` })
      .where(eq(soulNfts.tokenId, body.tokenId));

    logger.info({ tokenId: body.tokenId, renter: walletAddress, durationDays: body.durationDays }, "Marketplace: rental recorded");
    return reply.status(201).send({ message: "Rental recorded.", transaction: tx });
  });

  /**
   * POST /marketplace/buy
   * Records a SALE transaction after on-chain confirmation.
   */
  app.post("/buy", { preHandler: authenticate }, async (request, reply) => {
    const { walletAddress } = request.user as JwtPayload;
    const body = request.body as { tokenId: number; txHash?: string; priceEth?: string };

    if (!body.tokenId) return reply.status(400).send({ error: "Bad Request", message: "tokenId is required." });

    const [nft] = await db.select({ isForSale: soulNfts.isForSale, walletAddress: soulNfts.walletAddress, salePrice: soulNfts.salePrice }).from(soulNfts).where(eq(soulNfts.tokenId, body.tokenId)).limit(1);
    if (!nft) return reply.status(404).send({ error: "Not Found", message: `Soul NFT #${body.tokenId} not found.` });
    if (!nft.isForSale) return reply.status(422).send({ error: "Unprocessable Entity", message: "This Soul NFT is not listed for sale." });

    // Record marketplace transaction
    const [tx] = await db
      .insert(marketplaceTransactions)
      .values({
        tokenId: body.tokenId,
        transactionType: "SALE",
        sellerAddress: nft.walletAddress,
        buyerAddress: walletAddress.toLowerCase(),
        priceEth: body.priceEth ?? nft.salePrice ?? null,
        txHash: body.txHash ?? null,
      })
      .returning();

    // Transfer ownership in DB
    await db
      .update(soulNfts)
      .set({ walletAddress: walletAddress.toLowerCase(), isForSale: false, salePrice: null })
      .where(eq(soulNfts.tokenId, body.tokenId));

    logger.info({ tokenId: body.tokenId, buyer: walletAddress }, "Marketplace: sale recorded");
    return reply.status(201).send({ message: "Purchase recorded.", transaction: tx });
  });

  /**
   * GET /marketplace/leases/:address
   * Returns all RENTAL_START transactions for a given renter address.
   */
  app.get("/leases/:address", async (request, reply) => {
    const { address } = request.params as { address: string };

    const leases = await db
      .select()
      .from(marketplaceTransactions)
      .where(
        and(
          eq(marketplaceTransactions.buyerAddress, address.toLowerCase()),
          eq(marketplaceTransactions.transactionType, "RENTAL_START")
        )
      )
      .orderBy(desc(marketplaceTransactions.createdAt));

    return reply.status(200).send({ address, leases, total: leases.length });
  });
}
