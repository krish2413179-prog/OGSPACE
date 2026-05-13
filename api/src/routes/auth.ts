import type { FastifyInstance } from "fastify";
import { randomBytes } from "crypto";
import { SiweMessage } from "siwe";
import { eq } from "drizzle-orm";
import { db } from "../plugins/db.js";
import { redis } from "../plugins/redis.js";
import { users } from "../db/schema.js";
import { authenticate } from "../middleware/authenticate.js";
import type { JwtPayload } from "../types/index.js";

const NONCE_TTL_SECONDS = 300; // 5 minutes

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/siwe/nonce
   * Generate a cryptographically random nonce and cache it in Redis for 5 min.
   */
  app.post("/siwe/nonce", async (_request, reply) => {
    const nonce = randomBytes(16).toString("hex");
    await redis.set(`siwe:nonce:${nonce}`, "1", "EX", NONCE_TTL_SECONDS);
    return reply.status(200).send({ nonce });
  });

  /**
   * POST /auth/siwe/verify
   * Verify a SIWE message + signature, upsert the user, and return a JWT.
   */
  app.post<{
    Body: { message: string; signature: string };
  }>("/siwe/verify", async (request, reply) => {
    const { message, signature } = request.body ?? {};

    if (!message || !signature) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Both 'message' and 'signature' fields are required.",
      });
    }

    let siweMessage: SiweMessage;
    try {
      siweMessage = new SiweMessage(message);
    } catch {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Invalid SIWE message format.",
      });
    }

    // Verify the signature
    try {
      const verifyResult = await siweMessage.verify({ signature });
      if (!verifyResult.success) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "SIWE signature verification failed.",
        });
      }
    } catch (err) {
      app.log.error({ err }, "SIWE signature verification crashed");
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Invalid SIWE signature or message.",
      });
    }

    try {
      const { nonce, address: walletAddress } = siweMessage;

      // Check nonce exists in Redis (one-time use)
      const nonceKey = `siwe:nonce:${nonce}`;
      const nonceExists = await redis.get(nonceKey);
      if (!nonceExists) {
        return reply.status(401).send({
          error: "Unauthorized",
          message: "Nonce is invalid or has already been used.",
        });
      }

      // Delete nonce immediately
      await redis.del(nonceKey);

      // Upsert user record
      const [user] = await db
        .insert(users)
        .values({
          walletAddress: walletAddress.toLowerCase(),
          ensName: null,
          lastSeen: new Date(),
        })
        .onConflictDoUpdate({
          target: users.walletAddress,
          set: { lastSeen: new Date() },
        })
        .returning();

      if (!user) {
        throw new Error("Failed to create or retrieve user record");
      }

      // Sign JWT
      const payload: JwtPayload = {
        walletAddress: user.walletAddress,
        userId: user.id,
      };
      const token = app.jwt.sign(payload);

      // Enqueue indexing job
      const isFirstAuth = !user.createdAt || (Date.now() - user.createdAt.getTime()) < 5000;
      if (isFirstAuth) {
        import("../workers/indexWorker.js").then(({ indexingQueue }) => {
          indexingQueue.add(
            "index:full",
            { type: "index:full", userId: user.id, walletAddress: user.walletAddress, chainId: 16602 },
            { jobId: `full:${user.id}:initial` }
          ).catch(() => {});
        }).catch(() => {});
      }

      return reply.status(200).send({
        token,
        walletAddress: user.walletAddress,
        userId: user.id,
      });
    } catch (err) {
      app.log.error({ err }, "SIWE verify route crashed during DB/Redis operations");
      return reply.status(500).send({
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "An unexpected error occurred during verification.",
      });
    }
  });
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /users/me
   * Return the current authenticated user's profile.
   */
  app.get(
    "/me",
    { preHandler: authenticate },
    async (request, reply) => {
      const { userId } = request.user as JwtPayload;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        return reply.status(404).send({
          error: "Not Found",
          message: "User not found.",
        });
      }

      return reply.status(200).send({
        id: user.id,
        walletAddress: user.walletAddress,
        ensName: user.ensName,
        createdAt: user.createdAt,
        lastSeen: user.lastSeen,
      });
    }
  );
}
