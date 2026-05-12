/**
 * 0G Chain definition — exported for use in hooks and components.
 * The wagmiConfig itself lives in providers.tsx (client-only).
 */

import { defineChain } from "viem";

export const ogChain = defineChain({
  id: 16600,
  name: "0G Chain",
  nativeCurrency: { decimals: 18, name: "0G", symbol: "OG" },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai"],
    },
  },
  blockExplorers: {
    default: { name: "0G Explorer", url: "https://chainscan-galileo.0g.ai" },
  },
});
