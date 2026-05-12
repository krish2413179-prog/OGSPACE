# Design Document: MirrorMind

## Overview

MirrorMind is a full-stack production AI agent system that mirrors a wallet's on-chain decision-making style as an autonomous agent. The system indexes every on-chain action a wallet has ever taken, computes a 512-dimensional behavioral fingerprint using a lightweight transformer model, deploys a persistent agent with a 0G Agent ID that acts on the user's behalf, and optionally tokenizes the behavioral model as a Soul NFT (ERC-721) tradeable on an on-chain marketplace.

The system targets two 0G Hackathon tracks simultaneously:
- **Track 1 (Agent Infrastructure)**: Persistent agent identity via 0G Agent ID, decentralized model storage on 0G Storage, real-time inference via 0G Compute.
- **Track 3 (Agentic Economy)**: Soul NFT marketplace enabling rental and sale of behavioral models, creating a market for decision DNA.

### Key Design Principles

1. **Decentralized persistence**: All model weights, NFT metadata, decision logs, and action archives live on 0G Storage — the backend is stateless with respect to model data.
2. **Safety-first execution**: The Guardian rule engine sits between every inference result and every on-chain transaction, enforcing hard spending and risk limits.
3. **Progressive autonomy**: Three agent modes (OBSERVE → SUGGEST → EXECUTE) let users build trust before granting full execution rights.
4. **Monochromatic editorial UI**: Strict black-and-white design system with horizontal bar charts — no color fills, no radar charts.

---

## Architecture

### System Topology

```
┌─────────────────────────────────────────────────────────────────────┐
│                          0G Chain (EVM)                             │
│  ┌──────────────┐  ┌─────────────────────┐  ┌──────────────────┐  │
│  │  SoulNFT.sol │  │ SoulMarketplace.sol  │  │ AgentRegistry.sol│  │
│  └──────────────┘  └─────────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
         ▲                    ▲                         ▲
         │ viem               │ viem                    │ viem
┌────────┴────────────────────┴─────────────────────────┴────────────┐
│                        API Server (Node.js 20 + Fastify)           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  REST Routes │  │  WebSocket   │  │  BullMQ Workers           │ │
│  │  (SIWE/JWT)  │  │  (events)    │  │  (indexer, agent loops)   │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  Drizzle ORM │  │  0G Storage  │  │  gRPC Client             │ │
│  │  (PostgreSQL)│  │  SDK Client  │  │  (→ ML Microservice)      │ │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
         │ gRPC                                    │ Redis
┌────────┴──────────────────┐          ┌───────────┴──────────────┐
│  ML Microservice (Python) │          │  Redis (BullMQ queues)   │
│  FastAPI + gRPC server    │          └──────────────────────────┘
│  Lightweight Transformer  │
│  512-dim vector output    │
└───────────────────────────┘
         │ CID
┌────────┴──────────────────────────────────────────────────────────┐
│                     0G Infrastructure                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │
│  │   0G Storage     │  │   0G Compute     │  │  0G Agent ID   │  │
│  │  (model weights, │  │  (real-time      │  │  (persistent   │  │
│  │   NFT metadata,  │  │   inference)     │  │   agent ident) │  │
│  │   decision logs, │  └──────────────────┘  └────────────────┘  │
│  │   action archive)│                                             │
│  └──────────────────┘                                             │
└───────────────────────────────────────────────────────────────────┘
         ▲
┌────────┴──────────────────────────────────────────────────────────┐
│                  Frontend (Next.js 14 App Router)                  │
│  wagmi v2 + viem + RainbowKit │ Zustand │ Recharts │ Framer Motion │
└───────────────────────────────────────────────────────────────────┘
```

### Request Flow: Agent Decision Loop

```
BullMQ Scheduler (every 5 min / 15 min)
  │
  ▼
AgentWorker.runDecisionCycle(agentId)
  │
  ├─► Fetch market context (0G Chain RPC + price feeds)
  │
  ├─► Retrieve model CID from behavior_models table
  │
  ├─► Submit (CID + market context) → 0G Compute
  │         └─► Returns: { action_type, target_protocol, asset,
  │                         amount, confidence_score }
  │
  ├─► confidence_score < 0.6 → SKIP (log failure)
  │
  ├─► Guardian.evaluate(proposedAction)
  │         ├─► max $1k/tx check
  │         ├─► max $5k/day rolling check
  │         ├─► contract verification check
  │         ├─► honeypot detection check
  │         ├─► max 3% slippage check
  │         └─► min $50k pool liquidity check
  │
  ├─► BLOCKED → log violation, record agent_action (was_executed=false)
  │
  ├─► EXECUTE mode → submit tx to 0G Chain
  │         └─► upload decision log → 0G Storage → record CID
  │
  └─► SUGGEST mode → emit WebSocket event to Frontend
```

---

## Components and Interfaces

### 1. API Server (Node.js 20 + Fastify)

The API Server is the central orchestrator. It exposes REST endpoints for all user-facing operations, manages WebSocket connections for real-time events, and coordinates BullMQ workers for background processing.

#### REST Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/siwe/nonce` | None | Generate SIWE nonce |
| `POST` | `/auth/siwe/verify` | None | Verify SIWE signature, return JWT |
| `GET` | `/users/me` | JWT | Get current user profile |
| `GET` | `/indexing/status` | JWT | Get wallet indexing status |
| `POST` | `/models/train` | JWT | Enqueue model training job |
| `GET` | `/models/current` | JWT | Get current behavioral model |
| `POST` | `/agents/deploy` | JWT | Deploy agent (calls AgentRegistry) |
| `GET` | `/agents/current` | JWT | Get current agent status |
| `PATCH` | `/agents/current/mode` | JWT | Change agent mode |
| `DELETE` | `/agents/current` | JWT | Deactivate agent |
| `GET` | `/agents/current/actions` | JWT | Paginated agent action log |
| `POST` | `/nfts/mint/prepare` | JWT | Prepare mint transaction params |
| `GET` | `/marketplace/listings` | JWT | Get all active listings |
| `GET` | `/marketplace/listings/:tokenId` | JWT | Get single listing detail |
| `POST` | `/marketplace/rent` | JWT | Record rental transaction |
| `POST` | `/marketplace/buy` | JWT | Record purchase transaction |

#### WebSocket Events (server → client)

| Event | Payload | Trigger |
|-------|---------|---------|
| `indexing:status` | `{ status, progress }` | Indexing job progress |
| `indexing:complete` | `{ walletAddress }` | Indexing job finished |
| `agent:suggestion` | `{ action, confidence, reasoning }` | SUGGEST mode cycle |
| `agent:executed` | `{ txHash, action }` | EXECUTE mode tx confirmed |
| `agent:blocked` | `{ reason, action }` | Guardian blocked action |

#### BullMQ Queues and Workers

| Queue | Worker | Concurrency | Description |
|-------|--------|-------------|-------------|
| `indexing` | `IndexingWorker` | 5 | Full historical + incremental indexing |
| `model-training` | `ModelTrainingWorker` | 2 | gRPC call to ML Microservice |
| `agent-execute` | `AgentExecuteWorker` | 10 | EXECUTE mode decision loops |
| `agent-suggest` | `AgentSuggestWorker` | 10 | SUGGEST mode decision loops |
| `storage-upload` | `StorageUploadWorker` | 5 | 0G Storage uploads with retry |
| `archive` | `ArchiveWorker` | 1 | Weekly action history archival |

### 2. ML Microservice (Python FastAPI + gRPC)

The ML Microservice is a standalone Python service that owns all model training and inference logic. It communicates with the API Server exclusively via gRPC.

#### gRPC Service Definition

```protobuf
service BehavioralModelService {
  rpc TrainModel(TrainModelRequest) returns (TrainModelResponse);
  rpc GetModelInfo(GetModelInfoRequest) returns (GetModelInfoResponse);
}

message TrainModelRequest {
  string wallet_address = 1;
  repeated WalletAction actions = 2;
}

message TrainModelResponse {
  bytes vector = 1;           // 512 float32 values, little-endian
  float performance_score = 2; // 0.0 – 100.0
  string model_version = 3;
  ModelDimensions dimensions = 4;
}

message ModelDimensions {
  repeated float risk_profile = 1;        // 64 dims
  repeated float timing_patterns = 2;     // 64 dims
  repeated float protocol_preferences = 3; // 128 dims
  repeated float asset_behavior = 4;      // 128 dims
  repeated float decision_context = 5;    // 128 dims
}

message WalletAction {
  string tx_hash = 1;
  string action_type = 2;
  string protocol = 3;
  string asset_in = 4;
  string asset_out = 5;
  double amount_usd = 6;
  int64 block_timestamp = 7;
}
```

#### Model Architecture

The behavioral model uses a lightweight transformer encoder:
- **Input**: Sequence of wallet action embeddings (variable length, max 1000 actions)
- **Embedding layer**: Action type + protocol + asset embeddings concatenated (128-dim each)
- **Transformer encoder**: 4 layers, 8 attention heads, 256 hidden dim
- **Pooling**: Mean pooling over sequence dimension
- **Output projection**: Linear layer → 512-dim behavioral vector
- **Backtesting**: Sliding window over last 30 days, comparing predicted vs actual actions

### 3. Smart Contracts (Solidity ^0.8.24, Foundry)

#### SoulNFT.sol

```solidity
// Key interfaces
struct ModelMetadata {
    uint256 totalActions;
    uint256 trainingTimestamp;
    uint256 performanceScore;   // 0–100, scaled by 1e2 for precision
    bool isRentable;
    uint256 rentalPricePerDay;  // in wei
    bool isForSale;
    uint256 salePrice;          // in wei
    string ogStorageCid;        // 0G Storage CID for model weights
}

// ERC-721 + ERC-4337 IAccount interface
// One NFT per wallet enforced via mapping(address => uint256) walletToTokenId
// tokenURI returns: "ipfs://{ogStorageCid}/metadata.json" (0G Storage gateway)
```

#### SoulMarketplace.sol

```solidity
struct RentalLease {
    address renter;
    uint256 tokenId;
    uint256 startTimestamp;
    uint256 expiryTimestamp;
    uint256 dailyRate;
}

struct SaleListing {
    address seller;
    uint256 tokenId;
    uint256 price;
    bool active;
}

// Platform fee: 250 basis points (2.5%)
// ReentrancyGuard on all ETH-transferring functions
// Earnings accumulated in mapping(address => uint256) pendingEarnings
```

#### AgentRegistry.sol

```solidity
enum AgentMode { OBSERVE, SUGGEST, EXECUTE }
enum AgentStatus { ACTIVE, INACTIVE }

struct AgentRecord {
    address owner;
    string ogAgentId;       // 0G Agent ID
    uint256 soulTokenId;    // 0 if no Soul NFT
    string modelCid;        // fallback if no Soul NFT
    AgentMode mode;
    AgentStatus status;
    address agentAddress;   // authorized backend address for recordAction
}

// onlyAgentAddress modifier: msg.sender must equal agentRecord.agentAddress
// recordAction restricted to registered agent address only
```

### 4. Frontend (Next.js 14 App Router)

#### Route Structure

```
app/
├── layout.tsx              # Root layout: providers, global styles
├── page.tsx                # Landing / connect wallet
├── dashboard/
│   ├── page.tsx            # Main dashboard (indexing status, model, agent)
│   ├── mint/
│   │   └── page.tsx        # 3-step Soul NFT mint flow
│   └── agent/
│       └── page.tsx        # Agent control panel
└── marketplace/
    ├── page.tsx            # Listings grid
    └── [tokenId]/
        └── page.tsx        # Listing detail modal
```

#### State Management (Zustand)

```typescript
// Global store slices
interface AppStore {
  // Auth
  address: string | null;
  jwt: string | null;
  
  // Indexing
  indexingStatus: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';
  indexingProgress: number;
  
  // Model
  currentModel: BehavioralModel | null;
  
  // Agent
  currentAgent: AgentDeployment | null;
  agentActions: AgentAction[];
  pendingSuggestion: AgentSuggestion | null;
  
  // Marketplace
  listings: SoulNFTListing[];
}
```

#### Design System Components

| Component | Description |
|-----------|-------------|
| `<HorizontalBar>` | White fill on black bg, percentage label, no border-radius |
| `<StatRow>` | Label + value in monospace, sharp border bottom |
| `<AgentModeLabel>` | Uppercase monospace, white outline pill |
| `<SharpCard>` | `border: 1px solid #FFFFFF`, `border-radius: 0` |
| `<FadeIn>` | Framer Motion entrance: opacity 0→1, y 8→0, 200ms |
| `<SlideUp>` | Framer Motion entrance: opacity 0→1, y 16→0, 300ms |

---

## Data Models

### PostgreSQL Schema (Drizzle ORM)

```sql
-- Users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(42) NOT NULL UNIQUE,
  ens_name      VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet Actions (indexed on-chain events)
CREATE TABLE wallet_actions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  tx_hash        VARCHAR(66) NOT NULL UNIQUE,
  action_type    VARCHAR(32) NOT NULL,  -- TRADE | GOVERNANCE_VOTE | DEFI_POSITION | NFT_PURCHASE | LIQUIDITY_MOVE | OTHER
  protocol       VARCHAR(128),
  asset_in       VARCHAR(42),
  asset_out      VARCHAR(42),
  amount_usd     NUMERIC(20, 6),
  block_number   BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ NOT NULL,
  raw_data       JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_wallet_actions_user_id ON wallet_actions(user_id);
CREATE INDEX idx_wallet_actions_block_timestamp ON wallet_actions(block_timestamp);

-- Behavioral Models
CREATE TABLE behavior_models (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  version           INTEGER NOT NULL DEFAULT 1,
  og_storage_cid    VARCHAR(255) NOT NULL,
  performance_score NUMERIC(5, 2) NOT NULL,  -- 0.00–100.00
  vector_dimensions INTEGER NOT NULL DEFAULT 512,
  model_metadata    JSONB NOT NULL,           -- dimension breakdown
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, version)
);
CREATE INDEX idx_behavior_models_user_id ON behavior_models(user_id);

-- Soul NFTs
CREATE TABLE soul_nfts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) UNIQUE,
  token_id        BIGINT NOT NULL UNIQUE,
  model_id        UUID NOT NULL REFERENCES behavior_models(id),
  og_storage_cid  VARCHAR(255) NOT NULL,
  is_rentable     BOOLEAN NOT NULL DEFAULT FALSE,
  rental_price_per_day NUMERIC(30, 0),       -- in wei
  is_for_sale     BOOLEAN NOT NULL DEFAULT FALSE,
  sale_price      NUMERIC(30, 0),            -- in wei
  minted_at       TIMESTAMPTZ NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Deployments
CREATE TABLE agent_deployments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) UNIQUE,
  og_agent_id   VARCHAR(255) NOT NULL UNIQUE,
  soul_token_id BIGINT,                      -- nullable
  model_cid     VARCHAR(255) NOT NULL,
  mode          VARCHAR(16) NOT NULL DEFAULT 'OBSERVE',  -- OBSERVE | SUGGEST | EXECUTE
  status        VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | INACTIVE
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agent Actions (decision log)
CREATE TABLE agent_actions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id          UUID NOT NULL REFERENCES agent_deployments(id),
  action_type       VARCHAR(32),
  target_protocol   VARCHAR(128),
  asset             VARCHAR(42),
  amount_usd        NUMERIC(20, 6),
  confidence_score  NUMERIC(4, 3),           -- 0.000–1.000
  decision_reasoning TEXT,
  was_executed      BOOLEAN NOT NULL DEFAULT FALSE,
  user_overrode     BOOLEAN NOT NULL DEFAULT FALSE,
  guardian_blocked  BOOLEAN NOT NULL DEFAULT FALSE,
  guardian_reason   TEXT,
  tx_hash           VARCHAR(66),
  og_decision_cid   VARCHAR(255),            -- 0G Storage CID for decision log
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_actions_agent_id ON agent_actions(agent_id);
CREATE INDEX idx_agent_actions_created_at ON agent_actions(created_at);

-- Marketplace Transactions
CREATE TABLE marketplace_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        BIGINT NOT NULL,
  transaction_type VARCHAR(16) NOT NULL,     -- SALE | RENTAL_START | RENTAL_END
  buyer_address   VARCHAR(42),
  seller_address  VARCHAR(42) NOT NULL,
  amount_wei      NUMERIC(30, 0) NOT NULL,
  platform_fee_wei NUMERIC(30, 0) NOT NULL,
  tx_hash         VARCHAR(66) NOT NULL UNIQUE,
  block_timestamp TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_marketplace_transactions_token_id ON marketplace_transactions(token_id);
```

### 0G Storage Object Schema

| Object Type | Key Pattern | Content |
|-------------|-------------|---------|
| Model weights | `models/{walletAddress}/v{version}/weights.bin` | Binary float32 array (512 × 4 bytes) |
| Model metadata | `models/{walletAddress}/v{version}/metadata.json` | `{ dimensions, performanceScore, trainingTimestamp, totalActions }` |
| NFT metadata | `nfts/{tokenId}/metadata.json` | ERC-721 metadata JSON (name, description, attributes) |
| Decision log | `decisions/{agentId}/{timestamp}.json` | `{ action, reasoning, confidence, guardianResult, txHash }` |
| Action archive | `archives/{walletAddress}/{weekISO}.json.gz` | Compressed weekly action history |

### TypeScript Types (shared)

```typescript
// Behavioral model dimension scores (0–100 per dimension)
interface ModelDimensionScores {
  riskProfile: number;          // 64-dim → scalar score
  timingPatterns: number;       // 64-dim → scalar score
  protocolPreferences: number;  // 128-dim → scalar score
  assetBehavior: number;        // 128-dim → scalar score
  decisionContext: number;      // 128-dim → scalar score
  compositeScore: number;       // weighted average
}

interface BehavioralModel {
  id: string;
  version: number;
  ogStorageCid: string;
  performanceScore: number;
  dimensions: ModelDimensionScores;
  personalitySummary: string;   // generated plain-English description
  createdAt: Date;
}

interface AgentAction {
  id: string;
  actionType: string;
  targetProtocol: string;
  confidenceScore: number;
  decisionReasoning: string;
  wasExecuted: boolean;
  guardianBlocked: boolean;
  guardianReason?: string;
  txHash?: string;
  createdAt: Date;
}

interface SoulNFTListing {
  tokenId: bigint;
  ownerAddress: string;
  ogStorageCid: string;
  performanceScore: number;
  dimensions: ModelDimensionScores;
  isRentable: boolean;
  rentalPricePerDay: bigint;    // wei
  isForSale: boolean;
  salePrice: bigint;            // wei
  traitSummary: string[];       // top 3 behavioral traits
}
```

---


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system � essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

MirrorMind has significant pure-function logic in its Guardian safety engine, behavioral model computation, marketplace fee calculations, and smart contract state machines � all of which are well-suited to property-based testing. The following properties are derived from the acceptance criteria analysis.

---

### Property 1: Valid SIWE Authentication Round-Trip

*For any* valid Ethereum wallet address and correctly signed SIWE message, the authentication flow SHALL produce a JWT and persist a user record containing the wallet address in the `users` table.

**Validates: Requirements 1.1, 1.5**

---

### Property 2: Invalid Credentials Always Return 401

*For any* SIWE message with an invalid signature, an expired nonce, or a mismatched address, the API Server SHALL return HTTP 401 � and for any request with an absent or expired JWT, the API Server SHALL return HTTP 401.

**Validates: Requirements 1.2, 1.4**

---

### Property 3: Transaction Classification Always Returns a Valid Type

*For any* on-chain transaction retrieved during indexing, the classification function SHALL return exactly one of the six valid action types: TRADE, GOVERNANCE_VOTE, DEFI_POSITION, NFT_PURCHASE, LIQUIDITY_MOVE, or OTHER � never null, never an unlisted value.

**Validates: Requirements 2.3**

---

### Property 4: Indexing Idempotence

*For any* wallet address and any set of transactions, indexing the same transaction set twice SHALL produce the same number of `wallet_actions` records as indexing it once � the tx_hash uniqueness constraint is never violated.

**Validates: Requirements 2.5**

---

### Property 5: Indexing Retry Behavior

*For any* sequence of RPC errors followed by a success, the Indexer SHALL retry the failed request up to exactly 3 times before marking the job as FAILED � never fewer, never more.

**Validates: Requirements 2.8**

---

### Property 6: Behavioral Model Vector Dimensions and Partitioning

*For any* wallet with at least 10 indexed actions, the ML Microservice SHALL produce a vector of exactly 512 float32 values, partitioned as: Risk Profile (64) + Timing Patterns (64) + Protocol Preferences (128) + Asset Behavior (128) + Decision Context (128) = 512. The sum of all segment lengths SHALL always equal 512.

**Validates: Requirements 3.1, 3.2**

---

### Property 7: Performance Score Range Invariant

*For any* computed Behavioral Model, the Performance_Score SHALL be a number in the closed interval [0.0, 100.0] � never negative, never above 100.

**Validates: Requirements 3.3**

---

### Property 8: Model Version Monotonicity

*For any* wallet with multiple Behavioral Model versions, each successive version number SHALL be strictly greater than the previous � version numbers are monotonically increasing and never reused.

**Validates: Requirements 3.5**

---

### Property 9: Insufficient Data Returns 422

*For any* wallet with fewer than 10 indexed wallet actions, a model training request SHALL return HTTP 422 � never 200, never 500.

**Validates: Requirements 3.6**

---

### Property 10: OBSERVE Mode Produces No Executions

*For any* agent in OBSERVE mode, the decision loop SHALL never set `was_executed = true` on any `agent_actions` record and SHALL never emit a WebSocket suggestion event � regardless of what 0G Compute returns.

**Validates: Requirements 4.7**

---

### Property 11: Guardian Always Evaluates Before Execution

*For any* inference result returned by 0G Compute, the Guardian evaluation SHALL always be called before any transaction is submitted to 0G Chain � there is no code path that bypasses Guardian evaluation in EXECUTE mode.

**Validates: Requirements 5.2**

---

### Property 12: Guardian Safety Rules Enforcement

*For any* proposed action that violates at least one Guardian safety rule (tx value > $1,000, daily spend > $5,000, unverified contract, honeypot contract, slippage > 3%, pool liquidity < $50,000), the Guardian SHALL block the action, set `guardian_blocked = true`, and set `was_executed = false` in the `agent_actions` record.

**Validates: Requirements 5.3, 5.5**

---

### Property 13: Agent Action Persistence Completeness

*For any* agent action (whether executed, blocked, or skipped), the persisted `agent_actions` record SHALL contain non-null values for: `confidence_score`, `decision_reasoning`, `was_executed`, `guardian_blocked`, and `created_at`. If the action was executed, `tx_hash` and `og_decision_cid` SHALL also be non-null.

**Validates: Requirements 5.6, 5.7**

---

### Property 14: Low Confidence Score Skips Action

*For any* inference result from 0G Compute with a `confidence_score` strictly less than 0.6, the Agent SHALL skip the action � `was_executed` SHALL be false and no transaction SHALL be submitted to 0G Chain.

**Validates: Requirements 10.3**

---

### Property 15: 0G Compute Failure Produces Graceful Skip

*For any* 0G Compute error or timeout (after 30 seconds), the Agent decision loop SHALL skip the current cycle without crashing, log the failure, and remain ready to execute on the next scheduled interval.

**Validates: Requirements 5.8, 10.4**

---

### Property 16: 0G Storage Upload Retry Behavior

*For any* 0G Storage upload failure, the API Server SHALL retry the upload up to exactly 3 times with exponential backoff before returning an error � never fewer retries, never more.

**Validates: Requirements 9.6**

---

### Property 17: One Soul NFT Per Wallet Invariant

*For any* wallet address that already owns a Soul NFT, a second mint call to SoulNFT_Contract SHALL revert with a descriptive error message � the `walletToTokenId` mapping enforces this invariant at the contract level.

**Validates: Requirements 6.3**

---

### Property 18: tokenURI Contains 0G Storage CID

*For any* minted Soul NFT token ID, calling `tokenURI(tokenId)` SHALL return a URI string that contains the 0G Storage CID associated with that token's model metadata � the CID is never empty and never points to a different token's metadata.

**Validates: Requirements 6.6, 14.1**

---

### Property 19: Rental Listing Round-Trip

*For any* Soul NFT, listing it for rental (with price > 0) and then cancelling the listing SHALL result in `isRentable = false` and `rentalPricePerDay = 0` � the state is fully restored to pre-listing state.

**Validates: Requirements 7.1, 7.3**

---

### Property 20: Sale Listing Round-Trip

*For any* Soul NFT, creating a sale listing (with price > 0) and then cancelling it SHALL result in no active `SaleListing` record for that token and `isForSale = false` � the state is fully restored to pre-listing state.

**Validates: Requirements 7.2, 7.4**

---

### Property 21: Rental Lease Timestamp Correctness

*For any* rental transaction with a requested duration of D days, the created `RentalLease` SHALL have `expiryTimestamp = startTimestamp + (D x 86400)` � the lease duration in seconds is always exactly D days.

**Validates: Requirements 8.1**

---

### Property 22: Platform Fee Invariant

*For any* marketplace transaction with a payment amount P (in wei), the seller or lessor SHALL receive exactly `P x 9750 / 10000` wei (i.e., P minus 2.5%), and the platform SHALL accumulate exactly `P x 250 / 10000` wei � the two amounts always sum to exactly P.

**Validates: Requirements 8.3**

---

### Property 23: Lease Active/Expired State Consistency

*For any* `RentalLease` record, `isLeaseActive(tokenId, renter)` SHALL return `true` if and only if `block.timestamp < expiryTimestamp` � the function is consistent with the stored expiry timestamp for all possible current timestamps.

**Validates: Requirements 8.4, 8.5**

---

### Property 24: Non-Rentable NFT Rent Reverts

*For any* Soul NFT with `isRentable = false`, a call to the rental function on `SoulMarketplace_Contract` SHALL revert with a descriptive error message � no `RentalLease` is created.

**Validates: Requirements 8.8**

---

### Property 25: No-Listing NFT Buy Reverts

*For any* Soul NFT with no active `SaleListing`, a call to the purchase function on `SoulMarketplace_Contract` SHALL revert with a descriptive error message � no ownership transfer occurs.

**Validates: Requirements 8.9**

---

### Property 26: Inference Response Parsing Completeness

*For any* valid 0G Compute inference response, the parsed `ActionRecommendation` SHALL contain non-null values for all required fields: `action_type`, `target_protocol`, `asset`, `amount`, and `confidence_score` � malformed responses SHALL be rejected with a logged error.

**Validates: Requirements 10.2**

---

### Property 27: Frontend Renders Horizontal Bars, Not Radar Charts

*For any* rendered behavioral model visualization in the Frontend (dashboard, mint flow Step 1, marketplace listing detail), the rendered component tree SHALL contain `<HorizontalBar>` components and SHALL NOT contain any radar chart, spider chart, or polar chart component.

**Validates: Requirements 11.2, 12.2, 16.3**

---

### Property 28: Marketplace Listing Sort Correctness

*For any* set of Soul NFT listings and any valid sort criterion (Performance_Score descending, rentalPricePerDay ascending, salePrice ascending), the sorted result SHALL be a permutation of the input where every adjacent pair satisfies the sort ordering � no element is out of order.

**Validates: Requirements 13.2**

---

### Property 29: Rental Cost Calculation Correctness

*For any* Soul NFT listing with `rentalPricePerDay = P` and any requested rental duration of D days, the total cost displayed to the user and submitted to the contract SHALL equal exactly `P x D` � no rounding, no hidden fees beyond the on-chain platform fee.

**Validates: Requirements 13.4**

---

### Property 30: Unauthorized Contract Calls Revert

*For any* call to a restricted function on `AgentRegistry_Contract` (specifically `recordAction`) from an address that is not the registered `agentAddress` for the given `og_agent_id`, the contract SHALL revert with a descriptive error message � no state changes occur.

**Validates: Requirements 14.3, 14.4**

---

## Error Handling

### API Server Error Strategy

| Error Category | HTTP Status | Behavior |
|----------------|-------------|----------|
| Invalid SIWE signature | 401 | Return `{ error: "Invalid signature" }` |
| Expired JWT | 401 | Return `{ error: "Token expired" }` |
| Insufficient wallet actions for training | 422 | Return `{ error: "Insufficient data", required: 10, found: N }` |
| 0G Storage upload failure (after 3 retries) | 502 | Return `{ error: "Storage unavailable" }`, log full error |
| 0G Compute timeout | 503 | Agent skips cycle, logs failure, no user-facing error |
| gRPC ML Microservice unavailable | 503 | Return `{ error: "Model service unavailable" }` |
| Contract call revert | 400 | Return `{ error: revertReason }` extracted from viem error |
| Database constraint violation | 409 | Return `{ error: "Conflict", detail: constraintName }` |
| Unhandled exception | 500 | Return `{ error: "Internal server error" }`, log stack trace |

### Retry Policies

| Operation | Max Retries | Backoff | Failure Action |
|-----------|-------------|---------|----------------|
| 0G Chain RPC call (indexing) | 3 | Exponential (1s, 2s, 4s) | Mark job FAILED |
| 0G Storage upload | 3 | Exponential (1s, 2s, 4s) | Return error to caller |
| 0G Compute inference | 0 (skip cycle) | N/A | Log failure, next interval |
| gRPC ML Microservice call | 2 | Linear (2s) | Return 503 |
| BullMQ job (general) | 3 | Exponential | Move to dead-letter queue |

### Guardian Safety Rule Violations

When the Guardian blocks an action, the system:
1. Sets `guardian_blocked = true` and `was_executed = false` in `agent_actions`
2. Records the specific rule violated in `guardian_reason`
3. Does NOT emit a WebSocket event (silent block)
4. Continues to the next scheduled decision cycle

### Smart Contract Error Handling

All contract interactions use viem's `simulateContract` before `writeContract` to catch reverts before spending gas. Revert reasons are extracted and surfaced to the user via the API response.

---

## Testing Strategy

### Overview

MirrorMind uses a dual testing approach: example-based unit tests for specific scenarios and integration points, and property-based tests for universal correctness properties. The property-based testing library is **fast-check** (TypeScript/JavaScript) for the API Server and smart contract logic, and **Hypothesis** (Python) for the ML Microservice.

### Property-Based Testing Configuration

- **Library (TypeScript)**: `fast-check` v3.x
- **Library (Python)**: `hypothesis` v6.x
- **Minimum iterations per property**: 100
- **Tag format**: `// Feature: mirror-mind, Property N: <property_text>`
- Each correctness property in this document maps to exactly one property-based test

### Test Layers

#### 1. Smart Contract Tests (Foundry / forge test)

**Property tests** (using Foundry's fuzz testing with `vm.assume`):
- P17: One Soul NFT per wallet � fuzz wallet addresses, verify second mint reverts
- P18: tokenURI contains CID � fuzz token IDs, verify URI contains CID
- P19: Rental listing round-trip � fuzz prices and token IDs
- P20: Sale listing round-trip � fuzz prices and token IDs
- P21: Rental lease timestamp � fuzz duration D, verify expiry = start + D*86400
- P22: Platform fee invariant � fuzz payment amounts, verify fee + seller amount = total
- P23: Lease active/expired � fuzz timestamps, verify consistency with expiry
- P24: Non-rentable NFT rent reverts � fuzz token IDs with isRentable=false
- P25: No-listing NFT buy reverts � fuzz token IDs with no SaleListing
- P30: Unauthorized calls revert � fuzz caller addresses, verify revert for non-agent callers

**Example tests**:
- Successful mint flow end-to-end
- Successful rental and purchase flows
- Agent registration and mode change
- Earnings withdrawal after rental

#### 2. API Server Tests (Vitest + fast-check)

**Property tests**:
- P1: SIWE round-trip � generate random wallets, sign, verify, check JWT + DB record
- P2: Invalid credentials -> 401 � generate invalid signatures, verify 401
- P3: Transaction classification � generate random tx data, verify output is always a valid type
- P4: Indexing idempotence � generate random tx sets, index twice, verify no duplicates
- P5: Retry behavior � mock RPC failures, verify exactly 3 retries
- P9: Insufficient data -> 422 � generate wallets with 0-9 actions, verify 422
- P16: Storage upload retry � mock upload failures, verify exactly 3 retries
- P28: Marketplace sort correctness � generate random listing sets, verify sort ordering
- P29: Rental cost calculation � fuzz price and duration, verify total = P * D

**Example tests**:
- First-time auth enqueues indexing job
- Model training enqueues gRPC call
- Agent deployment calls AgentRegistry contract
- WebSocket events emitted on indexing completion

#### 3. ML Microservice Tests (pytest + Hypothesis)

**Property tests**:
- P6: Vector dimensions � generate random action sequences (>=10), verify output is 512-dim with correct partitioning
- P7: Performance score range � generate random action sequences, verify score in [0, 100]
- P8: Version monotonicity � generate sequences of training calls, verify version increments

**Example tests**:
- Training with exactly 10 actions succeeds
- Training with 9 actions raises appropriate error
- gRPC endpoint responds to TrainModel request

#### 4. Guardian Tests (Vitest + fast-check)

The Guardian is a pure function and is the highest-value target for property-based testing:

**Property tests**:
- P11: Guardian always called � verify Guardian.evaluate is called for every inference result
- P12: Safety rules enforcement � for each of the 6 rules, generate actions that violate only that rule, verify block
- P14: Low confidence skip � generate confidence scores in [0, 0.599], verify action is always skipped

**Example tests**:
- Action passing all rules in EXECUTE mode -> tx submitted
- Action passing all rules in SUGGEST mode -> WebSocket event emitted
- Action passing all rules in OBSERVE mode -> nothing happens

#### 5. Frontend Tests (Vitest + React Testing Library + fast-check)

**Property tests**:
- P27: No radar charts � generate random model data, render dashboard/mint/marketplace, verify no radar chart components
- P28: Sort correctness � generate random listing arrays, apply each sort, verify ordering

**Example tests**:
- Dashboard renders indexing status correctly
- Mint flow progresses through 3 steps
- Marketplace listing grid renders all required fields
- Agent mode label is uppercase

#### 6. Integration Tests

Integration tests run against a local Docker Compose environment (API Server + PostgreSQL + Redis + ML Microservice mock):

- Full indexing pipeline: auth -> enqueue -> index -> WebSocket complete event
- Full model training pipeline: train request -> gRPC -> 0G Storage upload -> DB record
- Full agent deployment: deploy -> AgentRegistry call -> DB record
- Full marketplace flow: list -> rent -> verify lease -> cancel

### CI/CD Test Execution

`yaml
# GitHub Actions: on every PR to main
jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - run: forge test --fuzz-runs 1000

  backend:
    runs-on: ubuntu-latest
    steps:
      - run: vitest run

  ml:
    runs-on: ubuntu-latest
    steps:
      - run: pytest --hypothesis-seed=0

  frontend:
    runs-on: ubuntu-latest
    steps:
      - run: vitest run
`

### Test Coverage Targets

| Layer | Unit/Property | Integration | Target Coverage |
|-------|---------------|-------------|-----------------|
| Smart Contracts | Foundry fuzz | Foundry fork tests | 100% line coverage |
| API Server | Vitest + fast-check | Docker Compose | 80% line coverage |
| ML Microservice | pytest + Hypothesis | gRPC mock | 80% line coverage |
| Guardian | Vitest + fast-check | N/A | 100% branch coverage |
| Frontend | Vitest + RTL | Playwright E2E | 70% line coverage |