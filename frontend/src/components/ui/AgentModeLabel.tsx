"use client";

/**
 * AgentModeLabel — uppercase monospace text with white outline pill.
 * No colored status indicators.
 * Requirements: 16.6
 */

type AgentMode = "OBSERVE" | "SUGGEST";

interface AgentModeLabelProps {
  mode: AgentMode;
  size?: "sm" | "md";
}

export function AgentModeLabel({ mode, size = "md" }: AgentModeLabelProps) {
  const fontSize = size === "sm" ? "10px" : "12px";
  const padding = size === "sm" ? "3px 8px" : "5px 12px";

  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "var(--font-mono)",
        fontSize,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--color-fg)",
        border: "1px solid var(--color-fg)",
        borderRadius: 0,
        padding,
        lineHeight: 1,
      }}
    >
      {mode}
    </span>
  );
}
