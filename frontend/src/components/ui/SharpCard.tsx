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
      className={`glass-panel ${className}`}
      onClick={onClick}
      style={{
        padding: "24px",
        cursor: onClick ? "pointer" : undefined,
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        ...style,
      }}
      onMouseEnter={onClick ? (e) => e.currentTarget.style.transform = "translateY(-2px)" : undefined}
      onMouseLeave={onClick ? (e) => e.currentTarget.style.transform = "translateY(0)" : undefined}
    >
      {children}
    </div>
  );
}
