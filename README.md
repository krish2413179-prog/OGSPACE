# MirrorMind

> Mirror your on-chain decision DNA as an autonomous agent on 0G Chain.

MirrorMind watches every on-chain action a wallet takes — trades, governance votes, DeFi positions, NFT purchases, and liquidity moves — and builds a behavioral fingerprint stored permanently on 0G Storage. An autonomous agent is then deployed with a persistent 0G Agent ID to act on the user's behalf using that behavioral model. Users may optionally mint their model as a Soul NFT (ERC-721) and list it on a marketplace where others can rent or buy the decision model and run it as their own agent.

Built for the **0G APAC Hackathon 2026**, targeting Track 1 (Agent Infrastructure) and Track 3 (Agentic Economy).

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
- [Docker + Docker Compose](https://docs.docker.com/get-docker/)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-org/mirrormind.git
cd mirrormind
```

### 2. Configure environment variables

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

Edit `.env` and `frontend/.env.local` with your actual values. See the [Environment Variables](#environment-variables) section for details.

### 3. Install dependencies

```bash
# Install Node.js dependencies (api + frontend workspaces)
npm install

# Install Python dependencies
cd ml && pip install -r requirements.txt && cd ..

# Install Foundry dependencies
cd contracts && forge install && cd ..
```

### 4. Start all services

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the API server, and the ML microservice.

### 5. Run database migrations

```bash
cd api && npm run db:migrate && cd ..
```

### 6. Start the frontend (development)

```bash
npm run dev:frontend
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
