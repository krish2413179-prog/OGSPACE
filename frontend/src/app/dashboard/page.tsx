"use client";

/**
 * Main dashboard page.
 * Requirements: 11.1–11.6
 */

import { useEffect, useState, useCallback } from "react";
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
  const selectedWalletAddress = useAppStore((s) => s.selectedWalletAddress);
  const setSelectedWalletAddress = useAppStore((s) => s.setSelectedWalletAddress);

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [analyzeTarget, setAnalyzeTarget] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState("");
  const [hideIndexingModal, setHideIndexingModal] = useState(false);

  // Connect WebSocket
  useWebSocket();

  // Redirect if not authenticated
  useEffect(() => {
    if (!jwt) router.push("/");
  }, [jwt, router]);

  const handleSwitchModel = useCallback(async (address: string | null, modelId: string | null) => {
    if (!jwt) return;
    try {
      await api.agents.updateModel(jwt, modelId);
      setSelectedWalletAddress(address);
      // Trigger reload
    } catch (err) {
      console.error("Failed to switch model", err);
    }
  }, [jwt, setSelectedWalletAddress]);

  // Load data on mount and when selected address changes
  useEffect(() => {
    if (!jwt || !walletAddress) return;

    const load = async () => {
      try {
        const [statusRes, snapshotsRes, agentRes] = await Promise.all([
          api.indexing.status(jwt),
          api.models.snapshots(jwt),
          api.agents.current(jwt).catch(() => null),
        ]);

        setIndexingStatus(
          statusRes.status as any,
          statusRes.progress,
          statusRes.totalActions
        );

        const allSnapshots = snapshotsRes.snapshots as any[];
        setSnapshots(allSnapshots);

        if (agentRes) {
          setCurrentAgent({
            id: agentRes.id,
            ogAgentId: agentRes.ogAgentId,
            mode: agentRes.mode as any,
            isActive: agentRes.isActive,
            actionsTaken: agentRes.actionsTaken,
            lastActionAt: agentRes.lastActionAt ?? undefined,
            deployedAt: agentRes.deployedAt ?? undefined,
          });

          const actionsRes = await api.agents.actions(jwt);
          setAgentActions((actionsRes.actions as any));
        }

        // Determine which model to display
        const activeAddress = selectedWalletAddress || walletAddress;
        
        if (activeAddress.toLowerCase() === walletAddress.toLowerCase()) {
          const modelRes = await api.models.current(jwt);
          const meta = modelRes.modelMetadata as any;
          const ds = meta?.dimensionScores || modelRes.dimensionScores;
          setCurrentModel({
            ...modelRes,
            dimensionScores: ds,
          } as any);
        } else {
          // Find matching snapshot
          const snap = allSnapshots.find(s => s.sourceAddress?.toLowerCase() === activeAddress.toLowerCase() || s.walletAddress?.toLowerCase() === activeAddress.toLowerCase());
          if (snap) {
            const ds = snap.dimensionScores;
            setCurrentModel({
              ...snap,
              dimensionScores: ds,
            } as any);
          }
        }
      } catch (err) {
        console.error("Dashboard load failed", err);
      }
    };

    void load();
  }, [jwt, walletAddress, selectedWalletAddress, setCurrentModel, setCurrentAgent, setAgentActions, setIndexingStatus]);

  const dims = currentModel?.dimensionScores;

  if (!jwt) return null;

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "64px 32px" }}>
      {/* Header */}
      <FadeIn>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "64px" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "32px", fontWeight: 400, letterSpacing: "0.02em" }}>MIRRORMIND</h1>
            <p style={{ color: "var(--color-secondary)", fontSize: "13px", marginTop: "4px", letterSpacing: "0.05em" }}>
              {walletAddress ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "—"}
            </p>
          </div>
          <nav style={{ display: "flex", gap: "24px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", alignItems: "center" }}>
            <Link href="/dashboard/agent">Agent</Link>
            <Link href="/dashboard/suggestions" style={{ position: "relative" }}>
              Suggestions
              {pendingSuggestion && (
                <span style={{ position: "absolute", top: "-6px", right: "-10px", width: "8px", height: "8px", background: "#ef4444", borderRadius: "50%", border: "2px solid var(--color-bg)" }} />
              )}
            </Link>
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

      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "40px" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Indexing status */}
          <SlideUp delay={0.05}>
            <SharpCard>
              <p style={{ fontSize: "12px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.15em", marginBottom: "16px" }}>Network Indexing</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "32px", fontWeight: 700 }}>{totalActions.toLocaleString()}</span>
                <span style={{ fontSize: "13px", border: "1px solid var(--color-border-dim)", padding: "4px 12px", fontWeight: 700 }}>
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
                    <div>
                      <p style={{ fontSize: "12px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.15em" }}>Behavioral Model Context</p>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                        <span style={{ 
                          fontSize: "11px", 
                          padding: "4px 10px", 
                          borderRadius: "4px", 
                          background: (selectedWalletAddress || walletAddress)?.toLowerCase() === walletAddress?.toLowerCase() ? "rgba(15, 82, 186, 0.1)" : "rgba(147, 51, 234, 0.1)",
                          color: (selectedWalletAddress || walletAddress)?.toLowerCase() === walletAddress?.toLowerCase() ? "var(--color-accent-primary)" : "#9333ea",
                          fontWeight: 700,
                          border: "1px solid currentColor"
                        }}>
                          {(selectedWalletAddress || walletAddress)?.toLowerCase() === walletAddress?.toLowerCase() ? "OWN DNA" : "SNAPSHOT DNA"}
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--color-secondary)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                          {(selectedWalletAddress || walletAddress)?.slice(0, 6)}…{(selectedWalletAddress || walletAddress)?.slice(-4)}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: "36px", fontWeight: 700 }}>{formatScore(currentModel.performanceScore)}</span>
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
                  {(selectedWalletAddress || walletAddress)?.toLowerCase() !== walletAddress?.toLowerCase() && (
                    <button
                      onClick={() => handleSwitchModel(walletAddress, null)}
                      style={{
                        width: "100%",
                        marginTop: "12px",
                        padding: "8px",
                        background: "var(--color-accent-primary)",
                        color: "white",
                        border: "none",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        cursor: "pointer",
                        borderRadius: "4px"
                      }}
                    >
                      RESET TO MY DNA
                    </button>
                  )}

                  {(selectedWalletAddress || walletAddress)?.toLowerCase() === walletAddress?.toLowerCase() && (
                    <button
                      id="retrain-btn"
                      onClick={async () => {
                        if (!jwt || !currentModel) return;
                        const btn = document.getElementById("retrain-btn");
                        if (btn) btn.innerText = "ENQUEUING...";
                        try {
                          await api.models.train(jwt);
                          if (btn) btn.innerText = "TRAINING...";
                          
                          const oldVersion = currentModel.version;
                          let attempts = 0;
                          const interval = setInterval(async () => {
                            attempts++;
                            if (attempts > 20) { // 60 seconds timeout
                              clearInterval(interval);
                              if (btn) btn.innerText = "FAILED";
                              setTimeout(() => { if (btn) btn.innerText = "RETRAIN MODEL"; }, 3000);
                              return;
                            }
                            try {
                              const modelRes = await api.models.current(jwt);
                              if (modelRes && modelRes.id && modelRes.version > oldVersion) {
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
                                if (btn) btn.innerText = "RETRAIN MODEL";
                              }
                            } catch {
                              // Ignore 404s or errors while waiting
                            }
                          }, 3000);
                        } catch (err) {
                          if (btn) btn.innerText = "FAILED";
                          setTimeout(() => { if (btn) btn.innerText = "RETRAIN MODEL"; }, 3000);
                        }
                      }}
                      style={{
                        width: "100%",
                        marginTop: "16px",
                        padding: "8px",
                        background: "transparent",
                        color: "var(--color-fg)",
                        border: "1px solid var(--color-border-dim)",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        cursor: "pointer"
                      }}
                    >
                      RETRAIN MODEL
                    </button>
                  )}
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
                    className="btn-primary"
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
                    style={{ width: "100%" }}
                  >
                    TRAIN MODEL
                  </button>
              </SharpCard>
            </SlideUp>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>

          {/* Analyze Any Wallet (TOP) */}
          <SlideUp delay={0.1}>
            <SharpCard style={{ border: "1px solid var(--color-accent-primary)", background: "var(--color-accent-glow)" }}>
              <p style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Analyze Any Wallet</p>
              <p style={{ fontSize: "11px", color: "var(--color-fg)", marginBottom: "16px" }}>
                Generate a one-time behavioral snapshot of any public address on 0G Galileo.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="0x..."
                  value={analyzeTarget}
                  onChange={(e) => setAnalyzeTarget(e.target.value)}
                  style={{
                    flex: 1,
                    background: "var(--color-bg)",
                    border: "1px solid var(--color-border-dim)",
                    color: "var(--color-fg)",
                    padding: "10px",
                    fontSize: "12px",
                    fontFamily: "var(--font-mono)",
                    borderRadius: "4px"
                  }}
                />
                <button
                  className="btn-primary"
                  onClick={async () => {
                    if (!jwt || !analyzeTarget) return;
                    setAnalyzing(true);
                    setAnalyzeError("");
                    try {
                      const res = await api.models.analyze(jwt, analyzeTarget);
                      const snapRes = await api.models.snapshots(jwt);
                      setSnapshots(snapRes.snapshots);
                      setAnalyzeTarget("");
                    } catch (err: any) {
                      setAnalyzeError(err.message || "Analysis failed");
                    } finally {
                      setAnalyzing(false);
                    }
                  }}
                  disabled={analyzing || !analyzeTarget}
                  style={{ padding: "0 20px" }}
                >
                  {analyzing ? "..." : "ANALYZE"}
                </button>
              </div>
              {analyzeError && (
                <p style={{ fontSize: "11px", color: "red", marginTop: "8px" }}>{analyzeError}</p>
              )}
            </SharpCard>
          </SlideUp>

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
                    <Link href="/dashboard/agent" style={{ fontSize: "13px", fontWeight: 700, textDecoration: "none", border: "1px solid var(--color-fg)", padding: "8px 16px" }}>
                      MANAGE AGENT →
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
              <SharpCard style={{ 
                borderColor: "var(--color-accent-primary)", 
                background: "linear-gradient(135deg, var(--color-accent-glow), rgba(15, 82, 186, 0.05))",
                boxShadow: "0 4px 20px rgba(15, 82, 186, 0.1)",
                cursor: "pointer"
              }} onClick={() => router.push("/dashboard/suggestions")}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <p style={{ fontSize: "12px", color: "var(--color-accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>Action Suggestion</p>
                  <span style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 700 }}>EVALUATE →</span>
                </div>
                <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "22px", fontWeight: 400, color: "var(--color-fg)", marginBottom: "8px" }}>
                  {pendingSuggestion.action.actionType} {pendingSuggestion.action.asset}
                </h3>
                <p style={{ fontSize: "13px", color: "var(--color-fg)", opacity: 0.8, marginBottom: "0", lineHeight: 1.5 }}>
                  {pendingSuggestion.reasoning.slice(0, 100)}...
                </p>
              </SharpCard>
            </SlideUp>
          )}

          {/* 0G Storage proof */}
          {currentModel && (
            <SlideUp delay={0.25}>
              <SharpCard style={{ position: "relative", overflow: "hidden", borderLeft: "4px solid var(--color-accent-primary)" }}>
                <div style={{ position: "absolute", top: 0, right: 0, padding: "8px", background: "rgba(15, 82, 186, 0.1)", color: "var(--color-accent-primary)", fontSize: "9px", fontWeight: 800, letterSpacing: "0.1em" }}>SECURED</div>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "12px" }}>0G Storage Proof</p>
                <div style={{ padding: "12px", background: "rgba(15, 82, 186, 0.03)", border: "1px solid var(--color-border-dim)", borderRadius: "4px", marginBottom: "16px", fontFamily: "var(--font-mono)", fontSize: "12px", wordBreak: "break-all", color: "var(--color-accent-primary)", fontWeight: 500 }}>
                  {currentModel.ogStorageCid}
                </div>
                <a
                  href={`https://storagescan-galileo.0g.ai/file/${currentModel.ogStorageCid}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary"
                  style={{ display: "block", textDecoration: "none", textAlign: "center", padding: "10px", fontSize: "11px", letterSpacing: "0.1em", background: "var(--color-accent-primary)", color: "white", border: "none", fontWeight: 700 }}
                >
                  VERIFY ON 0G SCAN →
                </a>
              </SharpCard>
            </SlideUp>
          )}


          {/* Snapshots List (Bottom of sidebar) */}
          {snapshots.length > 0 && (
            <SlideUp delay={0.4}>
              <SharpCard>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Saved Snapshots</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  {snapshots.map((snap) => (
                    <div key={snap.id} style={{ borderBottom: "1px solid var(--color-border-dim)", paddingBottom: "16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                        <div>
                          <p style={{ fontSize: "12px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                            {snap.sourceAddress.slice(0, 6)}…{snap.sourceAddress.slice(-4)}
                          </p>
                          <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "2px" }}>
                            {new Date(snap.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ fontSize: "14px", fontWeight: 700 }}>{formatScore(snap.performanceScore)}</p>
                          <span style={{ fontSize: "9px", border: "1px solid var(--color-border-dim)", padding: "2px 4px", textTransform: "uppercase" }}>SNAPSHOT</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                        <span style={{ fontSize: "11px", color: "var(--color-secondary)" }}>{snap.totalActionsTrained} txs</span>
                        {selectedWalletAddress?.toLowerCase() !== snap.sourceAddress?.toLowerCase() ? (
                          <button
                            onClick={() => handleSwitchModel(snap.sourceAddress, snap.id)}
                            style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 700, background: "transparent", border: "1px solid var(--color-accent-primary)", padding: "4px 8px", cursor: "pointer", borderRadius: "4px" }}
                          >
                            USE THIS DNA
                          </button>
                        ) : (
                          <span style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 700 }}>ACTIVE CONTEXT</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </SharpCard>
            </SlideUp>
          )}

        </div>
      </div>
      {/* Indexing Overlay Modal */}
      {(indexingStatus === "PENDING" || indexingStatus === "IN_PROGRESS") && !hideIndexingModal && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(4px)",
          display: "flex", flexDirection: "column",
          justifyContent: "center", alignItems: "center",
          zIndex: 9999
        }}>
          <div style={{
            background: "var(--color-bg-secondary)",
            border: "1px solid var(--color-accent-primary)",
            padding: "40px",
            width: "400px",
            maxWidth: "90%",
            textAlign: "center",
            position: "relative"
          }}>
            <button
              onClick={() => setHideIndexingModal(true)}
              style={{
                position: "absolute", top: "12px", right: "16px",
                background: "transparent", border: "none", color: "var(--color-secondary)",
                fontSize: "16px", cursor: "pointer", padding: "4px"
              }}
            >
              ✕
            </button>
            <h2 style={{ fontFamily: "var(--font-headline)", fontSize: "16px", fontWeight: 400, marginBottom: "16px", letterSpacing: "0.05em", textTransform: "uppercase", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", color: "var(--color-accent-primary)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ animation: "spin 1s linear infinite" }}>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 32" />
              </svg>
              Indexing in Progress
            </h2>
            <div style={{ marginBottom: "24px" }}>
              <span style={{ fontSize: "32px", fontWeight: 700 }}>{totalActions.toLocaleString()}</span>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "8px" }}>actions indexed on 0G Galileo</p>
            </div>
            <HorizontalBar label="Progress" value={indexingProgress} />
            <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "24px", lineHeight: 1.5 }}>
              Please wait while we securely sync your on-chain history. This provides the behavioral context for your AI Agent.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
