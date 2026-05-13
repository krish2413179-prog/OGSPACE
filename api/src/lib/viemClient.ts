import { createPublicClient, http, defineChain } from "viem";

// 0G Galileo Testnet (chainId: 16602)
const ogChain = defineChain({
  id: 16602,
  name: "0G Galileo Testnet",
  nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
  rpcUrls: {
    default: {
      http: [process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai"],
    },
  },
  blockExplorers: {
    default: {
      name: "0G Galileo Explorer",
      url: "https://chainscan-galileo.0g.ai",
    },
  },
  testnet: true,
});

export const ogClient = createPublicClient({
  chain: ogChain,
  transport: http(process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai"),
  batch: {
    multicall: true,
  },
});

// Verify connection and log chain ID on startup
ogClient.getChainId().then((id) => {
  console.log(`Indexer connected to Chain ID: ${id} (Target: 16602)`);
}).catch((err) => {
  console.error("Indexer failed to connect to 0G Chain:", err);
});
