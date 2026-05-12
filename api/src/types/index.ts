// Shared TypeScript types for MirrorMind API

/** Valid on-chain action types produced by the transaction classifier */
export type ActionType =
  | "TRADE"
  | "GOVERNANCE_VOTE"
  | "DEFI_POSITION"
  | "NFT_PURCHASE"
  | "LIQUIDITY_MOVE"
  | "OTHER";

/** Agent operating modes */
export type AgentMode = "OBSERVE" | "SUGGEST" | "EXECUTE";

/** Agent lifecycle status */
export type AgentStatus = "ACTIVE" | "INACTIVE";

/** Indexing job status */
export type IndexingStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED";

/** Marketplace transaction types */
export type MarketplaceTransactionType = "SALE" | "RENTAL_START" | "RENTAL_END";

/** Behavioral model dimension scores (0–100 per dimension) */
export interface ModelDimensionScores {
  riskProfile: number; // 64-dim → scalar score
  timingPatterns: number; // 64-dim → scalar score
  protocolPreferences: number; // 128-dim → scalar score
  assetBehavior: number; // 128-dim → scalar score
  decisionContext: number; // 128-dim → scalar score
  compositeScore: number; // weighted average
}

/** A single indexed on-chain wallet action */
export interface WalletAction {
  id: string;
  userId: string;
  walletAddress: string;
  chainId: number;
  txHash: string;
  actionType: ActionType;
  protocol?: string | null;
  assetIn?: string | null;
  assetOut?: string | null;
  amountUsd?: string | null;
  gasUsed?: number | null;
  blockNumber: number;
  blockTimestamp: Date;
  rawData?: unknown;
  indexedAt?: Date | null;
}

/** A computed behavioral model stored in the database */
export interface BehaviorModel {
  id: string;
  userId: string;
  walletAddress: string;
  version: number;
  ogStorageCid: string;
  ogStorageTx?: string | null;
  totalActionsTrained?: number | null;
  performanceScore?: string | null;
  vectorDimensions?: number | null;
  modelMetadata?: unknown;
  isCurrent?: boolean | null;
  createdAt?: Date | null;
}

/** A deployed autonomous agent */
export interface AgentDeployment {
  id: string;
  ownerAddress: string;
  ogAgentId: string;
  soulTokenId?: number | null;
  soulSourceAddress?: string | null;
  mode: AgentMode;
  isActive?: boolean | null;
  actionsTaken?: number | null;
  lastActionAt?: Date | null;
  deployedAt?: Date | null;
}

/** A minted Soul NFT record */
export interface SoulNFT {
  id: string;
  tokenId: number;
  walletAddress: string;
  modelId?: string | null;
  ogStorageCid: string;
  mintTx?: string | null;
  performanceScore?: string | null;
  totalActionsTrained?: number | null;
  isRentable?: boolean | null;
  rentalPricePerDay?: string | null;
  isForSale?: boolean | null;
  salePrice?: string | null;
  timesRented?: number | null;
  createdAt?: Date | null;
}

/** An active marketplace listing (join of soul_nfts + behavior_models) */
export interface MarketplaceListing {
  tokenId: number;
  walletAddress: string;
  ogStorageCid: string;
  performanceScore?: string | null;
  totalActionsTrained?: number | null;
  isRentable: boolean;
  rentalPricePerDay?: string | null;
  isForSale: boolean;
  salePrice?: string | null;
  timesRented: number;
  modelMetadata?: unknown;
}

/** JWT payload attached to authenticated requests */
export interface JwtPayload {
  walletAddress: string;
  userId: string;
}

