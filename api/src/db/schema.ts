import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  bigint,
  decimal,
  boolean,
  jsonb,
  text,
  index,
} from "drizzle-orm/pg-core";

// ─── users ────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  walletAddress: varchar("wallet_address", { length: 42 }).unique().notNull(),
  ensName: varchar("ens_name", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
});

// ─── wallet_actions ───────────────────────────────────────────────────────────

export const walletActions = pgTable(
  "wallet_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    txHash: varchar("tx_hash", { length: 66 }).unique().notNull(),
    actionType: varchar("action_type", { length: 50 }).notNull(),
    protocol: varchar("protocol", { length: 100 }),
    assetIn: varchar("asset_in", { length: 42 }),
    assetOut: varchar("asset_out", { length: 42 }),
    amountUsd: decimal("amount_usd", { precision: 20, scale: 6 }),
    gasUsed: bigint("gas_used", { mode: "number" }),
    blockNumber: bigint("block_number", { mode: "number" }).notNull(),
    blockTimestamp: timestamp("block_timestamp", {
      withTimezone: true,
    }).notNull(),
    rawData: jsonb("raw_data"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    walletIdx: index("idx_wallet_actions_user_id").on(table.userId),
    timestampIdx: index("idx_wallet_actions_block_timestamp").on(
      table.blockTimestamp
    ),
  })
);

// ─── behavior_models ──────────────────────────────────────────────────────────

export const behaviorModels = pgTable(
  "behavior_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id)
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    version: integer("version").notNull(),
    ogStorageCid: varchar("og_storage_cid", { length: 200 }).notNull(),
    ogStorageTx: varchar("og_storage_tx", { length: 66 }),
    totalActionsTrained: integer("total_actions_trained"),
    performanceScore: decimal("performance_score", {
      precision: 6,
      scale: 2,
    }),
    vectorDimensions: integer("vector_dimensions").default(512),
    modelMetadata: jsonb("model_metadata"),
    isCurrent: boolean("is_current").default(false),
    // "own" = user's own wallet (auto-retrains), "snapshot" = one-time analysis
    // of another address, "purchased" = bought from marketplace
    modelType: varchar("model_type", { length: 20 }).notNull().default("own"),
    // For snapshots: the address that was analyzed (not the owner's address)
    sourceAddress: varchar("source_address", { length: 42 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    userIdx: index("idx_behavior_models_user_id").on(table.userId),
    typeIdx: index("idx_behavior_models_type").on(table.modelType),
  })
);

// ─── soul_nfts ────────────────────────────────────────────────────────────────

export const soulNfts = pgTable("soul_nfts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenId: bigint("token_id", { mode: "number" }).unique().notNull(),
  walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
  modelId: uuid("model_id").references(() => behaviorModels.id),
  ogStorageCid: varchar("og_storage_cid", { length: 200 }).notNull(),
  mintTx: varchar("mint_tx", { length: 66 }),
  performanceScore: decimal("performance_score", { precision: 6, scale: 2 }),
  totalActionsTrained: integer("total_actions_trained"),
  isRentable: boolean("is_rentable").default(false),
  rentalPricePerDay: decimal("rental_price_per_day", {
    precision: 20,
    scale: 8,
  }),
  isForSale: boolean("is_for_sale").default(false),
  salePrice: decimal("sale_price", { precision: 20, scale: 8 }),
  timesRented: integer("times_rented").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ─── agent_deployments ────────────────────────────────────────────────────────

export const agentDeployments = pgTable("agent_deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerAddress: varchar("owner_address", { length: 42 }).notNull(),
  ogAgentId: varchar("og_agent_id", { length: 200 }).unique().notNull(),
  soulTokenId: bigint("soul_token_id", { mode: "number" }),
  soulSourceAddress: varchar("soul_source_address", { length: 42 }),
  mode: varchar("mode", { length: 20 }).notNull().default("OBSERVE"),
  activeModelId: uuid("active_model_id").references(() => behaviorModels.id),
  isActive: boolean("is_active").default(true),
  actionsTaken: integer("actions_taken").default(0),
  lastActionAt: timestamp("last_action_at", { withTimezone: true }),
  deployedAt: timestamp("deployed_at", { withTimezone: true }).defaultNow(),
});

// ─── agent_actions ────────────────────────────────────────────────────────────

export const agentActions = pgTable(
  "agent_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").references(() => agentDeployments.id),
    actionType: varchar("action_type", { length: 50 }),
    decisionReasoning: text("decision_reasoning"),
    confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }),
    wasExecuted: boolean("was_executed").default(false),
    guardianBlocked: boolean("guardian_blocked").default(false),
    txHash: varchar("tx_hash", { length: 66 }),
    ogDecisionCid: varchar("og_decision_cid", { length: 200 }),
    userOverrode: boolean("user_overrode").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    agentIdx: index("idx_agent_actions_agent_id").on(table.agentId),
    createdAtIdx: index("idx_agent_actions_created_at").on(table.createdAt),
  })
);

// ─── marketplace_transactions ─────────────────────────────────────────────────

export const marketplaceTransactions = pgTable(
  "marketplace_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: bigint("token_id", { mode: "number" }).notNull(),
    transactionType: varchar("transaction_type", { length: 20 }).notNull(),
    sellerAddress: varchar("seller_address", { length: 42 }),
    buyerAddress: varchar("buyer_address", { length: 42 }),
    priceEth: decimal("price_eth", { precision: 20, scale: 8 }),
    rentalDurationDays: integer("rental_duration_days"),
    txHash: varchar("tx_hash", { length: 66 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    tokenIdx: index("idx_marketplace_transactions_token_id").on(table.tokenId),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type WalletAction = typeof walletActions.$inferSelect;
export type NewWalletAction = typeof walletActions.$inferInsert;

export type BehaviorModel = typeof behaviorModels.$inferSelect;
export type NewBehaviorModel = typeof behaviorModels.$inferInsert;

export type SoulNft = typeof soulNfts.$inferSelect;
export type NewSoulNft = typeof soulNfts.$inferInsert;

export type AgentDeployment = typeof agentDeployments.$inferSelect;
export type NewAgentDeployment = typeof agentDeployments.$inferInsert;

export type AgentAction = typeof agentActions.$inferSelect;
export type NewAgentAction = typeof agentActions.$inferInsert;

export type MarketplaceTransaction = typeof marketplaceTransactions.$inferSelect;
export type NewMarketplaceTransaction =
  typeof marketplaceTransactions.$inferInsert;
