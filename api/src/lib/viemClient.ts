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
});
