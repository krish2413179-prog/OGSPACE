/**
 * Zustand global store for MirrorMind.
 *
 * Slices:
 *   auth        — wallet address + JWT
 *   indexing    — indexing status + progress
 *   model       — current behavioral model
 *   agent       — current agent, action log, pending suggestion
 *   marketplace — listings
 *
 * Requirements: 9.3
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Types ─────────────────────────────────────────────────────────────────────

export type IndexingStatus = "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED";
export type AgentMode = "OBSERVE" | "SUGGEST";

export interface DimensionScores {
  riskProfile: number;
  timingPatterns: number;
  protocolPreferences: number;
  assetBehavior: number;
  decisionContext: number;
  compositeScore: number;
}

export interface CurrentModel {
  id: string;
  version: number;
  ogStorageCid: string;
  ogStorageTx?: string;
  ogStorageSeq?: string;
  performanceScore: number | null;
  totalActionsTrained: number | null;
  vectorDimensions: number | null;
  dimensionScores?: DimensionScores;
  modelMetadata?: unknown;
  createdAt?: string;
}

export interface CurrentAgent {
  id: string;
  ogAgentId: string;
  mode: AgentMode;
  activeModelId?: string | null;
  isActive: boolean;
  actionsTaken: number;
  lastActionAt?: string;
  deployedAt?: string;
}

export interface AgentAction {
  id: string;
  actionType: string | null;
  decisionReasoning: string | null;
  confidenceScore: number | null;
  wasExecuted: boolean | null;
  guardianBlocked: boolean | null;
  txHash: string | null;
  ogDecisionCid: string | null;
  createdAt?: string;
}

export interface AgentSuggestion {
  agentId: string;
  action: {
    actionType: string;
    protocol: string;
    asset: string;
    amountUsd: number;
  };
  confidence: number;
  reasoning: string;
}

export interface MarketplaceListing {
  tokenId: number;
  walletAddress: string;
  ogStorageCid: string;
  performanceScore: string | null;
  totalActionsTrained: number | null;
  isRentable: boolean | null;
  rentalPricePerDay: string | null;
  isForSale: boolean | null;
  salePrice: string | null;
  timesRented: number | null;
  modelMetadata?: unknown;
  modelVersion?: number | null;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface AppState {
  // Auth
  walletAddress: string | null;
  jwt: string | null;
  setAuth: (walletAddress: string, jwt: string) => void;
  clearAuth: () => void;

  // Indexing
  indexingStatus: IndexingStatus;
  indexingProgress: number;
  totalActions: number;
  setIndexingStatus: (status: IndexingStatus, progress?: number, totalActions?: number) => void;

  // Model
  currentModel: CurrentModel | null;
  setCurrentModel: (model: CurrentModel | null) => void;

  // Agent
  currentAgent: CurrentAgent | null;
  agentActions: AgentAction[];
  pendingSuggestion: AgentSuggestion | null;
  setCurrentAgent: (agent: CurrentAgent | null) => void;
  setAgentActions: (actions: AgentAction[]) => void;
  setPendingSuggestion: (suggestion: AgentSuggestion | null) => void;
  prependAgentAction: (action: AgentAction) => void;

  // Marketplace
  listings: MarketplaceListing[];
  setListings: (listings: MarketplaceListing[]) => void;

  // Analysis/Switch Context
  selectedWalletAddress: string | null;
  setSelectedWalletAddress: (address: string | null) => void;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      walletAddress: null,
      jwt: null,
      setAuth: (walletAddress, jwt) => set({ walletAddress, jwt, selectedWalletAddress: walletAddress }),
      clearAuth: () => set({ walletAddress: null, jwt: null, currentModel: null, currentAgent: null, agentActions: [], pendingSuggestion: null, indexingStatus: "PENDING", indexingProgress: 0, totalActions: 0, selectedWalletAddress: null }),

      // Analysis
      selectedWalletAddress: null,
      setSelectedWalletAddress: (address) => set({ selectedWalletAddress: address }),

      // Indexing
      indexingStatus: "PENDING",
      indexingProgress: 0,
      totalActions: 0,
      setIndexingStatus: (status, progress = 0, totalActions = 0) => {
        // Failsafe: if the backend sends IN_PROGRESS but progress is 100,
        // treat it as COMPLETE to unblock the UI.
        const safeStatus = (status === "IN_PROGRESS" && progress === 100) ? "COMPLETE" : status;
        set({ indexingStatus: safeStatus, indexingProgress: progress, totalActions });
      },

      // Model
      currentModel: null,
      setCurrentModel: (model) => set({ currentModel: model }),

      // Agent
      currentAgent: null,
      agentActions: [],
      pendingSuggestion: null,
      setCurrentAgent: (agent) => set({ currentAgent: agent }),
      setAgentActions: (actions) => set({ agentActions: actions }),
      setPendingSuggestion: (suggestion) => set({ pendingSuggestion: suggestion }),
      prependAgentAction: (action) =>
        set((state) => ({ agentActions: [action, ...state.agentActions].slice(0, 50) })),

      // Marketplace
      listings: [],
      setListings: (listings) => set({ listings }),
    }),
    {
      name: "mirrormind-store",
      // Only persist auth — everything else is fetched fresh
      partialize: (state) => ({ walletAddress: state.walletAddress, jwt: state.jwt }),
    }
  )
);
