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
    <main style={{ minHeight: "100vh", position: "relative", overflow: "hidden" }}>
      {/* Decorative Orbs */}
      <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "50vw", height: "50vw", background: "radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%)", filter: "blur(60px)", zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: "60vw", height: "60vw", background: "radial-gradient(circle, rgba(139, 92, 246, 0.1) 0%, transparent 70%)", filter: "blur(80px)", zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
        <FadeIn>
          <div style={{ maxWidth: "800px", width: "100%", textAlign: "center" }}>
            
            {/* Hero Section */}
            <div style={{ marginBottom: "64px", animation: "float 6s ease-in-out infinite" }}>
              <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: "30px", border: "1px solid var(--color-border)", background: "var(--color-glass-bg)", marginBottom: "24px", fontSize: "12px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--color-accent-tertiary)", textTransform: "uppercase" }}>
                Powered by 0G Network
              </div>
              <h1 className="gradient-text" style={{ fontSize: "clamp(48px, 8vw, 84px)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, marginBottom: "24px" }}>
                MIRRORMIND
              </h1>
              <p style={{ color: "var(--color-secondary)", fontSize: "clamp(16px, 2vw, 20px)", lineHeight: 1.6, maxWidth: "600px", margin: "0 auto" }}>
                Mirror your on-chain decision DNA.<br />
                Deploy it as an autonomous AI agent that learns and acts on your behalf.
              </p>
            </div>

            {/* Authentication Glass Panel */}
            <SlideUp delay={0.1}>
              <div className="glass-panel" style={{ maxWidth: "400px", margin: "0 auto", padding: "40px 32px", display: "flex", flexDirection: "column", gap: "24px", alignItems: "center", position: "relative" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", padding: "2px", background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0))", WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)", WebkitMaskComposite: "xor", pointerEvents: "none" }} />
                
                <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px" }}>Enter the Swarm</h2>
                
                <ConnectButton />

                {isConnected && !jwt && (
                  <button
                    className="btn-primary"
                    onClick={signIn}
                    disabled={isLoading}
                    style={{ width: "100%", marginTop: "8px" }}
                  >
                    {isLoading ? "AUTHENTICATING..." : "SIGN IN TO DASHBOARD"}
                  </button>
                )}

                {error && (
                  <p style={{ color: "#ef4444", fontSize: "13px", marginTop: "8px" }}>{error}</p>
                )}
              </div>
            </SlideUp>

            {/* Feature Grid */}
            <SlideUp delay={0.2}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px", marginTop: "80px", textAlign: "left" }}>
                {[
                  { title: "INDEX", desc: "Every on-chain action, classified and stored instantly.", icon: "🔍" },
                  { title: "MODEL", desc: "512-dim behavioral fingerprint secured on 0G Storage.", icon: "🧠" },
                  { title: "AGENT", desc: "Autonomous execution powered by NVIDIA LLM intelligence.", icon: "🤖" },
                  { title: "MINT", desc: "Your decision DNA as a tradeable Soulbound NFT.", icon: "💎" },
                ].map((feat, i) => (
                  <div key={feat.title} className="glass-panel" style={{ padding: "24px", transition: "transform 0.3s ease, box-shadow 0.3s ease" }} onMouseEnter={(e) => e.currentTarget.style.transform = "translateY(-4px)"} onMouseLeave={(e) => e.currentTarget.style.transform = "translateY(0)"}>
                    <div style={{ fontSize: "32px", marginBottom: "16px" }}>{feat.icon}</div>
                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-fg)", marginBottom: "8px", letterSpacing: "0.1em" }}>{feat.title}</h3>
                    <p style={{ fontSize: "13px", color: "var(--color-secondary)", lineHeight: 1.6 }}>{feat.desc}</p>
                  </div>
                ))}
              </div>
            </SlideUp>

          </div>
        </FadeIn>
      </div>
    </main>
  );
}
