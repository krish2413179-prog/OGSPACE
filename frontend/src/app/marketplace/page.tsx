"use client";

/**
 * Marketplace listing grid.
 * Requirements: 13.1, 13.2
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { HorizontalBar, SharpCard, FadeIn, SlideUp } from "@/components/ui";
import type { MarketplaceListing } from "@/store/appStore";

type SortKey = "performanceScore" | "rentalPricePerDay" | "salePrice";

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("performanceScore");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    api.marketplace.listings(sortBy)
      .then((res) => setListings((res as { listings: MarketplaceListing[] }).listings))
      .catch(() => setListings([]))
      .finally(() => setIsLoading(false));
  }, [sortBy]);

  const sortedListings = [...listings].sort((a, b) => {
    if (sortBy === "rentalPricePerDay") {
      return parseFloat(a.rentalPricePerDay ?? "0") - parseFloat(b.rentalPricePerDay ?? "0");
    }
    if (sortBy === "salePrice") {
      return parseFloat(a.salePrice ?? "0") - parseFloat(b.salePrice ?? "0");
    }
    return parseFloat(b.performanceScore ?? "0") - parseFloat(a.performanceScore ?? "0");
  });

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
      <FadeIn>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "40px" }}>
          <div>
            <Link href="/dashboard" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>← DASHBOARD</Link>
            <h1 style={{ fontSize: "18px", fontWeight: 700, marginTop: "8px" }}>SOUL MARKETPLACE</h1>
            <p style={{ fontSize: "12px", color: "var(--color-secondary)", marginTop: "4px" }}>
              {listings.length} listing{listings.length !== 1 ? "s" : ""}
            </p>
          </div>

          {/* Sort controls */}
          <div style={{ display: "flex", gap: "8px" }}>
            {(["performanceScore", "rentalPricePerDay", "salePrice"] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                style={{
                  padding: "6px 12px",
                  background: sortBy === key ? "var(--color-fg)" : "transparent",
                  color: sortBy === key ? "var(--color-bg)" : "var(--color-fg)",
                  border: "1px solid var(--color-fg)",
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {key === "performanceScore" ? "SCORE" : key === "rentalPricePerDay" ? "RENT" : "SALE"}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>Loading listings…</p>}

        {!isLoading && listings.length === 0 && (
          <p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>No active listings yet.</p>
        )}

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {sortedListings.map((listing, i) => (
            <SlideUp key={listing.tokenId} delay={i * 0.03}>
              <Link href={`/marketplace/${listing.tokenId}`} style={{ textDecoration: "none" }}>
                <SharpCard style={{ cursor: "pointer" }}>
                  {/* Token ID + wallet */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px" }}>
                    <span style={{ fontSize: "11px", color: "var(--color-secondary)" }}>
                      #{listing.tokenId}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--color-secondary)" }}>
                      {listing.walletAddress.slice(0, 6)}…{listing.walletAddress.slice(-4)}
                    </span>
                  </div>

                  {/* Performance score */}
                  <div style={{ marginBottom: "16px" }}>
                    <span style={{ fontSize: "36px", fontWeight: 700 }}>
                      {parseFloat(listing.performanceScore ?? "0").toFixed(0)}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-secondary)", marginLeft: "6px" }}>/ 100</span>
                  </div>

                  {/* Mini dimension bars */}
                  {(listing.modelMetadata as any) && (() => {
                    const meta = listing.modelMetadata as Record<string, any>;
                    const ds = meta.dimensionScores as Record<string, number> | undefined;
                    if (!ds) return null;
                    return (
                      <div style={{ marginBottom: "16px" }}>
                        <HorizontalBar label="Risk" value={ds.riskProfile ?? 0} showPercent={false} />
                        <HorizontalBar label="Timing" value={ds.timingPatterns ?? 0} showPercent={false} />
                        <HorizontalBar label="Protocol" value={ds.protocolPreferences ?? 0} showPercent={false} />
                      </div>
                    );
                  })()}

                  {/* Pricing */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {listing.isRentable && listing.rentalPricePerDay && (
                      <span style={{ fontSize: "11px", border: "1px solid var(--color-border-dim)", padding: "3px 8px" }}>
                        {parseFloat(listing.rentalPricePerDay).toFixed(4)} ETH/day
                      </span>
                    )}
                    {listing.isForSale && listing.salePrice && (
                      <span style={{ fontSize: "11px", border: "1px solid var(--color-fg)", padding: "3px 8px" }}>
                        {parseFloat(listing.salePrice).toFixed(4)} ETH
                      </span>
                    )}
                  </div>

                  {listing.totalActionsTrained && (
                    <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "12px" }}>
                      {listing.totalActionsTrained.toLocaleString()} actions trained
                    </p>
                  )}
                </SharpCard>
              </Link>
            </SlideUp>
          ))}
        </div>
      </FadeIn>
    </main>
  );
}
