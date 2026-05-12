# Implementation Plan: MirrorMind

## Overview

MirrorMind is a full-stack AI agent system built on 0G infrastructure. The implementation is organized into eight phases: project scaffolding, smart contracts, ML microservice, API server core (auth + indexing), behavioral model pipeline, agent decision loop + Guardian, Soul NFT + marketplace, and frontend. Each phase builds on the previous and ends with all code wired together before moving forward.

The stack is: **Solidity ^0.8.24 + Foundry** (contracts), **Node.js 20 + TypeScript + Fastify** (API server), **Python 3.11 + FastAPI + gRPC** (ML microservice), **Next.js 14 App Router + TypeScript** (frontend), **PostgreSQL + Drizzle ORM**, **Redis + BullMQ**, **fast-check** (TS property tests), **Hypothesis** (Python property tests).

---

## Tasks

- [x] 1. Project scaffolding and shared configuration
  - Initialize monorepo structure with workspaces: `contracts/`, `api/`, `ml/`, `frontend/`
  - Create root `docker-compose.yml` starting API Server, ML Microservice, PostgreSQL, and Redis
  - Create `.env.example` files for all four services documenting all required keys
  - Set up GitHub Actions workflows: `contracts.yml` (`forge test --fuzz-runs 1000`), `backend.yml` (`vitest run`), `ml.yml` (`pytest --hypothesis-seed=0`), `frontend.yml` (`vitest run`)
  - Configure Railway deployment step in `backend.yml` and Vercel deployment step in `frontend.yml` triggered on passing main-branch commits
  - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

- [x] 2. Smart contracts — SoulNFT, SoulMarketplace, AgentRegistry
  - [x] 2.1 Implement `SoulNFT.sol`
    - ERC-721 base with `ModelMetadata` struct stored per token
    - `walletToTokenId` mapping enforcing one NFT per wallet; revert with descriptive message on second mint
    - `tokenURI` returning `"ipfs://{ogStorageCid}/metadata.json"` constructed from stored CID
    - ERC-4337 `IAccount` interface stub for agent wallet operations
    - `updateModel(tokenId, newCid, newTimestamp)` callable by owner to update CID pointer
    - _Requirements: 6.2, 6.3, 6.4, 6.6, 6.7, 14.1, 14.6_

  - [ ]* 2.2 Write Foundry fuzz tests for SoulNFT
    - **Property 17: One Soul NFT per wallet** — fuzz wallet addresses, verify second mint reverts
    - **Validates: Requirements 6.3**
    - **Property 18: tokenURI contains 0G Storage CID** — fuzz token IDs, verify URI contains stored CID
    - **Validates: Requirements 6.6, 14.1**

  - [x] 2.3 Implement `SoulMarketplace.sol`
    - `RentalLease` and `SaleListing` structs with full lifecycle functions: `listForRent`, `cancelRentalListing`, `listForSale`, `cancelSaleListing`, `rent`, `buy`, `withdrawEarnings`
    - Platform fee constant: 250 basis points (2.5%); `pendingEarnings` mapping for accumulated seller/lessor earnings
    - `isLeaseActive(tokenId, renter)` returning `true` iff `block.timestamp < expiryTimestamp`
    - `ReentrancyGuard` on all ETH-transferring functions; revert with descriptive messages for non-rentable / no-listing cases
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.8, 8.9, 14.2, 14.4_

  - [ ]* 2.4 Write Foundry fuzz tests for SoulMarketplace
    - **Property 19: Rental listing round-trip** — fuzz prices and token IDs, verify state restored after cancel
    - **Validates: Requirements 7.1, 7.3**
    - **Property 20: Sale listing round-trip** — fuzz prices and token IDs, verify state restored after cancel
    - **Validates: Requirements 7.2, 7.4**
    - **Property 21: Rental lease timestamp correctness** — fuzz duration D, verify `expiry = start + D * 86400`
    - **Validates: Requirements 8.1**
    - **Property 22: Platform fee invariant** — fuzz payment amounts P, verify `fee + seller = P` exactly
    - **Validates: Requirements 8.3**
    - **Property 23: Lease active/expired state consistency** — fuzz timestamps, verify `isLeaseActive` consistent with expiry
    - **Validates: Requirements 8.4, 8.5**
    - **Property 24: Non-rentable NFT rent reverts** — fuzz token IDs with `isRentable=false`, verify revert
    - **Validates: Requirements 8.8**
    - **Property 25: No-listing NFT buy reverts** — fuzz token IDs with no SaleListing, verify revert
    - **Validates: Requirements 8.9**

  - [x] 2.5 Implement `AgentRegistry.sol`
    - `AgentRecord` struct with `AgentMode` and `AgentStatus` enums
    - `registerAgent`, `updateMode`, `deactivateAgent`, `recordAction` functions
    - `onlyAgentAddress` modifier: `msg.sender` must equal `agentRecord.agentAddress`; revert with descriptive message otherwise
    - _Requirements: 4.1, 4.3, 4.8, 14.3, 14.4_

  - [ ]* 2.6 Write Foundry fuzz tests for AgentRegistry
    - **Property 30: Unauthorized contract calls revert** — fuzz caller addresses, verify `recordAction` reverts for non-agent callers
    - **Validates: Requirements 14.3, 14.4**

  - [x] 2.7 Write Foundry deployment scripts for all three contracts targeting 0G Chain mainnet RPC
    - `script/Deploy.s.sol` deploying SoulNFT, SoulMarketplace, AgentRegistry in sequence
    - _Requirements: 14.5_

  - [x] 2.8 Checkpoint — run `forge test --fuzz-runs 1000`; ensure all contract tests pass

- [x] 3. ML Microservice — Python FastAPI + gRPC
  - [x] 3.1 Define gRPC proto and generate stubs
    - Write `proto/behavioral_model.proto` with `BehavioralModelService`, `TrainModelRequest`, `TrainModelResponse`, `GetModelInfoRequest`, `GetModelInfoResponse`, `WalletAction`, and `ModelDimensions` messages exactly as specified in the design
    - Generate Python stubs with `grpc_tools.protoc`
    - _Requirements: 3.8_

  - [x] 3.2 Implement the lightweight transformer model
    - Build `model/transformer.py`: embedding layer (action type + protocol + asset, 128-dim each), 4-layer transformer encoder (8 heads, 256 hidden dim), mean pooling, linear projection to 512-dim output
    - Partition output into: Risk Profile (64), Timing Patterns (64), Protocol Preferences (128), Asset Behavior (128), Decision Context (128)
    - _Requirements: 3.1, 3.2_

  - [x] 3.3 Implement backtesting and Performance_Score computation
    - Sliding-window backtest over last 30 days comparing predicted vs actual actions
    - Clamp output to `[0.0, 100.0]`
    - _Requirements: 3.3_

  - [ ]* 3.4 Write Hypothesis property tests for the ML Microservice
    - **Property 6: Behavioral model vector dimensions and partitioning** — generate random action sequences (≥10), verify output is exactly 512 float32 values with correct segment lengths summing to 512
    - **Validates: Requirements 3.1, 3.2**
    - **Property 7: Performance score range invariant** — generate random action sequences, verify score ∈ [0.0, 100.0]
    - **Validates: Requirements 3.3**
    - **Property 8: Model version monotonicity** — generate sequences of training calls, verify each version > previous
    - **Validates: Requirements 3.5**

  - [x] 3.5 Implement the gRPC server and FastAPI app
    - Wire `TrainModel` RPC to transformer + backtesting pipeline
    - Return `TrainModelResponse` with `vector` (512 float32 little-endian bytes), `performance_score`, `model_version`, and `dimensions`
    - Raise gRPC `INVALID_ARGUMENT` when fewer than 10 actions are provided
    - _Requirements: 3.1, 3.6, 3.8_

  - [x] 3.6 Checkpoint — run `pytest --hypothesis-seed=0`; ensure all ML tests pass

- [x] 4. API Server — project setup, database schema, and auth
  - [x] 4.1 Initialize the Fastify application
    - Set up Node.js 20 + TypeScript project with Fastify, Drizzle ORM, BullMQ, viem, and `@fastify/websocket`
    - Configure PostgreSQL connection and Redis connection
    - _Requirements: (infrastructure for all API requirements)_

  - [x] 4.2 Define Drizzle ORM schema
    - Create all six tables exactly as specified in the design: `users`, `wallet_actions`, `behavior_models`, `soul_nfts`, `agent_deployments`, `agent_actions`, `marketplace_transactions`
    - Include all indexes: `idx_wallet_actions_user_id`, `idx_wallet_actions_block_timestamp`, `idx_behavior_models_user_id`, `idx_agent_actions_agent_id`, `idx_agent_actions_created_at`, `idx_marketplace_transactions_token_id`
    - Generate and apply initial migration
    - _Requirements: 2.4, 3.7, 4.2, 5.6, 6.5, 8.7_

  - [x] 4.3 Implement SIWE authentication endpoints
    - `POST /auth/siwe/nonce` — generate and cache a nonce (Redis, 5-min TTL)
    - `POST /auth/siwe/verify` — verify SIWE signature, upsert `users` record (wallet_address + ENS name), return signed JWT (24-hour expiry)
    - `GET /users/me` — JWT-protected, return current user profile
    - JWT middleware applied to all protected routes returning 401 on absent/expired token
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ]* 4.4 Write fast-check property tests for authentication
    - **Property 1: Valid SIWE authentication round-trip** — generate random wallets, sign valid SIWE messages, verify JWT returned and `users` record contains wallet address
    - **Validates: Requirements 1.1, 1.5**
    - **Property 2: Invalid credentials always return 401** — generate invalid signatures, expired nonces, mismatched addresses; verify HTTP 401 for each; generate absent/expired JWTs, verify 401
    - **Validates: Requirements 1.2, 1.4**

  - [x] 4.5 Checkpoint — run `vitest run`; ensure auth tests pass

- [x] 5. API Server — on-chain indexing pipeline
  - [x] 5.1 Implement the transaction classifier
    - Pure function `classifyTransaction(rawTx): ActionType` returning exactly one of: `TRADE | GOVERNANCE_VOTE | DEFI_POSITION | NFT_PURCHASE | LIQUIDITY_MOVE | OTHER`
    - _Requirements: 2.3_

  - [ ]* 5.2 Write fast-check property tests for transaction classification
    - **Property 3: Transaction classification always returns a valid type** — generate random transaction data, verify output is always one of the six valid action types, never null, never unlisted
    - **Validates: Requirements 2.3**

  - [x] 5.3 Implement the IndexingWorker (BullMQ)
    - Full historical indexing: paginate 0G Chain RPC until full history fetched; classify and upsert each tx into `wallet_actions` (deduplicate by `tx_hash`)
    - Incremental indexing: detect new blocks within 30 seconds of confirmation for tracked wallets
    - Retry failed RPC calls up to 3 times with exponential backoff (1s, 2s, 4s); mark job FAILED after exhausting retries
    - Emit `indexing:status` and `indexing:complete` WebSocket events on progress and completion
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 5.4 Write fast-check property tests for indexing
    - **Property 4: Indexing idempotence** — generate random transaction sets, index twice, verify `wallet_actions` count equals single-index count (no duplicates)
    - **Validates: Requirements 2.5**
    - **Property 5: Indexing retry behavior** — mock RPC to fail N times then succeed; verify exactly 3 retries before FAILED, never fewer, never more
    - **Validates: Requirements 2.8**

  - [x] 5.5 Expose `GET /indexing/status` endpoint
    - Return current indexing status and progress for the authenticated user
    - _Requirements: 2.7_

  - [x] 5.6 Checkpoint — run `vitest run`; ensure indexing tests pass

- [x] 6. API Server — behavioral model pipeline
  - [x] 6.1 Implement the gRPC client for the ML Microservice
    - Generate TypeScript stubs from `proto/behavioral_model.proto`
    - Wrap `TrainModel` and `GetModelInfo` RPCs with retry logic (2 retries, 2s linear backoff); return 503 on exhaustion
    - _Requirements: 3.8_

  - [x] 6.2 Implement the ModelTrainingWorker (BullMQ)
    - Fetch all `wallet_actions` for the user; return 422 if fewer than 10 exist
    - Call ML Microservice via gRPC; receive vector, performance_score, model_version, dimensions
    - Upload model weights binary blob and metadata JSON to 0G Storage (retry up to 3 times, exponential backoff 1s/2s/4s); record returned CID
    - Persist new `behavior_models` record with incremented version, CID, performance_score, vector_dimensions, model_metadata
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7, 9.1, 9.6_

  - [x] 6.3 Implement `POST /models/train` and `GET /models/current` endpoints
    - `POST /models/train` — enqueue ModelTrainingWorker job; return 422 immediately if fewer than 10 actions
    - `GET /models/current` — return latest `behavior_models` record for the authenticated user
    - _Requirements: 3.6_

  - [ ]* 6.4 Write fast-check property tests for model pipeline
    - **Property 9: Insufficient data returns 422** — generate wallets with 0–9 actions, verify `POST /models/train` returns HTTP 422, never 200, never 500
    - **Validates: Requirements 3.6**
    - **Property 16: 0G Storage upload retry behavior** — mock 0G Storage to fail up to 3 times then succeed/fail; verify exactly 3 retries with exponential backoff
    - **Validates: Requirements 9.6**

  - [x] 6.5 Checkpoint — run `vitest run`; ensure model pipeline tests pass

- [x] 7. API Server — Guardian safety engine and agent decision loop
  - [x] 7.1 Implement the Guardian as a pure function module
    - `Guardian.evaluate(proposedAction, dailySpendSoFar): GuardianResult` enforcing all six rules:
      - Max transaction value $1,000 USD
      - Max daily spend $5,000 USD (rolling)
      - No unverified contracts
      - No honeypot-flagged contracts
      - Max slippage 3%
      - Min pool liquidity $50,000 USD
    - Return `{ allowed: boolean, reason?: string }` — never throws
    - _Requirements: 5.2, 5.3, 5.5_

  - [ ]* 7.2 Write fast-check property tests for the Guardian
    - **Property 11: Guardian always evaluates before execution** — verify `Guardian.evaluate` is called for every inference result in EXECUTE mode; no code path bypasses it
    - **Validates: Requirements 5.2**
    - **Property 12: Guardian safety rules enforcement** — for each of the 6 rules, generate actions violating only that rule; verify `guardian_blocked=true` and `was_executed=false` in every case
    - **Validates: Requirements 5.3, 5.5**
    - **Property 14: Low confidence score skips action** — generate confidence scores in [0, 0.599]; verify `was_executed=false` and no tx submitted
    - **Validates: Requirements 10.3**

  - [x] 7.3 Implement the AgentExecuteWorker and AgentSuggestWorker (BullMQ)
    - Fetch market context from 0G Chain RPC + price feeds
    - Retrieve model CID from `behavior_models`; submit (CID + context) to 0G Compute; parse `ActionRecommendation` (action_type, target_protocol, asset, amount, confidence_score)
    - Skip cycle if confidence_score < 0.6; log failure
    - Call `Guardian.evaluate`; if blocked: set `guardian_blocked=true`, `was_executed=false`, persist `agent_actions` record
    - EXECUTE mode: submit tx to 0G Chain; upload decision log to 0G Storage; record CID in `agent_actions`
    - SUGGEST mode: emit `agent:suggestion` WebSocket event; do not submit tx
    - OBSERVE mode: record activity only; never set `was_executed=true`; never emit suggestion
    - Handle 0G Compute timeout (30s): skip cycle, log failure, remain ready for next interval
    - _Requirements: 4.5, 4.6, 4.7, 5.1, 5.2, 5.4, 5.5, 5.6, 5.7, 5.8, 9.3, 10.1, 10.2, 10.3, 10.4_

  - [ ]* 7.4 Write fast-check property tests for agent decision loop
    - **Property 10: OBSERVE mode produces no executions** — generate arbitrary inference results; verify `was_executed=false` always and no WebSocket suggestion emitted in OBSERVE mode
    - **Validates: Requirements 4.7**
    - **Property 13: Agent action persistence completeness** — generate executed, blocked, and skipped actions; verify `confidence_score`, `decision_reasoning`, `was_executed`, `guardian_blocked`, `created_at` are always non-null; verify `tx_hash` and `og_decision_cid` non-null when executed
    - **Validates: Requirements 5.6, 5.7**
    - **Property 15: 0G Compute failure produces graceful skip** — mock 0G Compute to error or timeout; verify loop skips cycle without crashing and logs failure
    - **Validates: Requirements 5.8, 10.4**
    - **Property 26: Inference response parsing completeness** — generate valid and malformed 0G Compute responses; verify valid responses parse to complete `ActionRecommendation`; malformed responses are rejected with logged error
    - **Validates: Requirements 10.2**

  - [x] 7.5 Implement agent lifecycle endpoints
    - `POST /agents/deploy` — call AgentRegistry_Contract, persist `agent_deployments` record, enqueue decision loop worker
    - `GET /agents/current` — return current agent status
    - `PATCH /agents/current/mode` — update mode on-chain and in DB within 60 seconds
    - `DELETE /agents/current` — deactivate agent on-chain, halt decision loop
    - `GET /agents/current/actions` — paginated `agent_actions` log
    - _Requirements: 4.1, 4.2, 4.4, 4.8_

  - [x] 7.6 Implement the ArchiveWorker (BullMQ, weekly)
    - Compress weekly action history per wallet as gzip JSON; upload to 0G Storage at `archives/{walletAddress}/{weekISO}.json.gz`; record CID
    - _Requirements: 9.4_

  - [x] 7.7 Checkpoint — run `vitest run`; ensure Guardian and agent loop tests pass

- [x] 8. API Server — Soul NFT and marketplace endpoints
  - [x] 8.1 Implement Soul NFT mint preparation and sync
    - `POST /nfts/mint/prepare` — assemble mint tx params (CID, performanceScore, metadata); return to frontend for signing
    - On-chain `Transfer` event listener: persist `soul_nfts` record (token_id, model_id, og_storage_cid, initial rental/sale config)
    - On-chain `ModelUpdated` event listener: call `SoulNFT_Contract.updateModel` when user retrains; update `soul_nfts.og_storage_cid`
    - _Requirements: 6.1, 6.5, 6.7_

  - [x] 8.2 Implement marketplace endpoints
    - `GET /marketplace/listings` — return all active listings (join `soul_nfts` + `behavior_models`); support sort by `performanceScore` desc, `rentalPricePerDay` asc, `salePrice` asc
    - `GET /marketplace/listings/:tokenId` — return single listing detail
    - `POST /marketplace/rent` — record `marketplace_transactions` row (RENTAL_START) after on-chain confirmation
    - `POST /marketplace/buy` — record `marketplace_transactions` row (SALE) after on-chain confirmation
    - Sync listing state changes from on-chain events to `soul_nfts` table within 30 seconds
    - _Requirements: 7.5, 8.7, 13.2_

  - [ ]* 8.3 Write fast-check property tests for marketplace
    - **Property 28: Marketplace listing sort correctness** — generate random listing sets; apply each sort criterion; verify every adjacent pair satisfies the ordering (permutation of input)
    - **Validates: Requirements 13.2**
    - **Property 29: Rental cost calculation correctness** — fuzz `rentalPricePerDay = P` and duration `D`; verify total cost = `P × D` exactly, no rounding
    - **Validates: Requirements 8.1_

  - [x] 8.4 Checkpoint — run `vitest run`; ensure marketplace tests pass

- [x] 9. Frontend — design system, providers, and layout
  - [x] 9.1 Initialize Next.js 14 App Router project
    - Install wagmi v2, viem, RainbowKit, Zustand, Recharts, Framer Motion
    - Configure `app/layout.tsx` with wagmi + RainbowKit providers and global CSS (black `#000000` background, white `#FFFFFF` text, `#888888` secondary)
    - _Requirements: 16.1_

  - [x] 9.2 Implement the design system components
    - `<HorizontalBar>`: white fill on black bg, percentage label, `border-radius: 0`, no color fills
    - `<StatRow>`: label + value in monospace, sharp border-bottom
    - `<AgentModeLabel>`: uppercase monospace, white outline pill, no colored indicators
    - `<SharpCard>`: `border: 1px solid #FFFFFF`, `border-radius: 0`
    - `<FadeIn>`: Framer Motion opacity 0→1, y 8→0, 200ms
    - `<SlideUp>`: Framer Motion opacity 0→1, y 16→0, 300ms
    - Single monospace/geometric sans-serif typeface; hierarchy via weight and size only
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 9.3 Implement Zustand global store
    - Define `AppStore` slices: auth (address, jwt), indexing (status, progress), model (currentModel), agent (currentAgent, agentActions, pendingSuggestion), marketplace (listings)
    - _Requirements: (state management for all frontend requirements)_

  - [ ]* 9.4 Write Vitest + React Testing Library property tests for design system
    - **Property 27: Frontend renders horizontal bars, not radar charts** — generate random model dimension data; render dashboard, mint Step 1, and marketplace listing detail; verify component tree contains `<HorizontalBar>` and does NOT contain any radar/spider/polar chart component
    - **Validates: Requirements 11.2, 12.2, 16.3**

- [x] 10. Frontend — dashboard, SIWE auth, and WebSocket
  - [x] 10.1 Implement the landing page and SIWE authentication flow
    - `app/page.tsx`: RainbowKit connect button; on connect, call `POST /auth/siwe/nonce` then `POST /auth/siwe/verify`; store JWT in Zustand
    - _Requirements: 1.1, 1.3_

  - [x] 10.2 Implement the main dashboard (`app/dashboard/page.tsx`)
    - Display indexing status (PENDING / IN_PROGRESS / COMPLETE / FAILED) in real time via WebSocket (`indexing:status`, `indexing:complete` events)
    - When model exists: render six behavioral dimensions as `<HorizontalBar>` components with percentage labels; display plain-English personality summary; display 0G Storage proof panel (CID + verification link)
    - When agent deployed: display agent mode, last action timestamp, recent `agent_actions` log with reasoning
    - SUGGEST mode: display `agent:suggestion` WebSocket events in real time with approve/reject buttons
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 10.3 Checkpoint — run `vitest run`; ensure dashboard component tests pass

- [x] 11. Frontend — Soul NFT mint flow
  - [x] 11.1 Implement the three-step mint flow (`app/dashboard/mint/page.tsx`)
    - Step 1 — Review Model: `<HorizontalBar>` for each dimension, Performance_Score as large typographic number, top-3 behavioral traits as `<StatRow>` components — no radar chart
    - Step 2 — Set Preferences: form inputs for `isRentable`, `rentalPricePerDay`, `isForSale`, `salePrice`
    - Step 3 — Sign and Mint: call `POST /nfts/mint/prepare`; invoke wagmi `writeContract` to SoulNFT_Contract; on confirmation display success state with token_id and marketplace link
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 12. Frontend — agent control panel and marketplace
  - [x] 12.1 Implement the agent control panel (`app/dashboard/agent/page.tsx`)
    - Display current mode as `<AgentModeLabel>` (OBSERVE / SUGGEST / EXECUTE)
    - Mode change buttons calling `PATCH /agents/current/mode`
    - Deactivate button calling `DELETE /agents/current`
    - Paginated action log from `GET /agents/current/actions`
    - _Requirements: 4.3, 4.4, 4.8, 11.4_

  - [x] 12.2 Implement the marketplace listing grid (`app/marketplace/page.tsx`)
    - Grid of `<SharpCard>` components showing Performance_Score, rentalPricePerDay, salePrice, behavioral trait summary — monochromatic, no color fills, no radar charts
    - Sort controls: Performance_Score desc, rentalPricePerDay asc, salePrice asc
    - _Requirements: 13.1, 13.2_

  - [ ]* 12.3 Write fast-check property tests for marketplace sort
    - **Property 28: Marketplace listing sort correctness (frontend)** — generate random listing arrays; apply each sort; verify every adjacent pair satisfies the ordering
    - **Validates: Requirements 13.2**

  - [x] 12.4 Implement the listing detail page (`app/marketplace/[tokenId]/page.tsx`)
    - Behavioral dimension `<HorizontalBar>` components, backtest results, rent/buy action buttons
    - Rent flow: prompt for duration in days, display total cost (`rentalPricePerDay × days`), invoke wagmi `writeContract` to Marketplace_Contract
    - Buy flow: display salePrice, invoke wagmi `writeContract` to Marketplace_Contract
    - On confirmation: update listing state in real time, display confirmation message
    - _Requirements: 13.3, 13.4, 13.5, 13.6_

  - [x] 12.5 Checkpoint — run `vitest run`; ensure marketplace and agent panel tests pass

- [ ] 13. Final integration and wiring
  - [x] 13.1 Wire all BullMQ workers into the Fastify application startup
    - Register `IndexingWorker`, `ModelTrainingWorker`, `AgentExecuteWorker`, `AgentSuggestWorker`, `StorageUploadWorker`, `ArchiveWorker` with correct concurrency settings (5, 2, 10, 10, 5, 1)
    - Ensure first-time auth triggers indexing job enqueue
    - _Requirements: 2.1, 4.5, 4.6_

  - [x] 13.2 Wire WebSocket event emission across all workers
    - `IndexingWorker` → `indexing:status`, `indexing:complete`
    - `AgentSuggestWorker` → `agent:suggestion`
    - `AgentExecuteWorker` → `agent:executed`, `agent:blocked`
    - _Requirements: 2.7, 4.6, 5.4, 5.5, 11.1, 11.6_

  - [x] 13.3 Connect frontend WebSocket client to all server events
    - Subscribe to all five event types on dashboard mount; update Zustand store on each event
    - _Requirements: 11.1, 11.6_

  - [x] 13.4 Final checkpoint — run full test suite
    - Run `forge test --fuzz-runs 1000`, `vitest run` (API + frontend), `pytest --hypothesis-seed=0`
    - Ensure all tests pass; ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each phase boundary
- Property tests validate universal correctness properties (fast-check for TS, Hypothesis for Python, Foundry fuzz for Solidity)
- Unit/example tests validate specific scenarios and edge cases
- The Guardian (Task 7.1) is a pure function and the highest-value target for property-based testing — implement it before the agent workers
- Smart contract interactions always use viem's `simulateContract` before `writeContract` to catch reverts before spending gas
