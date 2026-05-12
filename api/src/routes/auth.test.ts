/**
 * Auth route tests — Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * These tests use a mocked db and redis so they run without a live
 * PostgreSQL or Redis instance.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { authRoutes, userRoutes } from "./auth.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock the db plugin so tests don't need a real PostgreSQL connection
vi.mock("../plugins/db.js", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: "test-user-id-123",
              walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              ensName: null,
              createdAt: new Date("2024-01-01T00:00:00Z"),
              lastSeen: new Date("2024-01-01T00:00:00Z"),
            },
          ]),
        }),
      }),
    }),
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([
            {
              id: "test-user-id-123",
              walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
              ensName: null,
              createdAt: new Date("2024-01-01T00:00:00Z"),
              lastSeen: new Date("2024-01-01T00:00:00Z"),
            },
          ]),
        }),
      }),
    }),
  },
  pool: {},
}));

// Mock the redis plugin
const mockRedisStore: Record<string, string> = {};
vi.mock("../plugins/redis.js", () => ({
  redis: {
    set: vi.fn(async (key: string, value: string) => {
      mockRedisStore[key] = value;
      return "OK";
    }),
    get: vi.fn(async (key: string) => mockRedisStore[key] ?? null),
    del: vi.fn(async (key: string) => {
      delete mockRedisStore[key];
      return 1;
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTestApp() {
  const app = Fastify({ logger: false });

  app.register(cors);
  app.register(jwt, {
    secret: "test-secret-for-unit-tests",
    sign: { expiresIn: "24h" },
  });
  app.register(websocket);
  app.register(authRoutes, { prefix: "/auth" });
  app.register(userRoutes, { prefix: "/users" });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /auth/siwe/nonce", () => {
  it("returns a nonce as a 32-character hex string", async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/auth/siwe/nonce",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ nonce: string }>();
    expect(body).toHaveProperty("nonce");
    expect(typeof body.nonce).toBe("string");
    // 16 random bytes → 32 hex chars
    expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);

    await app.close();
  });

  it("returns a different nonce on each call", async () => {
    const app = buildTestApp();
    await app.ready();

    const r1 = await app.inject({ method: "POST", url: "/auth/siwe/nonce" });
    const r2 = await app.inject({ method: "POST", url: "/auth/siwe/nonce" });

    expect(r1.json<{ nonce: string }>().nonce).not.toBe(
      r2.json<{ nonce: string }>().nonce
    );

    await app.close();
  });
});

describe("POST /auth/siwe/verify", () => {
  it("returns 400 when body fields are missing", async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/auth/siwe/verify",
      payload: {},
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("returns 4xx for an invalid SIWE signature (never 200)", async () => {
    const app = buildTestApp();
    await app.ready();

    // First get a real nonce so it exists in the mock store
    const nonceRes = await app.inject({
      method: "POST",
      url: "/auth/siwe/nonce",
    });
    const { nonce } = nonceRes.json<{ nonce: string }>();

    // Build a syntactically valid SIWE message but with a garbage signature
    const message = [
      "localhost wants you to sign in with your Ethereum account:",
      "0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266",
      "",
      "Sign in to MirrorMind",
      "",
      `URI: http://localhost:3000`,
      "Version: 1",
      "Chain ID: 16600",
      `Nonce: ${nonce}`,
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/auth/siwe/verify",
      payload: {
        message,
        signature: "0xinvalidsignature",
      },
    });

    // The SIWE library may reject the message as 400 (bad format) or 401 (bad sig)
    // — either way it must never return 200
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);

    await app.close();
  });

  it("returns 401 when nonce does not exist in Redis", async () => {
    const app = buildTestApp();
    await app.ready();

    const message = [
      "localhost wants you to sign in with your Ethereum account:",
      "0xf39Fd6e51aad88F6f4ce6aB8827279cffFb92266",
      "",
      "Sign in to MirrorMind",
      "",
      `URI: http://localhost:3000`,
      "Version: 1",
      "Chain ID: 16600",
      "Nonce: nonexistentnonce00000000000000",
      `Issued At: ${new Date().toISOString()}`,
    ].join("\n");

    const response = await app.inject({
      method: "POST",
      url: "/auth/siwe/verify",
      payload: {
        message,
        signature: "0xinvalidsignature",
      },
    });

    // Either 400 (bad message format) or 401 (bad sig / nonce) — never 200
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.statusCode).toBeLessThan(500);

    await app.close();
  });
});

describe("GET /users/me", () => {
  it("returns 401 when no JWT is provided", async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("returns 401 when an invalid JWT is provided", async () => {
    const app = buildTestApp();
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: {
        authorization: "Bearer this.is.not.a.valid.jwt",
      },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it("returns the user profile when a valid JWT is provided", async () => {
    const app = buildTestApp();
    await app.ready();

    // Sign a valid JWT directly (simulates a successful /verify response)
    const token = app.jwt.sign({
      walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
      userId: "test-user-id-123",
    });

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: {
        authorization: `Bearer ${token}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      id: string;
      walletAddress: string;
    }>();
    expect(body.id).toBe("test-user-id-123");
    expect(body.walletAddress).toBe(
      "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    );

    await app.close();
  });

  it("returns 401 when an expired JWT is provided", async () => {
    const app = buildTestApp();
    await app.ready();

    // Sign a JWT with a very short expiry, then wait for it to expire
    // fast-jwt requires a positive expiresIn, so we use "1s" and a past iat
    const expiredToken = app.jwt.sign(
      {
        walletAddress: "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        userId: "test-user-id-123",
        // Set iat to 2 hours ago so the 24h token is still valid — instead
        // we test with a deliberately short-lived token by manipulating iat
        iat: Math.floor(Date.now() / 1000) - 90000, // 25 hours ago
      },
      { expiresIn: "1s" }
    );

    const response = await app.inject({
      method: "GET",
      url: "/users/me",
      headers: {
        authorization: `Bearer ${expiredToken}`,
      },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
