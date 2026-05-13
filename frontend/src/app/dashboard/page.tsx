"use client";

/**
 * Main dashboard page.
 * Requirements: 11.1–11.6
 */

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import { HorizontalBar, StatRow, AgentModeLabel, SharpCard, FadeIn, SlideUp } from "@/components/ui";

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(str: string, n = 16) {
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

function formatScore(score: number | null) {
  if (score === null) return "—";
  return score.toFixed(1);
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter();
  const jwt = useAppStore((s) => s.jwt);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const indexingStatus = useAppStore((s) => s.indexingStatus);
  const indexingProgress = useAppStore((s) => s.indexingProgress);
  const totalActions = useAppStore((s) => s.totalActions);
  const currentModel = useAppStore((s) => s.currentModel);
  const currentAgent = useAppStore((s) => s.currentAgent);
  const agentActions = useAppStore((s) => s.agentActions);
  const pendingSuggestion = useAppStore((s) => s.pendingSuggestion);
  const setCurrentModel = useAppStore((s) => s.setCurrentModel);
  const setCurrentAgent = useAppStore((s) => s.setCurrentAgent);
  const setAgentActions = useAppStore((s) => s.setAgentActions);
  const setIndexingStatus = useAppStore((s) => s.setIndexingStatus);
  const setPendingSuggestion = useAppStore((s) => s.setPendingSuggestion);

  // Connect WebSocket
  useWebSocket();

  // Redirect if not authenticated
  useEffect(() => {
    if (!jwt) router.push("/");
  }, [jwt, router]);

  // Load data on mount
  useEffect(() => {
    if (!jwt) return;

    const load = async () => {
      try {
        const [statusRes, modelRes] = await Promise.allSettled([
          api.indexing.status(jwt),
          api.models.current(jwt),
        ]);

        if (statusRes.status === "fulfilled") {
          setIndexingStatus(
            statusRes.value.status as "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED",
            statusRes.value.progress,
            statusRes.value.totalActions
          );
        }

        if (modelRes.status === "fulfilled") {
          const m = modelRes.value;
          const meta = m.modelMetadata as Record<string, unknown> | null;
          const ds = meta?.dimensionScores as Record<string, number> | undefined;
          setCurrentModel({
            id: m.id,
            version: m.version,
            ogStorageCid: m.ogStorageCid,
            performanceScore: m.performanceScore,
            totalActionsTrained: m.totalActionsTrained,
            vectorDimensions: m.vectorDimensions,
            dimensionScores: ds ? {
              riskProfile: ds.riskProfile ?? 0,
              timingPatterns: ds.timingPatterns ?? 0,
              protocolPreferences: ds.protocolPreferences ?? 0,
              assetBehavior: ds.assetBehavior ?? 0,
              decisionContext: ds.decisionContext ?? 0,
              compositeScore: ds.compositeScore ?? 0,
            } : undefined,
            modelMetadata: m.modelMetadata,
          });
        }

        try {
          const agentRes = await api.agents.current(jwt);
          setCurrentAgent({
            id: agentRes.id,
            ogAgentId: agentRes.ogAgentId,
            mode: agentRes.mode as "OBSERVE" | "SUGGEST" | "EXECUTE",
            isActive: agentRes.isActive,
            actionsTaken: agentRes.actionsTaken,
            lastActionAt: agentRes.lastActionAt ?? undefined,
            deployedAt: agentRes.deployedAt ?? undefined,
          });

          const actionsRes = await api.agents.actions(jwt);
          setAgentActions((actionsRes.actions as Parameters<typeof setAgentActions>[0]));
        } catch {
          // No agent deployed yet — that's fine
        }
      } catch {
        // Silently handle load errors
      }
    };

    void load();
  }, [jwt, setCurrentModel, setCurrentAgent, setAgentActions, setIndexingStatus]);

  if (!jwt) return null;

  const dims = currentModel?.dimensionScores;

  return (
    <main style={{ maxWidth: "900px", margin: "0 auto", padding: "40px 20px" }}>
      {/* Header */}
      <FadeIn>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "48px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, letterSpacing: "-0.01em" }}>MIRRORMIND</h1>
            <p style={{ color: "var(--color-secondary)", fontSize: "11px", marginTop: "4px" }}>
              {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "—"}
            </p>
          </div>
          <nav style={{ display: "flex", gap: "24px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", alignItems: "center" }}>
            <Link href="/dashboard/agent">Agent</Link>
            <Link href="/dashboard/mint">Mint</Link>
            <Link href="/marketplace">Market</Link>
            <button
              onClick={() => {
                useAppStore.getState().clearAuth();
                router.push("/");
              }}
              style={{
                background: "none",
                border: "1px solid var(--color-border-dim)",
                color: "var(--color-secondary)",
                padding: "4px 8px",
                cursor: "pointer",
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.05em"
              }}
            >
              Logout
            </button>
          </nav>
        </div>
      </FadeIn>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Indexing status */}
          <SlideUp delay={0.05}>
            <SharpCard>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Indexing</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "22px", fontWeight: 700 }}>{totalActions.toLocaleString()}</span>
                <span style={{ fontSize: "11px", border: "1px solid var(--color-border-dim)", padding: "3px 8px" }}>
                  {indexingStatus}
                </span>
              </div>
              <HorizontalBar label="Progress" value={indexingProgress} />
              <p style={{ fontSize: "10px", color: "var(--color-secondary)" }}>on-chain actions indexed</p>
            </SharpCard>
          </SlideUp>

          {/* Behavioral model */}
          {currentModel && dims && (
            <SlideUp delay={0.1}>
              <SharpCard>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Behavioral Model</p>
                  <span style={{ fontSize: "28px", fontWeight: 700 }}>{formatScore(currentModel.performanceScore)}</span>
                </div>
                <HorizontalBar label="Risk Profile" value={dims.riskProfile} />
                <HorizontalBar label="Timing Patterns" value={dims.timingPatterns} />
                <HorizontalBar label="Protocol Prefs" value={dims.protocolPreferences} />
                <HorizontalBar label="Asset Behavior" value={dims.assetBehavior} />
                <HorizontalBar label="Decision Context" value={dims.decisionContext} />
                <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--color-border-dim)" }}>
                  <StatRow label="Version" value={`v${currentModel.version}`} />
                  <StatRow label="Actions trained" value={(currentModel.totalActionsTrained ?? 0).toLocaleString()} />
                  <StatRow label="Dimensions" value={currentModel.vectorDimensions ?? 512} />
                </div>
              </SharpCard>
            </SlideUp>
          )}

          {!currentModel && indexingStatus === "COMPLETE" && (
            <SlideUp delay={0.1}>
              <SharpCard>
                <p style={{ fontSize: "12px", color: "var(--color-secondary)", marginBottom: "16px" }}>No model trained yet.</p>
                <button
                  id="train-model-btn"
                  onClick={async () => {
                    if (!jwt) return;
                    const btn = document.getElementById("train-model-btn");
                    if (btn) btn.innerText = "TRAINING...";
                    try {
                      await api.models.train(jwt);
                      
                      // Poll for the completed model
                      const interval = setInterval(async () => {
                        try {
                          const modelRes = await api.models.current(jwt);
                          if (modelRes && modelRes.id) {
                            clearInterval(interval);
                            const m = modelRes;
                            const meta = m.modelMetadata as Record<string, unknown> | null;
                            const ds = meta?.dimensionScores as Record<string, number> | undefined;
                            useAppStore.getState().setCurrentModel({
                              id: m.id,
                              version: m.version,
                              ogStorageCid: m.ogStorageCid,
                              performanceScore: m.performanceScore,
                              totalActionsTrained: m.totalActionsTrained,
                              vectorDimensions: m.vectorDimensions,
                              dimensionScores: ds ? {
                                riskProfile: ds.riskProfile ?? 0,
                                timingPatterns: ds.timingPatterns ?? 0,
                                protocolPreferences: ds.protocolPreferences ?? 0,
                                assetBehavior: ds.assetBehavior ?? 0,
                                decisionContext: ds.decisionContext ?? 0,
                                compositeScore: ds.compositeScore ?? 0,
                              } : undefined,
                              modelMetadata: m.modelMetadata,
                            });
                          }
                        } catch {
                          // Ignore 404s while waiting
                        }
                      }, 3000);
                    } catch (err) {
                      if (btn) btn.innerText = "TRAINING FAILED";
                      console.error("Training failed", err);
                    }
                  }}
                  style={{ padding: "10px 20px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}
                >
                  TRAIN MODEL
                </button>
              </SharpCard>
            </SlideUp>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Agent status */}
          <SlideUp delay={0.15}>
            <SharpCard>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Agent</p>
              {currentAgent ? (
                <>
                  <div style={{ marginBottom: "16px" }}>
                    <AgentModeLabel mode={currentAgent.mode} />
                  </div>
                  <StatRow label="Actions taken" value={currentAgent.actionsTaken} />
                  {currentAgent.lastActionAt && (
                    <StatRow label="Last action" value={new Date(currentAgent.lastActionAt).toLocaleTimeString()} />
                  )}
                  <div style={{ marginTop: "12px" }}>
                    <Link href="/dashboard/agent" style={{ fontSize: "11px", textDecoration: "none", border: "1px solid var(--color-border-dim)", padding: "6px 12px" }}>
                      MANAGE →
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: "12px", color: "var(--color-secondary)", marginBottom: "16px" }}>No agent deployed.</p>
                  {currentModel && (
                    <Link href="/dashboard/agent" style={{ fontSize: "11px", textDecoration: "none", border: "1px solid var(--color-fg)", padding: "8px 16px" }}>
                      DEPLOY AGENT →
                    </Link>
                  )}
                </>
              )}
            </SharpCard>
          </SlideUp>

          {/* Pending suggestion */}
          {pendingSuggestion && (
            <SlideUp delay={0.2}>
              <SharpCard style={{ borderColor: "var(--color-fg)" }}>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>Agent Suggestion</p>
                <p style={{ fontSize: "13px", marginBottom: "8px" }}>
                  <strong>{pendingSuggestion.action.actionType}</strong> via {pendingSuggestion.action.protocol}
                </p>
                <p style={{ fontSize: "12px", color: "var(--color-secondary)", marginBottom: "16px" }}>
                  ${pendingSuggestion.action.amountUsd.toFixed(2)} · {(pendingSuggestion.confidence * 100).toFixed(0)}% confidence
                </p>
                <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginBottom: "16px", lineHeight: 1.6 }}>
                  {pendingSuggestion.reasoning.slice(0, 120)}…
                </p>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button onClick={() => setPendingSuggestion(null)} style={{ padding: "8px 16px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>APPROVE</button>
                  <button onClick={() => setPendingSuggestion(null)} style={{ padding: "8px 16px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", fontSize: "11px", cursor: "pointer" }}>REJECT</button>
                </div>
              </SharpCard>
            </SlideUp>
          )}

          {/* 0G Storage proof */}
          {currentModel && (
            <SlideUp delay={0.25}>
              <SharpCard>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>0G Storage Proof</p>
                <p style={{ fontSize: "11px", wordBreak: "break-all", color: "var(--color-secondary)", marginBottom: "12px" }}>
                  {truncate(currentModel.ogStorageCid, 40)}
                </p>
                <a
                  href={`https://storage.0g.ai/${currentModel.ogStorageCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "11px", textDecoration: "none", border: "1px solid var(--color-border-dim)", padding: "6px 12px" }}
                >
                  VERIFY ON 0G →
                </a>
              </SharpCard>
            </SlideUp>
          )}

          {/* Recent agent actions */}
          {agentActions.length > 0 && (
            <SlideUp delay={0.3}>
              <SharpCard>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Recent Actions</p>
                {agentActions.slice(0, 5).map((action) => (
                  <div key={action.id} style={{ paddingBottom: "12px", marginBottom: "12px", borderBottom: "1px solid var(--color-border-dim)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ fontSize: "12px", fontWeight: 700 }}>{action.actionType ?? "—"}</span>
                      <span style={{ fontSize: "10px", color: action.wasExecuted ? "var(--color-fg)" : "var(--color-secondary)" }}>
                        {action.guardianBlocked ? "BLOCKED" : action.wasExecuted ? "EXECUTED" : "SUGGESTED"}
                      </span>
                    </div>
                    {action.decisionReasoning && (
                      <p style={{ fontSize: "11px", color: "var(--color-secondary)", lineHeight: 1.5 }}>
                        {action.decisionReasoning.slice(0, 80)}…
                      </p>
                    )}
                  </div>
                ))}
              </SharpCard>
            </SlideUp>
          )}
        </div>
      </div>
    </main>
  );
}
