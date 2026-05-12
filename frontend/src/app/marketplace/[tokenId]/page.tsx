"use client";

/**
 * Marketplace listing detail page.
 * Requirements: 13.3–13.6
 */

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther } from "viem";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { HorizontalBar, StatRow, SharpCard, FadeIn, SlideUp } from "@/components/ui";
import type { MarketplaceListing } from "@/store/appStore";

const MARKETPLACE_ABI = [
  {
    name: "rent",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }, { name: "durationDays", type: "uint256" }],
    outputs: [],
  },
  {
    name: "buy",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [],
  },
] as const;

const MARKETPLACE_ADDRESS = (process.env.NEXT_PUBLIC_MARKETPLACE_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tokenId = parseInt(params.tokenId as string, 10);
  const jwt = useAppStore((s) => s.jwt);

  const [listing, setListing] = useState<MarketplaceListing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rentDays, setRentDays] = useState("7");
  const [action, setAction] = useState<"rent" | "buy" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { writeContract, data: txHash, isPending: isSigning } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    api.marketplace.listing(tokenId)
      .then((data) => setListing(data as MarketplaceListing))
      .catch(() => setListing(null))
      .finally(() => setIsLoading(false));
  }, [tokenId]);

  useEffect(() => {
    if (isConfirmed && txHash && action && jwt) {
      // Record in DB
      if (action === "rent") {
        api.marketplace.rent(jwt, tokenId, parseInt(rentDays, 10)).catch(() => {});
      } else {
        api.marketplace.buy(jwt, tokenId).catch(() => {});
      }
      setConfirmed(true);
    }
  }, [isConfirmed, txHash, action, jwt, tokenId, rentDays]);

  const handleRent = () => {
    if (!listing?.rentalPricePerDay) return;
    setError(null);
    setAction("rent");
    const days = parseInt(rentDays, 10);
    const totalEth = parseFloat(listing.rentalPricePerDay) * days;
    writeContract({
      address: MARKETPLACE_ADDRESS,
      abi: MARKETPLACE_ABI,
      functionName: "rent",
      args: [BigInt(tokenId), BigInt(days)],
      value: parseEther(totalEth.toFixed(18)),
    });
  };

  const handleBuy = () => {
    if (!listing?.salePrice) return;
    setError(null);
    setAction("buy");
    writeContract({
      address: MARKETPLACE_ADDRESS,
      abi: MARKETPLACE_ABI,
      functionName: "buy",
      args: [BigInt(tokenId)],
      value: parseEther(listing.salePrice),
    });
  };

  const dims = listing?.modelMetadata
    ? ((listing.modelMetadata as Record<string, unknown>).dimensionScores as Record<string, number> | undefined)
    : undefined;

  const rentTotal = listing?.rentalPricePerDay
    ? (parseFloat(listing.rentalPricePerDay) * parseInt(rentDays || "1", 10)).toFixed(6)
    : "0";

  if (isLoading) return <main style={{ padding: "40px 20px" }}><p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>Loading…</p></main>;
  if (!listing) return <main style={{ padding: "40px 20px" }}><p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>Listing not found.</p></main>;

  return (
    <main style={{ maxWidth: "700px", margin: "0 auto", padding: "40px 20px" }}>
      <FadeIn>
        <div style={{ marginBottom: "40px" }}>
          <Link href="/marketplace" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>← MARKETPLACE</Link>
          <h1 style={{ fontSize: "18px", fontWeight: 700, marginTop: "8px" }}>SOUL #{tokenId}</h1>
          <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginTop: "4px" }}>
            {listing.walletAddress.slice(0, 6)}…{listing.walletAddress.slice(-4)}
          </p>
        </div>

        {confirmed && (
          <SlideUp>
            <SharpCard style={{ marginBottom: "24px", borderColor: "var(--color-fg)" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>
                {action === "rent" ? "Rental confirmed!" : "Purchase confirmed!"}
              </p>
              <p style={{ fontSize: "12px", color: "var(--color-secondary)" }}>
                {action === "rent" ? `Rented for ${rentDays} days.` : "You now own this Soul NFT."}
              </p>
            </SharpCard>
          </SlideUp>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* Left — model details */}
          <SlideUp delay={0.05}>
            <SharpCard>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Behavioral Model</p>

              <div style={{ marginBottom: "20px" }}>
                <span style={{ fontSize: "48px", fontWeight: 700 }}>
                  {parseFloat(listing.performanceScore ?? "0").toFixed(0)}
                </span>
                <span style={{ fontSize: "11px", color: "var(--color-secondary)", marginLeft: "6px" }}>/ 100</span>
              </div>

              {dims && (
                <>
                  <HorizontalBar label="Risk Profile" value={dims.riskProfile ?? 0} />
                  <HorizontalBar label="Timing Patterns" value={dims.timingPatterns ?? 0} />
                  <HorizontalBar label="Protocol Prefs" value={dims.protocolPreferences ?? 0} />
                  <HorizontalBar label="Asset Behavior" value={dims.assetBehavior ?? 0} />
                  <HorizontalBar label="Decision Context" value={dims.decisionContext ?? 0} />
                </>
              )}

              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--color-border-dim)" }}>
                <StatRow label="Actions trained" value={(listing.totalActionsTrained ?? 0).toLocaleString()} />
                {listing.modelVersion && <StatRow label="Model version" value={`v${listing.modelVersion}`} />}
                <StatRow label="Times rented" value={listing.timesRented ?? 0} />
              </div>
            </SharpCard>
          </SlideUp>

          {/* Right — rent/buy actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Rent */}
            {listing.isRentable && listing.rentalPricePerDay && (
              <SlideUp delay={0.1}>
                <SharpCard>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Rent</p>
                  <StatRow label="Price / day" value={`${parseFloat(listing.rentalPricePerDay).toFixed(4)} ETH`} />

                  <div style={{ marginTop: "16px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-secondary)", display: "block", marginBottom: "6px" }}>DURATION (DAYS)</label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={rentDays}
                      onChange={(e) => setRentDays(e.target.value)}
                      style={{ width: "100%", marginBottom: "8px" }}
                    />
                    <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginBottom: "16px" }}>
                      Total: {rentTotal} ETH
                    </p>
                    <button
                      onClick={handleRent}
                      disabled={isSigning || isConfirming || !jwt || confirmed}
                      style={{ width: "100%", padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", opacity: (isSigning || isConfirming) ? 0.6 : 1 }}
                    >
                      {isSigning ? "SIGNING…" : isConfirming ? "CONFIRMING…" : "RENT SOUL"}
                    </button>
                    {!jwt && <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "8px" }}>Sign in to rent.</p>}
                  </div>
                </SharpCard>
              </SlideUp>
            )}

            {/* Buy */}
            {listing.isForSale && listing.salePrice && (
              <SlideUp delay={0.15}>
                <SharpCard>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "16px" }}>Buy</p>
                  <StatRow label="Price" value={`${parseFloat(listing.salePrice).toFixed(4)} ETH`} />
                  <button
                    onClick={handleBuy}
                    disabled={isSigning || isConfirming || !jwt || confirmed}
                    style={{ marginTop: "16px", width: "100%", padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", opacity: (isSigning || isConfirming) ? 0.6 : 1 }}
                  >
                    {isSigning ? "SIGNING…" : isConfirming ? "CONFIRMING…" : "BUY SOUL"}
                  </button>
                  {!jwt && <p style={{ fontSize: "10px", color: "var(--color-secondary)", marginTop: "8px" }}>Sign in to buy.</p>}
                </SharpCard>
              </SlideUp>
            )}

            {error && <p style={{ fontSize: "12px", color: "var(--color-secondary)" }}>{error}</p>}
          </div>
        </div>
      </FadeIn>
    </main>
  );
}
