"use client";

/**
 * WebSocket hook — connects to the API server and dispatches events
 * to the Zustand store.
 * Requirements: 11.1, 11.6
 */

import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";

const WS_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001")
  .replace(/^http/, "ws");

export function useWebSocket() {
  const jwt = useAppStore((s) => s.jwt);
  const setIndexingStatus = useAppStore((s) => s.setIndexingStatus);
  const setPendingSuggestion = useAppStore((s) => s.setPendingSuggestion);
  const prependAgentAction = useAppStore((s) => s.prependAgentAction);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!jwt) return;

    const ws = new WebSocket(`${WS_URL}/ws?token=${jwt}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data as string) as { type: string; payload: unknown };

        switch (type) {
          case "indexing:status": {
            const p = payload as { status: string; progress: number };
            setIndexingStatus(p.status as "PENDING" | "IN_PROGRESS" | "COMPLETE" | "FAILED", p.progress);
            break;
          }
          case "indexing:complete": {
            const p = payload as { totalActions: number };
            setIndexingStatus("COMPLETE", 100, p.totalActions);
            break;
          }
          case "agent:suggestion": {
            setPendingSuggestion(payload as Parameters<typeof setPendingSuggestion>[0]);
            break;
          }
          case "agent:executed":
          case "agent:blocked": {
            const p = payload as { agentId: string; action?: { actionType: string }; txHash?: string };
            prependAgentAction({
              id: `ws-${Date.now()}`,
              actionType: p.action?.actionType ?? null,
              decisionReasoning: type === "agent:executed" ? `Executed: ${p.txHash ?? ""}` : "Blocked by Guardian",
              confidenceScore: null,
              wasExecuted: type === "agent:executed",
              guardianBlocked: type === "agent:blocked",
              txHash: (p as { txHash?: string }).txHash ?? null,
              ogDecisionCid: null,
              createdAt: new Date().toISOString(),
            });
            break;
          }
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => { /* silent */ };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [jwt, setIndexingStatus, setPendingSuggestion, prependAgentAction]);
}
