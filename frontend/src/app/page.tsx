"use client";

/**
 * Landing page — connect wallet + SIWE sign-in.
 * Requirements: 1.1, 1.3
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { FadeIn, SlideUp } from "@/components/ui";
import { useSiweAuth } from "@/hooks/useSiweAuth";
import { useAppStore } from "@/store/appStore";

export default function LandingPage() {
  const { isConnected } = useAccount();
  const { signIn, isLoading, error } = useSiweAuth();
  const jwt = useAppStore((s) => s.jwt);
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (jwt) router.push("/dashboard");
  }, [jwt, router]);

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <FadeIn>
        <div style={{ maxWidth: "480px", width: "100%", textAlign: "center" }}>
          {/* Logo / wordmark */}
          <div style={{ marginBottom: "48px" }}>
            <h1 style={{ fontSize: "32px", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: "12px" }}>
              MIRRORMIND
            </h1>
            <p style={{ color: "var(--color-secondary)", fontSize: "13px", lineHeight: 1.7 }}>
              Mirror your on-chain decision DNA.<br />
              Deploy it as an autonomous agent on 0G Chain.
            </p>
          </div>

          {/* Connect / Sign-in */}
          <SlideUp delay={0.1}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
              <ConnectButton />

              {isConnected && !jwt && (
                <button
                  onClick={signIn}
                  disabled={isLoading}
                  style={{
                    width: "100%",
                    padding: "12px 24px",
                    background: "var(--color-fg)",
                    color: "var(--color-bg)",
                    border: "1px solid var(--color-fg)",
                    borderRadius: 0,
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  {isLoading ? "SIGNING..." : "SIGN IN WITH ETHEREUM"}
                </button>
              )}

              {error && (
                <p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>{error}</p>
              )}
            </div>
          </SlideUp>

          {/* Feature list */}
          <SlideUp delay={0.2}>
            <div style={{ marginTop: "64px", textAlign: "left", borderTop: "1px solid var(--color-border-dim)", paddingTop: "32px" }}>
              {[
                ["INDEX", "Every on-chain action, classified and stored"],
                ["MODEL", "512-dim behavioral fingerprint on 0G Storage"],
                ["AGENT", "Autonomous agent that acts like you"],
                ["MINT", "Soul NFT — your decision DNA, tradeable"],
              ].map(([label, desc]) => (
                <div key={label} style={{ display: "flex", gap: "16px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-secondary)", minWidth: "60px", paddingTop: "2px" }}>{label}</span>
                  <span style={{ fontSize: "12px", color: "var(--color-fg)", lineHeight: 1.6 }}>{desc}</span>
                </div>
              ))}
            </div>
          </SlideUp>
        </div>
      </FadeIn>
    </main>
  );
}
