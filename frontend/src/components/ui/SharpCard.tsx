"use client";

/**
 * SharpCard — white border, zero border-radius, black background.
 * Requirements: 16.4
 */

interface SharpCardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function SharpCard({ children, className = "", style, onClick }: SharpCardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 0,
        background: "var(--color-bg)",
        padding: "20px",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
