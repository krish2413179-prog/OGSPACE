import type { Metadata } from "next";
import dynamic from "next/dynamic";
import "./globals.css";

export const metadata: Metadata = {
  title: "MirrorMind",
  description: "Mirror your on-chain decision DNA as an autonomous agent on 0G Chain.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🪞</text></svg>",
  },
};

// Load the entire provider tree client-side only.
// This prevents wagmi/RainbowKit/WalletConnect from running during SSR,
// which causes the "No QueryClient set" error.
const Providers = dynamic(
  () => import("./providers").then((mod) => mod.Providers),
  { ssr: false }
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
