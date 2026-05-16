"use client";

/**
 * Soul NFT three-step mint flow.
 * Step 1 — Review Model (HorizontalBars + Performance Score + top traits)
 * Step 2 — Set Preferences (rental/sale config)
 * Step 3 — Sign and Mint
 * Requirements: 12.1–12.5
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { useAppStore } from "@/store/appStore";
import { api } from "@/lib/api";
import { HorizontalBar, StatRow, SharpCard, FadeIn, SlideUp } from "@/components/ui";

const SOUL_NFT_ABI = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_modelCID", type: "string" },
      {
        name: "_meta",
        type: "tuple",
        components: [
          { name: "totalActions", type: "uint256" },
          { name: "trainingTimestamp", type: "uint256" },
          { name: "performanceScore", type: "uint256" },
          { name: "isRentable", type: "bool" },
          { name: "rentalPricePerDay", type: "uint256" },
          { name: "isForSale", type: "bool" },
          { name: "salePrice", type: "uint256" },
        ],
      },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
] as const;

const SOUL_NFT_ADDRESS = (process.env.NEXT_PUBLIC_SOUL_NFT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as `0x${string}`;

type Step = 1 | 2 | 3;

interface MintParams {
  ogStorageCid: string;
  performanceScore: number;
  totalActionsTrained: number;
  mintParams: {
    modelCID: string;
    totalActions: number;
    trainingTimestamp: number;
    performanceScore: number;
    isRentable: boolean;
    rentalPricePerDay: string;
    isForSale: boolean;
    salePrice: string;
  };
}

export default function MintPage() {
  const router = useRouter();
  const jwt = useAppStore((s) => s.jwt);
  const walletAddress = useAppStore((s) => s.walletAddress);
  const currentModel = useAppStore((s) => s.currentModel);

  const [step, setStep] = useState<Step>(1);
  const [mintData, setMintData] = useState<MintParams | null>(null);
  const [isRentable, setIsRentable] = useState(false);
  const [rentalPricePerDay, setRentalPricePerDay] = useState("");
  const [isForSale, setIsForSale] = useState(false);
  const [salePrice, setSalePrice] = useState("");
  const [mintedTokenId, setMintedTokenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);

  const { writeContract, data: txHash, isPending: isSigning } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, data: txReceipt } = useWaitForTransactionReceipt({ hash: txHash });
  const publicClient = usePublicClient();

  useEffect(() => {
    if (!jwt) router.push("/");
  }, [jwt, router]);

  // Load mint params on mount
  useEffect(() => {
    if (!jwt) return;
    setIsPreparing(true);
    api.nfts.prepareMint(jwt)
      .then((data) => setMintData(data as MintParams))
      .catch((err) => setError(err.message))
      .finally(() => setIsPreparing(false));
  }, [jwt]);

  // On confirmation, parse token ID from logs and sync to DB
  useEffect(() => {
    if (isConfirmed && txHash && txReceipt && mintData) {
      // Parse tokenId from Transfer event logs (topic[3] for ERC721 Transfer)
      let tokenId: number | null = null;
      for (const log of txReceipt.logs) {
        // Transfer(address,address,uint256) — tokenId is the 3rd topic
        if (log.topics && log.topics.length >= 4) {
          const raw = log.topics[3];
          if (raw) {
            tokenId = parseInt(raw, 16);
            break;
          }
        }
      }

      // Fallback: use first 8 chars of txHash if we can't parse it
      const displayId = tokenId !== null ? String(tokenId) : txHash.slice(0, 10);
      setMintedTokenId(displayId);
      setStep(3);

      // Sync the minted NFT to the backend database
      if (jwt && tokenId !== null && walletAddress) {
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "https://ogspace-1.onrender.com"}/nfts/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${jwt}` },
          body: JSON.stringify({
            tokenId,
            walletAddress,
            mintTx: txHash,
            ogStorageCid: mintData.ogStorageCid,
            performanceScore: mintData.performanceScore,
            totalActionsTrained: mintData.totalActionsTrained,
          }),
        }).catch(console.error);
      }
    }
  }, [isConfirmed, txHash, txReceipt, mintData, jwt]);

  const dims = currentModel?.dimensionScores;

  const handleMint = () => {
    if (!mintData) return;
    setError(null);

    const params = mintData.mintParams;
    const rentalWei = isRentable && rentalPricePerDay
      ? BigInt(Math.floor(parseFloat(rentalPricePerDay) * 1e18))
      : BigInt(0);
    const saleWei = isForSale && salePrice
      ? BigInt(Math.floor(parseFloat(salePrice) * 1e18))
      : BigInt(0);

    writeContract({
      address: SOUL_NFT_ADDRESS,
      abi: SOUL_NFT_ABI,
      functionName: "mint",
      args: [
        params.modelCID,
        {
          totalActions: BigInt(params.totalActions),
          trainingTimestamp: BigInt(params.trainingTimestamp),
          performanceScore: BigInt(params.performanceScore),
          isRentable,
          rentalPricePerDay: rentalWei,
          isForSale,
          salePrice: saleWei,
        },
      ],
    });
  };

  if (!jwt) return null;

  return (
    <main style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 20px" }}>
      <FadeIn>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "40px" }}>
          <div>
            <Link href="/dashboard" style={{ fontSize: "11px", color: "var(--color-secondary)", textDecoration: "none" }}>← DASHBOARD</Link>
            <h1 style={{ fontFamily: "var(--font-headline)", fontSize: "20px", fontWeight: 400, marginTop: "8px", letterSpacing: "0.04em" }}>MINT SOUL NFT</h1>
          </div>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: "8px" }}>
            {([1, 2, 3] as Step[]).map((s) => (
              <div key={s} style={{ width: "24px", height: "24px", border: "1px solid var(--color-fg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", fontWeight: 700, background: step === s ? "var(--color-fg)" : "transparent", color: step === s ? "var(--color-bg)" : "var(--color-fg)" }}>
                {s}
              </div>
            ))}
          </div>
        </div>

        {isPreparing && <p style={{ color: "var(--color-secondary)", fontSize: "12px" }}>Loading model data…</p>}
        {error && <p style={{ color: "var(--color-secondary)", fontSize: "12px", marginBottom: "16px" }}>{error}</p>}

        {/* Step 1 — Review Model */}
        {step === 1 && !isPreparing && (
          <SlideUp>
            <SharpCard>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>Step 1 — Review Model</p>

              {/* Performance score — large typographic number */}
              <div style={{ marginBottom: "32px", textAlign: "center" }}>
                <p style={{ fontSize: "72px", fontWeight: 700, lineHeight: 1 }}>
                  {mintData ? mintData.performanceScore.toFixed(0) : "—"}
                </p>
                <p style={{ fontSize: "11px", color: "var(--color-secondary)", marginTop: "8px" }}>PERFORMANCE SCORE</p>
              </div>

              {/* Dimension bars */}
              {dims && (
                <div style={{ marginBottom: "24px" }}>
                  <HorizontalBar label="Risk Profile" value={dims.riskProfile} />
                  <HorizontalBar label="Timing Patterns" value={dims.timingPatterns} />
                  <HorizontalBar label="Protocol Prefs" value={dims.protocolPreferences} />
                  <HorizontalBar label="Asset Behavior" value={dims.assetBehavior} />
                  <HorizontalBar label="Decision Context" value={dims.decisionContext} />
                </div>
              )}

              {/* Top 3 traits */}
              {dims && (
                <div style={{ marginBottom: "24px" }}>
                  {Object.entries({
                    "Risk Profile": dims.riskProfile,
                    "Timing Patterns": dims.timingPatterns,
                    "Protocol Preferences": dims.protocolPreferences,
                    "Asset Behavior": dims.assetBehavior,
                    "Decision Context": dims.decisionContext,
                  })
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([label, value]) => (
                      <StatRow key={label} label={label} value={`${value.toFixed(0)} / 100`} />
                    ))}
                </div>
              )}

              <StatRow label="Actions trained" value={(mintData?.totalActionsTrained ?? 0).toLocaleString()} />

              <button
                onClick={() => setStep(2)}
                disabled={!mintData}
                style={{ marginTop: "24px", width: "100%", padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: mintData ? "pointer" : "not-allowed", opacity: mintData ? 1 : 0.5 }}
              >
                CONTINUE →
              </button>
            </SharpCard>
          </SlideUp>
        )}

        {/* Step 2 — Set Preferences */}
        {step === 2 && (
          <SlideUp>
            <SharpCard>
              <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>Step 2 — Set Preferences</p>

              {/* Rental config */}
              <div style={{ marginBottom: "24px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={isRentable} onChange={(e) => setIsRentable(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-fg)" }} />
                  <span style={{ fontSize: "12px" }}>List for rental</span>
                </label>
                {isRentable && (
                  <div style={{ marginLeft: "28px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-secondary)", display: "block", marginBottom: "6px" }}>PRICE PER DAY (ETH)</label>
                    <input type="number" step="0.001" min="0" value={rentalPricePerDay} onChange={(e) => setRentalPricePerDay(e.target.value)} placeholder="0.01" style={{ width: "100%" }} />
                  </div>
                )}
              </div>

              {/* Sale config */}
              <div style={{ marginBottom: "32px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", cursor: "pointer" }}>
                  <input type="checkbox" checked={isForSale} onChange={(e) => setIsForSale(e.target.checked)} style={{ width: "16px", height: "16px", accentColor: "var(--color-fg)" }} />
                  <span style={{ fontSize: "12px" }}>List for sale</span>
                </label>
                {isForSale && (
                  <div style={{ marginLeft: "28px" }}>
                    <label style={{ fontSize: "11px", color: "var(--color-secondary)", display: "block", marginBottom: "6px" }}>SALE PRICE (ETH)</label>
                    <input type="number" step="0.01" min="0" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="1.0" style={{ width: "100%" }} />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: "12px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", fontSize: "12px", cursor: "pointer" }}>← BACK</button>
                <button onClick={() => setStep(3)} style={{ flex: 2, padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>CONTINUE →</button>
              </div>
            </SharpCard>
          </SlideUp>
        )}

        {/* Step 3 — Sign and Mint / Success */}
        {step === 3 && (
          <SlideUp>
            <SharpCard>
              {mintedTokenId ? (
                /* Success state */
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "24px" }}>Soul NFT Minted</p>
                  <p style={{ fontSize: "48px", fontWeight: 700, marginBottom: "8px" }}>✓</p>
                  <p style={{ fontSize: "13px", marginBottom: "24px" }}>Your Soul NFT has been minted on 0G Chain.</p>
                  <StatRow label="Token ID" value={mintedTokenId} />
                  <div style={{ marginTop: "24px", display: "flex", gap: "12px" }}>
                    <Link href="/marketplace" style={{ flex: 1, padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", textDecoration: "none", textAlign: "center", fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>
                      VIEW IN MARKET →
                    </Link>
                    <Link href="/dashboard" style={{ flex: 1, padding: "12px", border: "1px solid var(--color-border-dim)", color: "var(--color-fg)", textDecoration: "none", textAlign: "center", fontSize: "11px" }}>
                      DASHBOARD
                    </Link>
                  </div>
                </div>
              ) : (
                /* Sign and mint */
                <>
                  <p style={{ fontSize: "10px", color: "var(--color-secondary)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "20px" }}>Step 3 — Sign and Mint</p>
                  <StatRow label="Model CID" value={mintData ? `${mintData.ogStorageCid.slice(0, 20)}…` : "—"} />
                  <StatRow label="Performance" value={mintData ? `${mintData.performanceScore.toFixed(0)} / 100` : "—"} />
                  <StatRow label="Rental" value={isRentable ? `${rentalPricePerDay} ETH/day` : "Not listed"} />
                  <StatRow label="Sale" value={isForSale ? `${salePrice} ETH` : "Not listed"} />

                  {error && <p style={{ color: "var(--color-secondary)", fontSize: "12px", marginTop: "16px" }}>{error}</p>}

                  <div style={{ display: "flex", gap: "12px", marginTop: "24px" }}>
                    <button onClick={() => setStep(2)} style={{ flex: 1, padding: "12px", background: "transparent", color: "var(--color-fg)", border: "1px solid var(--color-border-dim)", fontSize: "12px", cursor: "pointer" }}>← BACK</button>
                    <button
                      onClick={handleMint}
                      disabled={isSigning || isConfirming || !mintData}
                      style={{ flex: 2, padding: "12px", background: "var(--color-fg)", color: "var(--color-bg)", border: "none", fontSize: "12px", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", opacity: (isSigning || isConfirming) ? 0.6 : 1 }}
                    >
                      {isSigning ? "SIGNING…" : isConfirming ? "CONFIRMING…" : "MINT SOUL NFT"}
                    </button>
                  </div>
                </>
              )}
            </SharpCard>
          </SlideUp>
        )}
      </FadeIn>
    </main>
  );
}
