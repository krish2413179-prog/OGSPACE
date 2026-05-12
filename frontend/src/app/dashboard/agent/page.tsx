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

const MODES: AgentMode[] = ["OBSERVE", "SUGGEST", "EXECUTE"];

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
            <h1 style={{ fontSize: "18px", fontWeight: 700, marginTop: "8px" }}>AGENT CONTROL</h1>
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
                  <div style={{ display: "flex", gap: "12px" }}>
                    {MODES.map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleDeploy(mode)}
                        disabled={isDeploying}
                        style={{ flex: 1, padding: "12px 8px", background: mode === "OBSERVE" ? "var(--color-fg)" : "transparent", color: mode === "OBSERVE" ? "var(--color-bg)" : "var(--color-fg)", border: "1px solid var(--color-fg)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", cursor: "pointer", opacity: isDeploying ? 0.6 : 1 }}
                      >
                        {mode}
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
                <StatRow label="Mode" value={<AgentModeLabel mode={currentAgent.mode} size="sm" />} />
                <StatRow label="Actions taken" value={currentAgent.actionsTaken} />
                {currentAgent.lastActionAt && (
                  <StatRow label="Last action" value={new Date(currentAgent.lastActionAt).toLocaleString()} />
                )}
                {currentAgent.deployedAt && (
                  <StatRow label="Deployed" value={new Date(currentAgent.deployedAt).toLocaleDateString()} />
                )}

                {/* Mode toggle */}
                <div style={{ marginTop: "24px" }}>
                  <p style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "12px" }}>Change mode:</p>
                  <div style={{ display: "flex", gap: "8px" }}>
                    {MODES.map((mode) => (
                      <button
                        key={mode}
                        onClick={() => handleModeChange(mode)}
                        disabled={isUpdatingMode || currentAgent.mode === mode}
                        style={{
                          flex: 1,
                          padding: "10px 4px",
                          background: currentAgent.mode === mode ? "var(--color-fg)" : "transparent",
                          color: currentAgent.mode === mode ? "var(--color-bg)" : "var(--color-fg)",
                          border: "1px solid var(--color-fg)",
                          fontSize: "10px",
                          fontWeight: 700,
                          letterSpacing: "0.08em",
                          cursor: currentAgent.mode === mode ? "default" : "pointer",
                          opacity: isUpdatingMode ? 0.6 : 1,
                        }}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
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
                <SharpCard>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Action Log</p>
                  {agentActions.map((action) => (
                    <div key={action.id} style={{ paddingBottom: "16px", marginBottom: "16px", borderBottom: "1px solid var(--color-border-dim)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700 }}>{action.actionType ?? "—"}</span>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {action.confidenceScore !== null && (
                            <span style={{ fontSize: "10px", color: "var(--color-secondary)" }}>{(action.confidenceScore * 100).toFixed(0)}%</span>
                          )}
                          <span style={{ fontSize: "10px", border: "1px solid var(--color-border-dim)", padding: "2px 6px" }}>
                            {action.guardianBlocked ? "BLOCKED" : action.wasExecuted ? "EXECUTED" : "SUGGESTED"}
                          </span>
                        </div>
                      </div>
                      {action.decisionReasoning && (
                        <p style={{ fontSize: "11px", color: "var(--color-secondary)", lineHeight: 1.5 }}>
                          {action.decisionReasoning.slice(0, 120)}
                        </p>
                      )}
                      {action.txHash && (
                        <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "4px", wordBreak: "break-all" }}>
                          tx: {action.txHash.slice(0, 20)}…
                        </p>
                      )}
                    </div>
                  ))}

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "8px" }}>
                      <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "6px 12px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", fontSize: "11px", cursor: "pointer" }}>←</button>
                      <span style={{ fontSize: "11px", color: "var(--color-secondary)", alignSelf: "center" }}>{page} / {totalPages}</span>
                      <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "6px 12px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", fontSize: "11px", cursor: "pointer" }}>→</button>
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
