"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { SharpCard, FadeIn, SlideUp, HorizontalBar } from "@/components/ui";

export default function SuggestionsPage() {
  const router = useRouter();
  const jwt = useAppStore((s) => s.jwt);
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion);
  const setPendingSuggestion = useAppStore((s) => s.setPendingSuggestion);
  const currentAgent = useAppStore((s) => s.currentAgent);
  const agentActions = useAppStore((s) => s.agentActions);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jwt) router.push("/");
  }, [jwt, router]);

  const handleAction = async (approved: boolean) => {
    if (!jwt) return;
    setIsProcessing(true);
    setError(null);
    try {
      // In a real app, this would call api.agents.decide(jwt, approved)
      await new Promise(r => setTimeout(r, 1000));
      setPendingSuggestion(null);
      router.push("/dashboard");
    } catch (err) {
      setError("Action failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!jwt) return null;

  const activeSuggestions = agentActions.filter(a => !a.wasExecuted && !a.guardianBlocked);

  return (
    <main style={{ maxWidth: "800px", margin: "0 auto", padding: "64px 20px" }}>
      <FadeIn>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <div>
            <Link href="/dashboard" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>← DASHBOARD</Link>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "24px", fontWeight: 400, marginTop: "8px", letterSpacing: "0.04em" }}>STRATEGIC SUGGESTIONS</h1>
          </div>
          <div style={{ textAlign: "right" }}>
             <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Active Agent</p>
             <p style={{ fontSize: "12px", fontWeight: 700 }}>{currentAgent?.ogAgentId.slice(0, 8)}…{currentAgent?.ogAgentId.slice(-4)}</p>
          </div>
        </div>

        {error && <p style={{ color: "#ef4444", fontSize: "12px", marginBottom: "20px" }}>{error}</p>}

        {/* Real-time Priority Intel */}
        {pendingSuggestion && (
          <div style={{ marginBottom: "64px" }}>
            <p style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "16px" }}>▶ PRIORITY INTEL (REAL-TIME)</p>
            <SlideUp>
              <SharpCard style={{ 
                padding: 0, 
                overflow: "hidden", 
                borderColor: "var(--color-accent-primary)",
                background: "linear-gradient(180deg, var(--color-bg), rgba(15, 82, 186, 0.05))",
                boxShadow: "0 20px 40px rgba(0,0,0,0.3)"
              }}>
                <div style={{ padding: "32px", borderBottom: "1px solid var(--color-border-dim)", background: "rgba(15, 82, 186, 0.08)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 800, padding: "4px 12px", background: "var(--color-accent-primary)", color: "white" }}>NEW SIGNAL</span>
                    <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--color-accent-primary)" }}>${pendingSuggestion.action.amountUsd.toLocaleString()}</span>
                  </div>
                  <h2 style={{ fontFamily: "var(--font-headline)", fontSize: "32px", fontWeight: 400, color: "var(--color-fg)", margin: 0 }}>
                    {pendingSuggestion.action.actionType} {pendingSuggestion.action.asset} via {pendingSuggestion.action.protocol}
                  </h2>
                </div>
                <div style={{ padding: "32px" }}>
                  <p style={{ fontSize: "15px", color: "var(--color-fg)", lineHeight: 1.8, marginBottom: "32px", opacity: 0.9 }}>
                    {pendingSuggestion.reasoning}
                  </p>
                  <div style={{ display: "flex", gap: "16px" }}>
                    <button onClick={() => handleAction(true)} style={{ flex: 2, padding: "16px", background: "var(--color-accent-primary)", color: "white", border: "none", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>EXECUTE STRATEGY</button>
                    <button onClick={() => handleAction(false)} style={{ flex: 1, padding: "16px", background: "transparent", color: "var(--color-secondary)", border: "1px solid var(--color-border-dim)", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>DISMISS</button>
                  </div>
                </div>
              </SharpCard>
            </SlideUp>
          </div>
        )}

        {/* Suggestion Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
          <p style={{ fontSize: "10px", color: "var(--color-secondary)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.2em" }}>Active Suggestion Feed ({activeSuggestions.length})</p>
          
          {activeSuggestions.length === 0 && !pendingSuggestion ? (
             <SharpCard style={{ textAlign: "center", padding: "64px 20px", opacity: 0.5 }}>
               <p style={{ fontSize: "12px" }}>NO ACTIVE SUGGESTIONS IN QUEUE</p>
             </SharpCard>
          ) : (
            activeSuggestions.map((action, idx) => (
              <SlideUp key={action.id} delay={idx * 0.1}>
                <SharpCard style={{ 
                  padding: "32px", 
                  borderLeft: "4px solid var(--color-accent-primary)",
                  background: "rgba(15, 82, 186, 0.02)"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                      <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "24px", fontWeight: 400, color: "var(--color-accent-primary)", margin: 0, letterSpacing: "0.02em" }}>{action.actionType}</h3>
                      <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginTop: "4px" }}>
                        SIGNAL DETECTED: {action.createdAt ? new Date(action.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <span style={{ fontSize: "10px", fontWeight: 800, padding: "4px 10px", border: "1px solid var(--color-accent-primary)", color: "var(--color-accent-primary)" }}>PENDING REVIEW</span>
                  </div>
                  
                  <p style={{ fontSize: "15px", color: "var(--color-fg)", lineHeight: 1.7, marginBottom: "24px", opacity: 0.9 }}>
                    {action.decisionReasoning}
                  </p>

                  <div style={{ display: "flex", gap: "12px" }}>
                    <button onClick={() => handleAction(true)} style={{ padding: "10px 24px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>APPROVE</button>
                    <button onClick={() => handleAction(false)} style={{ padding: "10px 24px", background: "transparent", color: "var(--color-secondary)", border: "1px solid var(--color-border-dim)", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>DISMISS</button>
                  </div>
                </SharpCard>
              </SlideUp>
            ))
          )}
        </div>
      </FadeIn>
    </main>
  );
}
