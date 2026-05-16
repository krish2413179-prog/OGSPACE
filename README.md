# MirrorMind

> Mirror your on-chain decision DNA as an autonomous agent on 0G Chain.

MirrorMind watches every on-chain action a wallet takes — trades, governance votes, DeFi positions, NFT purchases, and liquidity moves — and builds a behavioral fingerprint stored permanently on 0G Storage. An autonomous agent is then deployed with a persistent 0G Agent ID to act on the user's behalf using that behavioral model. Users may optionally mint their model as a Soul NFT (ERC-721) and list it on a marketplace where others can rent or buy the decision model and run it as their own agent.

Built for the **0G APAC Hackathon 2026**, targeting Track 1 (Agent Infrastructure) and Track 3 (Agentic Economy).

---

## Strategic Agent Modes

MirrorMind agents operate in a dual-mode strategic framework designed for high-fidelity mirroring and actionable market intelligence:

*   **OBSERVE Mode**: The agent passively monitors the user's wallet. It indexes on-chain actions to continuously retrain and sharpen the behavioral model (DNA) on 0G Storage. This ensures the agent's decision logic stays perfectly aligned with the user's evolving trading style.
*   **SUGGEST Mode**: The agent actively monitors global market conditions and DeFi protocols. It identifies high-confidence trading opportunities that match the user's historical risk/reward DNA and pushes them to a dedicated **Suggestions Feed** for human review and one-click execution.

This dual-mode approach prioritizes **human-in-the-loop** intelligence over blind automation, leveraging the 0G Chain for verifiable agent state and decisions.

---

## Architecture

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
│  │   decision logs) │  └──────────────────┘  └────────────────┘  │
│  └──────────────────┘                                             │
└───────────────────────────────────────────────────────────────────┘
         ▲
┌────────┴──────────────────────────────────────────────────────────┐
│                  Frontend (Next.js 14 App Router)                  │
│  wagmi v2 + viem + RainbowKit │ Zustand │ Recharts │ Framer Motion │
└───────────────────────────────────────────────────────────────────┘
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity ^0.8.24, Foundry |
| API Server | Node.js 20, TypeScript, Fastify, Drizzle ORM |
| ML Microservice | Python 3.11, FastAPI, gRPC, PyTorch |
| Frontend | Next.js 14 App Router, wagmi v2, RainbowKit |
| Database | PostgreSQL 16 |
| Queue | Redis 7 + BullMQ |
| Storage | 0G Storage (decentralized) |
| Compute | 0G Compute (decentralized inference) |

---
## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Python 3.11+](https://www.python.org/)
- [Foundry](https://book.getfoundry.sh/getting-started/installation)

---

## Deployment Guide (Zero-Cost / No Credit Card)

This project is optimized for deployment using free tiers that do not require a credit card.

### 1. Databases
*   **PostgreSQL:** Use [Neon.tech](https://neon.tech/). Copy your `DATABASE_URL`.
*   **Redis:** Use [Upstash.com](https://upstash.com/). Copy your `REDIS_URL`.

### 2. Backend (Render)
Deploy as two separate **Web Services**:

**API Service:**
- **Build Command:** `npm install && npm run build --workspace=api`
- **Start Command:** `npm run start --workspace=api`
- **Env Vars:** Add `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `OG_RPC_URL`.

**ML Service:**
- **Build Command:** `pip install -r ml/requirements.txt`
- **Start Command:** `python ml/main.py`
- **Env Vars:** Set `PORT=8000`.

### 3. Frontend (Vercel)
- Connect repo, select `frontend` folder.
- **Env Vars:** Set `NEXT_PUBLIC_API_URL` to your Render API URL.

---

## Local Development (Terminal)

1. **Install dependencies:** `npm install`
2. **Setup .env:** Use the cloud database URLs in your local `.env`.
3. **Run all:** `npm run dev:all`

---

## Development

### Running tests

```bash
# Smart contract tests (Foundry fuzz, 1000 runs)
cd contracts && forge test --fuzz-runs 1000

# API server tests (Vitest)
cd api && npm run test

# ML microservice tests (Pytest + Hypothesis)
cd ml && pytest --hypothesis-seed=0

# Frontend tests (Vitest + React Testing Library)
cd frontend && npm run test
```

### Running individual services

```bash
# API server (hot reload)
npm run dev:api

# Frontend (hot reload)
npm run dev:frontend

# ML microservice
cd ml && uvicorn main:app --reload --port 8000
```

---

## Environment Variables

### Root `.env`

| Variable | Description |
|----------|-------------|
| `OG_RPC_URL` | 0G Chain EVM RPC endpoint |
| `OG_STORAGE_RPC` | 0G Storage RPC endpoint |
| `OG_COMPUTE_URL` | 0G Compute endpoint |
| `OG_CHAIN_ID` | 0G Chain ID (mainnet: 16600) |
| `BACKEND_PRIVATE_KEY` | Private key for backend wallet (agent transactions) |
| `SOUL_NFT_ADDRESS` | Deployed SoulNFT contract address |
| `MARKETPLACE_ADDRESS` | Deployed SoulMarketplace contract address |
| `AGENT_REGISTRY_ADDRESS` | Deployed AgentRegistry contract address |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `JWT_SECRET` | Secret for signing JWTs (min 32 chars) |
| `SIWE_DOMAIN` | Domain for SIWE messages (e.g. `app.mirrormind.xyz`) |
| `ML_SERVICE_GRPC_URL` | gRPC address of ML microservice |
| `ALCHEMY_API_KEY` | Alchemy API key for RPC fallback |
| `ETHERSCAN_API_KEY` | Etherscan API key for contract verification |

### `frontend/.env.local`

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | API server base URL |
| `NEXT_PUBLIC_OG_CHAIN_ID` | 0G Chain ID for wagmi config |
| `NEXT_PUBLIC_SOUL_NFT_ADDRESS` | SoulNFT contract address |
| `NEXT_PUBLIC_MARKETPLACE_ADDRESS` | SoulMarketplace contract address |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |

---

## Smart Contract Deployment

```bash
cd contracts

# Deploy to 0G Chain mainnet
forge script script/Deploy.s.sol \
  --rpc-url $OG_RPC_URL \
  --private-key $BACKEND_PRIVATE_KEY \
  --broadcast \
  --verify
```

---

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `contracts.yml` | PR to main | `forge test --fuzz-runs 1000` |
| `backend.yml` | PR to main | `npm ci && vitest run` |
| `backend.yml` | Push to main (passing) | Deploy to Railway |
| `ml.yml` | PR to main | `pip install && pytest --hypothesis-seed=0` |
| `frontend.yml` | PR to main | `npm ci && vitest run` |
| `frontend.yml` | Push to main (passing) | Deploy to Vercel |

---

## License

MIT
