/**
 * Typed API client for MirrorMind backend.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(
  path: string,
  options: RequestInit & { jwt?: string } = {}
): Promise<T> {
  const { jwt, ...fetchOptions } = options;
  const headers: Record<string, string> = {
    ...(fetchOptions.headers as Record<string, string>),
  };

  // Only set Content-Type when there's a body to send
  if (fetchOptions.body) {
    headers["Content-Type"] = "application/json";
  }

  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...fetchOptions, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as { message?: string }).message ?? `HTTP ${res.status}`), { status: res.status, body });
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    nonce: () => request<{ nonce: string }>("/auth/siwe/nonce", { method: "POST" }),
    verify: (message: string, signature: string) =>
      request<{ token: string; walletAddress: string; userId: string }>("/auth/siwe/verify", {
        method: "POST",
        body: JSON.stringify({ message, signature }),
      }),
    me: (jwt: string) => request<{ id: string; walletAddress: string; ensName: string | null }>("/users/me", { jwt }),
  },
  indexing: {
    status: (jwt: string) =>
      request<{ status: string; progress: number; totalActions: number; lastIndexedAt: string | null }>("/indexing/status", { jwt }),
    trigger: (address: string, jwt: string) =>
      request<{ jobId: string }>(`/indexing/trigger/${address}`, { method: "POST", jwt }),
  },
  models: {
    current: (jwt: string) => request<{ id: string; version: number; ogStorageCid: string; performanceScore: number | null; totalActionsTrained: number | null; vectorDimensions: number | null; modelMetadata: unknown }>("/models/current", { jwt }),
    train: (jwt: string) => request<{ jobId: string; actionCount: number }>("/models/train", { method: "POST", jwt }),
  },
  agents: {
    current: (jwt: string) => request<{ id: string; ogAgentId: string; mode: string; isActive: boolean; actionsTaken: number; lastActionAt: string | null; deployedAt: string | null }>("/agents/current", { jwt }),
    deploy: (jwt: string, mode?: string) => request<{ id: string; ogAgentId: string; mode: string }>("/agents/deploy", { method: "POST", jwt, body: JSON.stringify({ mode: mode ?? "OBSERVE" }) }),
    updateMode: (jwt: string, mode: string) => request<{ mode: string }>("/agents/current/mode", { method: "PATCH", jwt, body: JSON.stringify({ mode }) }),
    deactivate: (jwt: string) => request<{ message: string }>("/agents/current", { method: "DELETE", jwt }),
    actions: (jwt: string, page = 1, limit = 20) => request<{ agentId: string; actions: unknown[]; pagination: unknown }>(`/agents/current/actions?page=${page}&limit=${limit}`, { jwt }),
  },
  nfts: {
    prepareMint: (jwt: string) => request<{ ogStorageCid: string; performanceScore: number; mintParams: unknown }>("/nfts/mint/prepare", { method: "POST", jwt }),
    owned: (address: string) => request<{ nfts: unknown[] }>(`/nfts/owned/${address}`),
  },
  marketplace: {
    listings: (sortBy?: string) => request<{ listings: unknown[]; total: number }>(`/marketplace/listings${sortBy ? `?sortBy=${sortBy}` : ""}`),
    listing: (tokenId: number) => request<unknown>(`/marketplace/listings/${tokenId}`),
    rent: (jwt: string, tokenId: number, durationDays: number) =>
      request<{ message: string }>("/marketplace/rent", { method: "POST", jwt, body: JSON.stringify({ tokenId, durationDays }) }),
    buy: (jwt: string, tokenId: number) =>
      request<{ message: string }>("/marketplace/buy", { method: "POST", jwt, body: JSON.stringify({ tokenId }) }),
  },
};
