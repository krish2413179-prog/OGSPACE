# Requirements Document

## Introduction

MirrorMind is a full-stack production AI agent system built for the 0G APAC Hackathon 2026. It watches every on-chain action a wallet takes — trades, governance votes, DeFi positions, NFT purchases, and liquidity moves — and builds a behavioral fingerprint stored permanently on 0G Storage. An autonomous agent is then deployed with a persistent 0G Agent ID to act on the user's behalf using that behavioral model. Users may optionally mint their model as a Soul NFT (ERC-721) and list it on a marketplace where others can rent or buy the decision model and run it as their own agent.

The system covers 0G Hackathon Track 1 (agent infrastructure) and Track 3 (agentic economy), targeting full production deployment on 0G Chain mainnet.

---

## Glossary

- **MirrorMind**: The overall system described in this document.
- **Wallet**: An Ethereum-compatible externally owned account (EOA) identified by its address.
- **Behavioral Model**: A 512-dimensional feature vector representing a wallet's on-chain decision patterns, computed by the ML Microservice and stored on 0G Storage.
- **Soul NFT**: An ERC-721 token minted by a user that contains a pointer (CID) to their Behavioral Model on 0G Storage.
- **Agent**: An autonomous on-chain actor registered in AgentRegistry.sol with a persistent 0G Agent ID, linked to a Soul NFT and operating in one of three modes: OBSERVE, SUGGEST, or EXECUTE.
- **0G Storage**: The decentralized storage layer of the 0G network used to persist Behavioral Model weights, Soul NFT metadata, action history archives, and agent decision logs.
- **0G Compute**: The decentralized compute layer of the 0G network used to run real-time inference on a Behavioral Model given a CID.
- **0G Agent ID**: A persistent on-chain identity assigned to each deployed Agent on the 0G network.
- **0G Chain**: The EVM-compatible blockchain network on which all MirrorMind smart contracts are deployed.
- **Indexer**: The backend service that listens to 0G Chain RPC events and records wallet actions into the database.
- **ML Microservice**: A Python FastAPI service that computes Behavioral Model vectors from indexed wallet action sequences.
- **API Server**: The Node.js Fastify backend that exposes REST and WebSocket endpoints to the Frontend.
- **Frontend**: The Next.js 14 web application through which users interact with MirrorMind.
- **Guardian**: The safety rule engine embedded in the Agent decision loop that enforces spending and risk limits.
- **Marketplace**: The on-chain and off-chain system through which Soul NFTs are listed, rented, and purchased.
- **SIWE**: Sign-In with Ethereum — the authentication mechanism used to verify wallet ownership.
- **JWT**: JSON Web Token issued by the API Server after successful SIWE authentication.
- **CID**: Content Identifier — the unique address of a file stored on 0G Storage.
- **BullMQ**: The Redis-backed job queue used by the API Server to schedule and process background tasks.
- **Drizzle ORM**: The TypeScript ORM used by the API Server to interact with PostgreSQL.
- **SoulNFT_Contract**: The deployed instance of SoulNFT.sol on 0G Chain.
- **Marketplace_Contract**: The deployed instance of SoulMarketplace.sol on 0G Chain.
- **AgentRegistry_Contract**: The deployed instance of AgentRegistry.sol on 0G Chain.
- **Performance_Score**: A numeric score (0–100) computed by the ML Microservice representing the backtested quality of a Behavioral Model over the last 30 days.

---

## Requirements

### Requirement 1: Wallet Authentication

**User Story:** As a user, I want to sign in with my Ethereum wallet, so that MirrorMind can securely identify me and associate my on-chain data with my account.

#### Acceptance Criteria

1. WHEN a user submits a valid SIWE message and signature, THE API Server SHALL verify the signature, create or retrieve the corresponding user record, and return a signed JWT valid for 24 hours.
2. WHEN a user submits an invalid or expired SIWE signature, THE API Server SHALL return an HTTP 401 response with a descriptive error message.
3. WHEN a JWT is included in a request header and has not expired, THE API Server SHALL authenticate the request without requiring re-signing.
4. WHEN a JWT is absent or expired, THE API Server SHALL return an HTTP 401 response.
5. THE API Server SHALL store the wallet address and ENS name (if resolvable) in the `users` table upon first successful authentication.

---

### Requirement 2: On-Chain Action Indexing

**User Story:** As a user, I want MirrorMind to index all of my historical on-chain activity, so that my Behavioral Model reflects my complete decision history.

#### Acceptance Criteria

1. WHEN a user authenticates for the first time, THE Indexer SHALL enqueue a full historical indexing job for the user's wallet address via BullMQ.
2. WHEN the indexing job executes, THE Indexer SHALL retrieve all transactions for the wallet from the 0G Chain RPC, paginating until the full history is fetched.
3. WHEN a transaction is retrieved, THE Indexer SHALL classify it as one of the following action types: TRADE, GOVERNANCE_VOTE, DEFI_POSITION, NFT_PURCHASE, LIQUIDITY_MOVE, or OTHER.
4. WHEN a transaction is classified, THE Indexer SHALL persist it to the `wallet_actions` table with fields: tx_hash, action_type, protocol, asset_in, asset_out, amount_usd, block_number, block_timestamp, and raw_data (JSONB).
5. THE Indexer SHALL deduplicate transactions by tx_hash so that re-indexing does not create duplicate records.
6. WHEN a new block is confirmed on 0G Chain, THE Indexer SHALL detect and index any new transactions from tracked wallet addresses within 30 seconds of block confirmation.
7. WHEN the indexing job completes, THE API Server SHALL update the user's indexing status to COMPLETE and emit a WebSocket event to any connected Frontend sessions for that user.
8. IF the 0G Chain RPC returns an error during indexing, THEN THE Indexer SHALL retry the failed request up to 3 times with exponential backoff before marking the job as FAILED.

---

### Requirement 3: Behavioral Model Computation

**User Story:** As a user, I want MirrorMind to compute a behavioral fingerprint from my on-chain history, so that an agent can replicate my decision-making style.

#### Acceptance Criteria

1. WHEN a user requests model training and at least 10 wallet actions exist for that wallet, THE ML Microservice SHALL compute a 512-dimensional Behavioral Model vector from the indexed action sequence.
2. THE ML Microservice SHALL partition the 512-dimensional vector into the following segments: Risk Profile (64 dimensions), Timing Patterns (64 dimensions), Protocol Preferences (128 dimensions), Asset Behavior (128 dimensions), and Decision Context (128 dimensions).
3. WHEN the Behavioral Model is computed, THE ML Microservice SHALL backtest the model against the wallet's last 30 days of actions and produce a Performance_Score between 0 and 100.
4. WHEN the Behavioral Model is computed, THE API Server SHALL upload the model weights and metadata to 0G Storage and record the returned CID in the `behavior_models` table.
5. WHEN a new Behavioral Model version is stored, THE API Server SHALL increment the version number for that wallet's model record.
6. IF fewer than 10 wallet actions exist for a wallet, THEN THE API Server SHALL return an HTTP 422 response indicating insufficient data for model training.
7. WHEN the model is stored on 0G Storage, THE API Server SHALL record the CID, version, performance_score, and vector_dimensions in the `behavior_models` table.
8. THE ML Microservice SHALL expose a gRPC endpoint that the API Server calls to initiate training and retrieve the resulting vector and Performance_Score.

---

### Requirement 4: Agent Deployment and Lifecycle

**User Story:** As a user, I want to deploy an autonomous agent linked to my Behavioral Model, so that it can observe, suggest, or execute on-chain actions on my behalf.

#### Acceptance Criteria

1. WHEN a user requests agent deployment and a Behavioral Model exists for their wallet, THE API Server SHALL call AgentRegistry_Contract to register a new Agent with a 0G Agent ID and link it to the user's Soul NFT (if minted) or model CID.
2. WHEN an Agent is registered, THE API Server SHALL persist the og_agent_id, soul_token_id (nullable), mode, and status to the `agent_deployments` table.
3. THE AgentRegistry_Contract SHALL support three agent modes: OBSERVE, SUGGEST, and EXECUTE.
4. WHEN a user changes the agent mode, THE API Server SHALL call AgentRegistry_Contract to update the mode and reflect the change in the `agent_deployments` table within 60 seconds.
5. WHEN the Agent is in EXECUTE mode, THE Agent SHALL run its decision loop every 5 minutes.
6. WHEN the Agent is in SUGGEST mode, THE Agent SHALL run its decision loop every 15 minutes and emit suggestions via WebSocket without executing transactions.
7. WHEN the Agent is in OBSERVE mode, THE Agent SHALL record on-chain activity without generating suggestions or executing transactions.
8. WHEN a user deactivates their Agent, THE API Server SHALL call AgentRegistry_Contract to mark the Agent as inactive and halt the decision loop.

---

### Requirement 5: Agent Decision Loop

**User Story:** As a user, I want my deployed agent to make decisions using my Behavioral Model and enforce safety limits, so that it acts like me but never exceeds my risk tolerance.

#### Acceptance Criteria

1. WHEN the Agent decision loop executes, THE Agent SHALL fetch the current market context, retrieve the Behavioral Model CID from 0G Storage, and submit the context to 0G Compute for inference.
2. WHEN 0G Compute returns an inference result, THE Guardian SHALL evaluate the proposed action against all safety rules before allowing execution.
3. THE Guardian SHALL enforce the following safety rules: maximum transaction value of $1,000 USD, maximum daily spend of $5,000 USD, no interactions with unverified contracts, no interactions with contracts flagged as honeypots, maximum slippage of 3%, and minimum pool liquidity of $50,000 USD.
4. WHEN a proposed action passes all Guardian safety rules and the Agent is in EXECUTE mode, THE Agent SHALL submit the transaction to 0G Chain and record the result in the `agent_actions` table.
5. WHEN a proposed action fails any Guardian safety rule, THE Agent SHALL log the violation reason, skip execution, and record the blocked action in the `agent_actions` table with was_executed set to false.
6. WHEN the Agent executes or skips an action, THE Agent SHALL store the decision_reasoning, confidence_score, was_executed, and user_overrode fields in the `agent_actions` table.
7. WHEN the Agent executes a transaction, THE Agent SHALL upload the decision log to 0G Storage and record the returned CID in the `agent_actions` table.
8. IF 0G Compute is unavailable during a decision loop cycle, THEN THE Agent SHALL skip the cycle, log the failure, and retry on the next scheduled interval.

---

### Requirement 6: Soul NFT Minting

**User Story:** As a user, I want to mint my Behavioral Model as a Soul NFT, so that I can own, prove, and optionally monetize my decision DNA on-chain.

#### Acceptance Criteria

1. WHEN a user initiates minting and a Behavioral Model exists for their wallet, THE API Server SHALL prepare the mint transaction parameters including the 0G Storage CID, Performance_Score, and model metadata.
2. WHEN the user signs and submits the mint transaction, THE SoulNFT_Contract SHALL mint exactly one Soul NFT to the user's wallet address.
3. THE SoulNFT_Contract SHALL enforce a maximum of one Soul NFT per wallet address, rejecting any second mint attempt with a descriptive revert reason.
4. WHEN a Soul NFT is minted, THE SoulNFT_Contract SHALL store the following ModelMetadata on-chain: totalActions, trainingTimestamp, performanceScore, isRentable (default false), rentalPricePerDay (default 0), isForSale (default false), and salePrice (default 0).
5. WHEN a Soul NFT is minted, THE API Server SHALL record the token_id, model_id, og_storage_cid, and initial rental/sale configuration in the `soul_nfts` table.
6. WHEN the tokenURI function is called on SoulNFT_Contract, THE SoulNFT_Contract SHALL return a URI pointing to the Soul NFT metadata stored on 0G Storage.
7. WHEN a user updates their Behavioral Model, THE API Server SHALL call SoulNFT_Contract to update the CID pointer and trainingTimestamp for the user's existing Soul NFT.

---

### Requirement 7: Soul NFT Marketplace — Listing

**User Story:** As a Soul NFT owner, I want to list my model for rent or sale on the marketplace, so that others can use my decision DNA and I can earn revenue.

#### Acceptance Criteria

1. WHEN a Soul NFT owner calls the rental listing function and provides a valid rentalPricePerDay greater than 0, THE Marketplace_Contract SHALL mark the Soul NFT as rentable and record the price.
2. WHEN a Soul NFT owner calls the sale listing function and provides a valid salePrice greater than 0, THE Marketplace_Contract SHALL create a SaleListing record and mark the Soul NFT as for sale.
3. WHEN a Soul NFT owner cancels a rental listing, THE Marketplace_Contract SHALL mark the Soul NFT as not rentable and clear the rentalPricePerDay.
4. WHEN a Soul NFT owner cancels a sale listing, THE Marketplace_Contract SHALL remove the SaleListing record and mark the Soul NFT as not for sale.
5. THE API Server SHALL reflect all listing state changes in the `soul_nfts` table within 30 seconds of the on-chain event being emitted.

---

### Requirement 8: Soul NFT Marketplace — Renting and Buying

**User Story:** As a buyer or renter, I want to rent or purchase a Soul NFT from the marketplace, so that I can run another wallet's behavioral model as my own agent.

#### Acceptance Criteria

1. WHEN a user rents a Soul NFT and provides payment equal to rentalPricePerDay multiplied by the requested rental duration in days, THE Marketplace_Contract SHALL create a RentalLease record with a start timestamp and expiry timestamp.
2. WHEN a user purchases a Soul NFT listed for sale and provides payment equal to the salePrice, THE Marketplace_Contract SHALL transfer ownership of the Soul NFT to the buyer and remove the SaleListing.
3. WHEN a transaction occurs on the Marketplace_Contract, THE Marketplace_Contract SHALL deduct a platform fee of 2.5% from the payment and transfer the remainder to the seller or lessor.
4. WHEN a RentalLease is active, THE Marketplace_Contract SHALL return true from the isLeaseActive function for the corresponding token_id and renter address.
5. WHEN a RentalLease expires, THE Marketplace_Contract SHALL return false from the isLeaseActive function.
6. WHEN a seller or lessor calls withdrawEarnings, THE Marketplace_Contract SHALL transfer all accumulated earnings to the caller's wallet address.
7. WHEN a marketplace transaction completes, THE API Server SHALL record the transaction type (SALE, RENTAL_START, or RENTAL_END), token_id, buyer/renter address, amount, and timestamp in the `marketplace_transactions` table.
8. IF a user attempts to rent a Soul NFT that is not marked as rentable, THEN THE Marketplace_Contract SHALL revert with a descriptive error message.
9. IF a user attempts to purchase a Soul NFT that has no active SaleListing, THEN THE Marketplace_Contract SHALL revert with a descriptive error message.

---

### Requirement 9: 0G Storage Integration

**User Story:** As a user, I want my Behavioral Model and agent decision logs to be stored permanently on 0G Storage, so that my agent always has access to its brain regardless of backend availability.

#### Acceptance Criteria

1. WHEN a Behavioral Model is computed, THE API Server SHALL upload the model weights as a binary blob to 0G Storage and receive a CID in response.
2. WHEN Soul NFT metadata is prepared for minting, THE API Server SHALL upload the metadata JSON to 0G Storage and use the returned CID as the tokenURI base.
3. WHEN an Agent executes or evaluates an action, THE Agent SHALL upload the decision log JSON to 0G Storage and record the CID in the `agent_actions` table.
4. WHEN action history archives are generated (weekly), THE API Server SHALL upload the compressed action history for each wallet to 0G Storage and record the CID.
5. WHEN the API Server retrieves a Behavioral Model for inference, THE API Server SHALL fetch the model by CID from 0G Storage and pass the CID to 0G Compute.
6. IF a 0G Storage upload fails, THEN THE API Server SHALL retry the upload up to 3 times with exponential backoff before returning an error to the caller.

---

### Requirement 10: 0G Compute Integration

**User Story:** As a user, I want agent decisions to be computed using 0G Compute with my stored model, so that inference is decentralized and verifiable.

#### Acceptance Criteria

1. WHEN the Agent decision loop requires an inference result, THE Agent SHALL submit the Behavioral Model CID and current market context payload to 0G Compute.
2. WHEN 0G Compute returns an inference result, THE Agent SHALL parse the result into a structured action recommendation containing action_type, target_protocol, asset, amount, and confidence_score.
3. WHEN 0G Compute returns an inference result, THE Agent SHALL use the confidence_score to determine whether to proceed: scores below 0.6 SHALL result in the action being skipped.
4. IF 0G Compute returns an error or times out after 30 seconds, THEN THE Agent SHALL skip the current decision cycle and log the failure.

---

### Requirement 11: Frontend Dashboard

**User Story:** As a user, I want a dashboard that shows my indexing status, behavioral traits, and agent activity, so that I can understand and control my MirrorMind agent.

#### Acceptance Criteria

1. WHEN a user authenticates via the Frontend, THE Frontend SHALL display the wallet's indexing status (PENDING, IN_PROGRESS, COMPLETE, or FAILED) in real time using a WebSocket connection.
2. WHEN indexing is complete and a Behavioral Model exists, THE Frontend SHALL render the six behavioral dimensions (Risk Profile, Timing Patterns, Protocol Preferences, Asset Behavior, Decision Context, and composite score) as a set of horizontal progress bars with percentage labels, styled in a monochromatic black-and-white theme — no radar or spider charts.
3. WHEN a Behavioral Model exists, THE Frontend SHALL display a plain-English personality summary generated from the model's dimension scores.
4. WHEN an Agent is deployed, THE Frontend SHALL display the agent's current mode, last action timestamp, and a log of recent agent actions with reasoning.
5. THE Frontend SHALL display a 0G Storage proof panel showing the CID of the current Behavioral Model and a link to verify it on 0G Storage.
6. WHEN the Agent emits a suggestion in SUGGEST mode, THE Frontend SHALL display the suggestion in real time via WebSocket and allow the user to approve or reject it.

---

### Requirement 12: Frontend Soul NFT Mint Flow

**User Story:** As a user, I want a guided three-step minting flow, so that I can review my model, configure preferences, and mint my Soul NFT without confusion.

#### Acceptance Criteria

1. THE Frontend SHALL present the Soul NFT mint flow as exactly three sequential steps: Step 1 — Review Model, Step 2 — Set Preferences, Step 3 — Sign and Mint.
2. WHEN the user is on Step 1, THE Frontend SHALL display the Behavioral Model dimension scores as horizontal stat bars, the Performance_Score as a large typographic number, and a summary of the top 3 behavioral traits as labeled text rows — no radar chart.
3. WHEN the user is on Step 2, THE Frontend SHALL allow the user to configure initial isRentable, rentalPricePerDay, isForSale, and salePrice preferences before minting.
4. WHEN the user is on Step 3, THE Frontend SHALL invoke the wallet signing flow via wagmi and submit the mint transaction to SoulNFT_Contract.
5. WHEN the mint transaction is confirmed on-chain, THE Frontend SHALL display a success state with the minted token_id and a link to the Soul NFT on the Marketplace.

---

### Requirement 13: Frontend Marketplace

**User Story:** As a user, I want to browse, rent, and buy Soul NFTs on the marketplace, so that I can discover and deploy other wallets' behavioral models as my own agent.

#### Acceptance Criteria

1. THE Frontend SHALL display all active Soul NFT listings in a grid layout, showing Performance_Score, rentalPricePerDay, salePrice, and a behavioral trait summary for each listing — all styled in a monochromatic black-and-white theme with no color fills or radar charts.
2. THE Frontend SHALL allow users to sort listings by Performance_Score (descending), rentalPricePerDay (ascending), and salePrice (ascending).
3. WHEN a user selects a Soul NFT listing, THE Frontend SHALL display a detail modal with the behavioral dimension stat bars, backtest results, and rent/buy action buttons.
4. WHEN a user initiates a rent action, THE Frontend SHALL prompt for rental duration in days, calculate the total cost, and invoke the wallet signing flow to call Marketplace_Contract.
5. WHEN a user initiates a buy action, THE Frontend SHALL display the salePrice and invoke the wallet signing flow to call Marketplace_Contract.
6. WHEN a rent or buy transaction is confirmed on-chain, THE Frontend SHALL update the listing state in real time and display a confirmation message.

---

### Requirement 16: Frontend Visual Design System

**User Story:** As a user, I want a consistent, high-contrast visual design across the entire application, so that the interface feels premium and focused.

#### Acceptance Criteria

1. THE Frontend SHALL use a strict monochromatic color palette: pure black (`#000000`) backgrounds, pure white (`#FFFFFF`) text and borders, and mid-grey (`#888888`) for secondary labels and muted elements — no color accents.
2. THE Frontend SHALL use a single monospace or geometric sans-serif typeface throughout, with typographic hierarchy achieved through font weight and size rather than color.
3. THE Frontend SHALL render all data visualizations (behavioral dimensions, performance scores, indexing progress) as horizontal bar components with white fill on black background — radar charts SHALL NOT be used anywhere in the application.
4. THE Frontend SHALL use sharp rectangular borders (no border-radius) on cards, modals, and input fields to reinforce the editorial aesthetic.
5. THE Frontend SHALL use Framer Motion for subtle entrance animations (fade-in, slide-up) that do not introduce color — all animation states SHALL remain within the black-and-white palette.
6. THE Frontend SHALL display agent mode status (OBSERVE / SUGGEST / EXECUTE) as uppercase monospace text labels with a white outline pill — no colored status indicators.

---

### Requirement 14: Smart Contract Security and Deployment

**User Story:** As a developer, I want all smart contracts to be secure and deployable via Foundry to 0G Chain mainnet, so that the system is production-ready for the hackathon.

#### Acceptance Criteria

1. THE SoulNFT_Contract SHALL implement the ERC-721 standard with a tokenURI function that returns a URI constructed from the 0G Storage CID.
2. THE Marketplace_Contract SHALL use a reentrancy guard on all functions that transfer ETH or tokens.
3. THE AgentRegistry_Contract SHALL restrict the recordAction function so that only the registered Agent address for a given og_agent_id may call it.
4. WHEN any smart contract function is called by an unauthorized address, THE contract SHALL revert with a descriptive error message.
5. THE SoulNFT_Contract, Marketplace_Contract, and AgentRegistry_Contract SHALL each be deployable via a Foundry deployment script targeting the 0G Chain mainnet RPC.
6. THE SoulNFT_Contract SHALL implement the ERC-4337 account abstraction interface to support agent wallet operations.

---

### Requirement 15: CI/CD and Deployment Infrastructure

**User Story:** As a developer, I want automated CI/CD pipelines and containerized deployment, so that the system can be reliably built, tested, and deployed.

#### Acceptance Criteria

1. THE system SHALL include a GitHub Actions workflow that runs Foundry tests (`forge test`) on every pull request targeting the main branch.
2. THE system SHALL include a GitHub Actions workflow that runs the TypeScript backend test suite on every pull request targeting the main branch.
3. THE system SHALL include a Docker Compose configuration that starts the API Server, ML Microservice, PostgreSQL, and Redis with a single command.
4. WHEN the main branch receives a passing commit, THE GitHub Actions workflow SHALL deploy the API Server to Railway and the Frontend to Vercel automatically.
5. THE system SHALL include environment variable templates (`.env.example`) for all services documenting required configuration keys without exposing secret values.
