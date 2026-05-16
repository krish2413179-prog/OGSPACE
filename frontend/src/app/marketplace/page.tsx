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
type ViewMode = "listed" | "all";

export default function MarketplacePage() {
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [allNfts, setAllNfts] = useState<any[]>([]);
  const [sortBy, setSortBy] = useState<SortKey>("performanceScore");
  const [viewMode, setViewMode] = useState<ViewMode>("listed");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      api.marketplace.listings(sortBy)
        .then((res) => setListings((res as { listings: MarketplaceListing[] }).listings))
        .catch(() => setListings([])),
      // Also probe the first 10 token IDs to show all minted souls
      Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          api.marketplace.listing(i + 1).catch(() => null)
        )
      ).then((results) => {
        const found = results
          .filter((r) => r.status === "fulfilled" && (r as PromiseFulfilledResult<any>).value)
          .map((r) => (r as PromiseFulfilledResult<any>).value);
        setAllNfts(found);
      }),
    ]).finally(() => setIsLoading(false));
  }, [sortBy]);

  const baseItems = viewMode === "listed" ? listings : allNfts;
  const sortedItems = [...baseItems].sort((a: any, b: any) => {
    if (sortBy === "rentalPricePerDay")
      return parseFloat(a.rentalPricePerDay ?? "0") - parseFloat(b.rentalPricePerDay ?? "0");
    if (sortBy === "salePrice")
      return parseFloat(a.salePrice ?? "0") - parseFloat(b.salePrice ?? "0");
    return parseFloat(b.performanceScore ?? "0") - parseFloat(a.performanceScore ?? "0");
  });

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "40px 20px" }}>
      <FadeIn>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "32px" }}>
          <div>
            <Link href="/dashboard" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>
              ← Dashboard
            </Link>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "24px", fontWeight: 400, marginTop: "8px", color: "var(--color-fg)", letterSpacing: "0.02em" }}>
              Soul Marketplace
            </h1>
            <p style={{ fontSize: "13px", color: "var(--color-secondary)", marginTop: "4px" }}>
              Trade and rent on-chain behavioral intelligence
            </p>
          </div>

          {/* Sort controls */}
          <div style={{ display: "flex", gap: "8px" }}>
            {(["performanceScore", "rentalPricePerDay", "salePrice"] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                style={{
                  padding: "7px 14px",
                  background: sortBy === key ? "var(--color-accent-primary)" : "transparent",
                  color: sortBy === key ? "#fff" : "var(--color-fg)",
                  border: `1px solid ${sortBy === key ? "var(--color-accent-primary)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-sm)",
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {key === "performanceScore" ? "Score" : key === "rentalPricePerDay" ? "Rent" : "Sale"}
              </button>
            ))}
          </div>
        </div>

        {/* View mode toggle */}
        <div style={{
          display: "flex", gap: "4px", marginBottom: "24px",
          background: "var(--color-border-dim)", padding: "4px",
          borderRadius: "var(--radius-sm)", width: "fit-content"
        }}>
          {(["listed", "all"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: "7px 20px",
                background: viewMode === mode ? "var(--color-bg-secondary)" : "transparent",
                color: viewMode === mode ? "var(--color-accent-primary)" : "var(--color-secondary)",
                border: "none",
                borderRadius: "calc(var(--radius-sm) - 2px)",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: viewMode === mode ? "var(--shadow-sm)" : "none",
                transition: "all 0.2s ease",
              }}
            >
              {mode === "listed"
                ? `Active Listings (${listings.length})`
                : `All Souls (${allNfts.length})`}
            </button>
          ))}
        </div>

        {/* Loading spinner */}
        {isLoading && (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
              style={{ animation: "spin 1s linear infinite", color: "var(--color-accent-primary)" }}>
              <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                strokeLinecap="round" strokeDasharray="16 32" />
            </svg>
            <p style={{ color: "var(--color-secondary)", fontSize: "13px", marginTop: "16px" }}>
              Fetching souls from 0G Galileo…
            </p>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sortedItems.length === 0 && (
          <SharpCard style={{ textAlign: "center", padding: "60px 40px" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>👻</div>
            <h3 style={{ fontFamily: "var(--font-headline)", fontSize: "17px", fontWeight: 400, marginBottom: "8px", color: "var(--color-fg)", letterSpacing: "0.02em" }}>
              {viewMode === "listed" ? "No Active Listings Yet" : "No Minted Souls Found"}
            </h3>
            <p style={{ fontSize: "13px", color: "var(--color-secondary)", maxWidth: "400px", margin: "0 auto 24px", lineHeight: 1.6 }}>
              {viewMode === "listed"
                ? "No Soul NFTs are listed for rent or sale yet. Train your behavioral model, mint your Soul NFT, then list it here."
                : "No Soul NFTs have been minted yet. Go to the dashboard, train your model, and mint your soul to get started."}
            </p>
            <Link href="/dashboard">
              <button className="btn-primary" style={{ fontSize: "13px" }}>
                Go to Dashboard →
              </button>
            </Link>
          </SharpCard>
        )}

        {/* Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
          {sortedItems.map((listing: any, i: number) => (
            <SlideUp key={listing.tokenId} delay={i * 0.04}>
              <Link href={`/marketplace/${listing.tokenId}`} style={{ textDecoration: "none" }}>
                <SharpCard style={{ cursor: "pointer" }}>
                  {/* Header row */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-accent-primary)" }}>
                      Soul #{listing.tokenId}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--color-secondary)", fontFamily: "var(--font-mono)" }}>
                      {listing.walletAddress?.slice(0, 6)}…{listing.walletAddress?.slice(-4)}
                    </span>
                  </div>

                  {/* Performance score */}
                  <div style={{ marginBottom: "16px" }}>
                    <span style={{ fontSize: "40px", fontWeight: 700, color: "var(--color-fg)" }}>
                      {parseFloat(listing.performanceScore ?? "0").toFixed(0)}
                    </span>
                    <span style={{ fontSize: "11px", color: "var(--color-secondary)", marginLeft: "6px" }}>/ 100</span>
                    <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Performance Score
                    </p>
                  </div>

                  {/* Mini dimension bars */}
                  {listing.modelMetadata && (() => {
                    const ds = (listing.modelMetadata as Record<string, any>).dimensionScores as Record<string, number> | undefined;
                    if (!ds) return null;
                    return (
                      <div style={{ marginBottom: "16px" }}>
                        <HorizontalBar label="Risk" value={ds.riskProfile ?? 0} showPercent={false} />
                        <HorizontalBar label="Timing" value={ds.timingPatterns ?? 0} showPercent={false} />
                        <HorizontalBar label="Protocol" value={ds.protocolPreferences ?? 0} showPercent={false} />
                      </div>
                    );
                  })()}

                  {/* Actions trained */}
                  {listing.totalActionsTrained && (
                    <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginBottom: "12px" }}>
                      {listing.totalActionsTrained.toLocaleString()} actions trained
                    </p>
                  )}

                  {/* Pricing / status badges */}
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {listing.isRentable && listing.rentalPricePerDay ? (
                      <span style={{
                        fontSize: "11px", fontWeight: 600,
                        background: "rgba(15,82,186,0.08)", color: "var(--color-accent-primary)",
                        border: "1px solid rgba(15,82,186,0.2)",
                        padding: "4px 10px", borderRadius: "var(--radius-sm)",
                      }}>
                        Rent: {parseFloat(listing.rentalPricePerDay).toFixed(4)} ETH/day
                      </span>
                    ) : null}
                    {listing.isForSale && listing.salePrice ? (
                      <span style={{
                        fontSize: "11px", fontWeight: 600,
                        background: "rgba(15,82,186,0.12)", color: "var(--color-accent-primary)",
                        border: "1px solid rgba(15,82,186,0.3)",
                        padding: "4px 10px", borderRadius: "var(--radius-sm)",
                      }}>
                        Buy: {parseFloat(listing.salePrice).toFixed(4)} ETH
                      </span>
                    ) : null}
                    {!listing.isRentable && !listing.isForSale && (
                      <span style={{
                        fontSize: "11px", color: "var(--color-secondary)",
                        border: "1px solid var(--color-border)",
                        padding: "4px 10px", borderRadius: "var(--radius-sm)",
                      }}>
                        Not Listed
                      </span>
                    )}
                  </div>
                </SharpCard>
              </Link>
            </SlideUp>
          ))}
        </div>
      </FadeIn>
    </main>
  );
}
