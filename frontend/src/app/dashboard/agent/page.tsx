"use client";

/**
 * Agent control panel.
 * Requirements: 4.3, 4.4, 4.8, 11.4
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { AgentModeLabel, StatRow, SharpCard, FadeIn, SlideUp } from "@/components/ui";
import type { AgentMode } from "@/store/appStore";

const MODES: AgentMode[] = ["OBSERVE", "SUGGEST"];

export default function AgentPage() {
  const router = useRouter();
  const jwt = useAppStore((s) => s.jwt);
  const currentAgent = useAppStore((s) => s.currentAgent);
  const agentActions = useAppStore((s) => s.agentActions);
  const currentModel = useAppStore((s) => s.currentModel);
  const setCurrentAgent = useAppStore((s) => s.setCurrentAgent);
  const setAgentActions = useAppStore((s) => s.setAgentActions);

  const [isDeploying, setIsDeploying] = useState(false);
  const [isUpdatingMode, setIsUpdatingMode] = useState(false);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!jwt) router.push("/");
  }, [jwt, router]);

  // Load agent + actions
  useEffect(() => {
    if (!jwt) return;
    const load = async () => {
      try {
        const agentRes = await api.agents.current(jwt);
        setCurrentAgent({
          id: agentRes.id,
          ogAgentId: agentRes.ogAgentId,
          mode: agentRes.mode as AgentMode,
          activeModelId: (agentRes as any).activeModelId,
          isActive: agentRes.isActive,
          actionsTaken: agentRes.actionsTaken,
          lastActionAt: agentRes.lastActionAt ?? undefined,
          deployedAt: agentRes.deployedAt ?? undefined,
        });
        const actionsRes = await api.agents.actions(jwt, page);
        const typed = actionsRes as { actions: Parameters<typeof setAgentActions>[0]; pagination: { totalPages: number } };
        setAgentActions(typed.actions);
        setTotalPages(typed.pagination.totalPages);
      } catch {
        // No agent yet
      }
    };
    void load();
  }, [jwt, page, setCurrentAgent, setAgentActions]);

  const handleDeploy = async (mode: AgentMode) => {
    if (!jwt) return;
    setIsDeploying(true);
    setError(null);
    try {
      const res = await api.agents.deploy(jwt, mode);
      setCurrentAgent({ id: res.id, ogAgentId: res.ogAgentId, mode: res.mode as AgentMode, isActive: true, actionsTaken: 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setIsDeploying(false);
    }
  };

  const handleModeChange = async (newMode: AgentMode) => {
    if (!jwt || !currentAgent) return;
    setIsUpdatingMode(true);
    setError(null);
    try {
      await api.agents.updateMode(jwt, newMode);
      setCurrentAgent({ ...currentAgent, mode: newMode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mode update failed");
    } finally {
      setIsUpdatingMode(false);
    }
  };

  const handleDeactivate = async () => {
    if (!jwt) return;
    setIsDeactivating(true);
    setError(null);
    try {
      await api.agents.deactivate(jwt);
      setCurrentAgent(null);
      setAgentActions([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivation failed");
    } finally {
      setIsDeactivating(false);
    }
  };

  if (!jwt) return null;

  return (
    <main style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 20px" }}>
      <FadeIn>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <div>
            <Link href="/dashboard" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>← DASHBOARD</Link>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "20px", fontWeight: 400, marginTop: "8px", letterSpacing: "0.04em" }}>AGENT CONTROL</h1>
          </div>
          {currentAgent && <AgentModeLabel mode={currentAgent.mode} />}
        </div>

        {error && <p style={{ color: "var(--color-secondary)", fontSize: "12px", marginBottom: "16px" }}>{error}</p>}

        {/* No agent — deploy panel */}
        {!currentAgent && (
          <SlideUp>
            <SharpCard>
              <p style={{ fontSize: "12px", color: "var(--color-secondary)", marginBottom: "24px" }}>
                {currentModel ? "Deploy an agent powered by your behavioral model." : "Train a behavioral model before deploying an agent."}
              </p>
              {currentModel && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <p style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Select starting mode:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {MODES.map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleDeploy(mode)}
                        disabled={isDeploying}
                        style={{ padding: "16px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-fg)", textAlign: "left", cursor: "pointer" }}
                      >
                        <div style={{ fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>{mode}</div>
                        <div style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "none", fontWeight: 400 }}>
                          {mode === "OBSERVE" ? "Passive monitoring for behavioral retraining. No suggestions." : "Active market scanning for trade suggestions based on your model."}
                        </div>
                      </button>
                    ))}
                  </div>
                  {isDeploying && <p style={{ fontSize: "11px", color: "var(--color-secondary)" }}>Deploying…</p>}
                </div>
              )}
            </SharpCard>
          </SlideUp>
        )}

        {/* Active agent */}
        {currentAgent && (
          <>
            <SlideUp delay={0.05}>
              <SharpCard style={{ marginBottom: "24px" }}>
                <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Agent Status</p>
                <StatRow label="Agent ID" value={`${currentAgent.ogAgentId.slice(0, 20)}…`} />
                <StatRow label="Context" value={
                  <span style={{ 
                    fontSize: "9px", 
                    padding: "2px 6px", 
                    borderRadius: "4px", 
                    background: !currentAgent.activeModelId ? "rgba(15, 82, 186, 0.1)" : "rgba(147, 51, 234, 0.1)",
                    color: !currentAgent.activeModelId ? "var(--color-accent-primary)" : "#9333ea",
                    fontWeight: 700,
                    border: "1px solid currentColor"
                  }}>
                    {!currentAgent.activeModelId ? "OWN DNA" : "SNAPSHOT DNA"}
                  </span>
                } />
                <StatRow label="Mode" value={<AgentModeLabel mode={currentAgent.mode} size="sm" />} />
                <StatRow label="Actions taken" value={currentAgent.actionsTaken} />
                {currentAgent.lastActionAt && (
                  <StatRow label="Last action" value={new Date(currentAgent.lastActionAt).toLocaleString()} />
                )}
                {currentAgent.deployedAt && (
                  <StatRow label="Deployed" value={new Date(currentAgent.deployedAt).toLocaleDateString()} />
                )}

                {/* Mode toggle */}
                <div style={{ marginTop: "32px", borderTop: "1px solid var(--color-border-dim)", paddingTop: "24px" }}>
                  <p style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Update Agent Protocol:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {MODES.map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleModeChange(mode)}
                        disabled={isUpdatingMode || currentAgent.mode === mode}
                        style={{ 
                          padding: "16px", 
                          background: currentAgent.mode === mode ? "rgba(15, 82, 186, 0.05)" : "transparent", 
                          color: "var(--color-fg)", 
                          border: currentAgent.mode === mode ? "2px solid var(--color-accent-primary)" : "1px solid var(--color-border-dim)", 
                          textAlign: "left", 
                          cursor: "pointer",
                          opacity: isUpdatingMode ? 0.6 : 1,
                          position: "relative"
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                          <span style={{ fontWeight: 700, fontSize: "12px", color: currentAgent.mode === mode ? "var(--color-accent-primary)" : "var(--color-fg)" }}>{mode}</span>
                          {currentAgent.mode === mode && <span style={{ fontSize: "9px", fontWeight: 800, color: "var(--color-accent-primary)" }}>● ACTIVE</span>}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "none", fontWeight: 400, lineHeight: 1.4 }}>
                          {mode === "OBSERVE" 
                            ? "Passive monitoring of your wallet. Indexing data to retrain and sharpen your behavioral model." 
                            : "Active market scanning. Your agent will identify and suggest trades that align with your DNA."}
                        </div>
                      </button>
                    ))}
                  </div>
                  {isUpdatingMode && <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginTop: "12px" }}>Updating protocol…</p>}
                </div>

                {/* Deactivate */}
                <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--color-border-dim)" }}>
                  <button
                    onClick={handleDeactivate}
                    disabled={isDeactivating}
                    style={{ padding: "10px 20px", background: "transparent", color: "var(--color-secondary)", border: "1px solid var(--color-border-dim)", fontSize: "11px", cursor: "pointer", opacity: isDeactivating ? 0.6 : 1 }}
                  >
                    {isDeactivating ? "DEACTIVATING…" : "DEACTIVATE AGENT"}
                  </button>
                </div>
              </SharpCard>
            </SlideUp>

            {/* Action log */}
            {agentActions.length > 0 && (
              <SlideUp delay={0.1}>
                <SharpCard style={{ padding: "32px" }}>
                  <p style={{ fontSize: "10px", color: "var(--color-accent-primary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: "32px", textAlign: "center" }}>
                    — Decision Timeline —
                  </p>
                  
                  <div style={{ position: "relative" }}>
                    {/* Vertical Timeline Line */}
                    <div style={{ position: "absolute", left: "11px", top: "0", bottom: "0", width: "1px", background: "var(--color-border-dim)", zIndex: 0 }} />

                    {agentActions.map((action, i) => (
                      <div key={action.id} style={{ position: "relative", paddingLeft: "40px", marginBottom: "32px", zIndex: 1 }}>
                        {/* Timeline Dot */}
                        <div style={{ 
                          position: "absolute", 
                          left: "0", 
                          top: "4px", 
                          width: "24px", 
                          height: "24px", 
                          borderRadius: "50%", 
                          background: "var(--color-bg)", 
                          border: `2px solid ${action.guardianBlocked ? "#ef4444" : action.wasExecuted ? "var(--color-accent-primary)" : "var(--color-secondary)"}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "10px",
                          color: action.guardianBlocked ? "#ef4444" : action.wasExecuted ? "var(--color-accent-primary)" : "var(--color-secondary)"
                        }}>
                          {action.guardianBlocked ? "!" : i + 1}
                        </div>

                        <div style={{ background: "rgba(0,0,0,0.01)", padding: "16px", borderRadius: "8px", border: "1px solid var(--color-border-dim)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                            <div>
                              <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "20px", fontWeight: 400, color: "var(--color-fg)", margin: 0, letterSpacing: "0.02em" }}>
                                {action.actionType ?? "UNKNOWN ACTION"}
                              </h3>
                                <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginTop: "4px" }}>
                                  {action.createdAt ? new Date(action.createdAt).toLocaleString() : "—"}
                                </p>
                            </div>
                            
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              {action.confidenceScore !== null && (
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ fontSize: "10px", color: "var(--color-secondary)", marginBottom: "4px" }}>Confidence</div>
                                  <div style={{ width: "60px", height: "4px", background: "var(--color-border-dim)", borderRadius: "2px", overflow: "hidden" }}>
                                    <div style={{ width: `${(action.confidenceScore * 100)}%`, height: "100%", background: "var(--color-accent-primary)" }} />
                                  </div>
                                </div>
                              )}
                              
                              <span style={{ 
                                fontSize: "11px", 
                                fontWeight: 700,
                                letterSpacing: "0.05em",
                                padding: "6px 12px", 
                                borderRadius: "4px",
                                background: action.guardianBlocked ? "rgba(239, 68, 68, 0.1)" : action.wasExecuted ? "rgba(15, 82, 186, 0.1)" : "rgba(75, 85, 99, 0.1)",
                                color: action.guardianBlocked ? "#ef4444" : action.wasExecuted ? "var(--color-accent-primary)" : "var(--color-secondary)",
                                border: `1px solid currentColor`
                              }}>
                                {action.guardianBlocked ? "GUARDIAN BLOCKED" : action.wasExecuted ? "EXECUTED" : "SUGGESTED"}
                              </span>
                            </div>
                          </div>

                          {action.decisionReasoning && (
                            <p style={{ fontSize: "14px", color: "var(--color-fg)", lineHeight: 1.6, margin: "0 0 12px 0", fontWeight: 400 }}>
                              {action.decisionReasoning}
                            </p>
                          )}

                          {action.txHash && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "8px 12px", background: "var(--color-bg)", borderRadius: "4px", border: "1px solid var(--color-border-dim)" }}>
                              <span style={{ fontSize: "10px", color: "var(--color-secondary)", fontWeight: 600 }}>TX</span>
                              <code style={{ fontSize: "10px", color: "var(--color-accent-primary)", wordBreak: "break-all" }}>
                                {action.txHash}
                              </code>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px" }}>
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "8px 16px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", borderRadius: "4px", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--color-accent-primary)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--color-border-dim)"}>← Prev</button>
                      <span style={{ fontSize: "11px", color: "var(--color-secondary)", alignSelf: "center", fontWeight: 600 }}>{page} <span style={{ opacity: 0.5 }}>/</span> {totalPages}</span>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "8px 16px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", borderRadius: "4px", fontSize: "11px", cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--color-accent-primary)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--color-border-dim)"}>Next →</button>
                    </div>
                  )}
                </SharpCard>
              </SlideUp>
            )}
          </>
        )}
      </FadeIn>
    </main>
  );
}
