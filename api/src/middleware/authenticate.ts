import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify preHandler that verifies the JWT and attaches
 * `request.user = { walletAddress, userId }` to the request.
 *
 * Returns 401 with a descriptive message if the token is absent or expired.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired")
        ? "Token has expired. Please sign in again."
        : "Authentication required. Please provide a valid JWT.";

    reply.status(401).send({ error: "Unauthorized", message });
  }
}
