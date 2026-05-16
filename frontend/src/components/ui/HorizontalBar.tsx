"use client";

/**
 * HorizontalBar — white fill on black background, sharp corners, no color.
 * Used for all behavioral dimension visualizations.
 * Requirements: 16.3, 16.4
 */

import { motion } from "framer-motion";

interface HorizontalBarProps {
  label: string;
  value: number; // 0–100
  showPercent?: boolean;
  className?: string;
}

export function HorizontalBar({ label, value, showPercent = true, className = "" }: HorizontalBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`horizontal-bar ${className}`} style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
        <span style={{ fontSize: "11px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {label}
        </span>
        {showPercent && (
          <span style={{ fontSize: "11px", color: "var(--color-fg)", fontWeight: 700 }}>
            {clamped.toFixed(0)}
          </span>
        )}
      </div>
      {/* Track */}
      <div style={{ width: "100%", height: "6px", background: "var(--color-border-dim)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
        {/* Fill */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          style={{ 
            height: "100%", 
            background: "linear-gradient(90deg, var(--color-accent-primary), var(--color-accent-tertiary))", 
            borderRadius: "var(--radius-sm)",
          }}
        />
      </div>
    </div>
  );
}
