"use client";

/**
 * StatRow — label + value in monospace with sharp border-bottom.
 * Requirements: 16.2, 16.4
 */

interface StatRowProps {
  label: string;
  value: React.ReactNode;
  dim?: boolean;
}

export function StatRow({ label, value, dim = false }: StatRowProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: "1px solid var(--color-border-dim)",
        color: dim ? "var(--color-secondary)" : "var(--color-fg)",
      }}
    >
      <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-secondary)" }}>
        {label}
      </span>
      <span style={{ fontSize: "13px", fontWeight: 700 }}>{value}</span>
    </div>
  );
}
