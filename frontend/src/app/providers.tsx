"use client";

import { useState } from "react";
import { RainbowKitProvider, darkTheme, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "wagmi";
import { defineChain } from "viem";
import "@rainbow-me/rainbowkit/styles.css";

const bwTheme = darkTheme({
  accentColor: "#ffffff",
  accentColorForeground: "#000000",
  borderRadius: "none",
  fontStack: "system",
  overlayBlur: "none",
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [config] = useState(() => {
    // Everything that touches WalletConnect/wagmi must be inside useState
    // so it only runs on the client, never during SSR module evaluation.
    const ogChain = defineChain({
      id: 16602,
      name: "0G Galileo Testnet",
      nativeCurrency: { decimals: 18, name: "0G", symbol: "0G" },
      rpcUrls: {
        default: {
          http: ["https://evmrpc-testnet.0g.ai"],
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

    return getDefaultConfig({
      appName: "MirrorMind",
      projectId: "18fc5d1a50893fafdc02e3247b781c4a",
      chains: [ogChain],
      transports: {
        [ogChain.id]: http("https://evmrpc-testnet.0g.ai"),
      },
      ssr: false,
    });
  });

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
      })
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={bwTheme}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
