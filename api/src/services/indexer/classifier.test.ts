import { describe, it, expect } from "vitest";
import { classifyTransaction, type RawTransaction, type ActionType } from "./classifier.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tx(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    hash: "0xabc123",
    from: "0x1234567890123456789012345678901234567890",
    ...overrides,
  };
}

const VALID_TYPES: ActionType[] = [
  "TRADE",
  "GOVERNANCE_VOTE",
  "DEFI_POSITION",
  "NFT_PURCHASE",
  "LIQUIDITY_MOVE",
  "OTHER",
];

// ─── GOVERNANCE_VOTE ──────────────────────────────────────────────────────────

describe("GOVERNANCE_VOTE classification", () => {
  it("classifies by protocol=snapshot", () => {
    expect(classifyTransaction(tx({ protocol: "snapshot" }))).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by protocol=compound-governance", () => {
    expect(classifyTransaction(tx({ protocol: "compound-governance" }))).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by castVote selector (0x56781388)", () => {
    expect(
      classifyTransaction(tx({ input: "0x567813880000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by castVoteWithReason selector (0x7b3c71d3)", () => {
    expect(
      classifyTransaction(tx({ input: "0x7b3c71d30000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by vote selector (0x0121b93f)", () => {
    expect(
      classifyTransaction(tx({ input: "0x0121b93f0000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by functionName=castVote", () => {
    expect(classifyTransaction(tx({ functionName: "castVote" }))).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by functionName=vote", () => {
    expect(classifyTransaction(tx({ functionName: "vote" }))).toBe("GOVERNANCE_VOTE");
  });

  it("classifies by functionName starting with castVote (case-insensitive)", () => {
    expect(classifyTransaction(tx({ functionName: "castVoteWithReason" }))).toBe("GOVERNANCE_VOTE");
  });
});

// ─── NFT_PURCHASE ─────────────────────────────────────────────────────────────

describe("NFT_PURCHASE classification", () => {
  it("classifies by protocol=opensea", () => {
    expect(classifyTransaction(tx({ protocol: "opensea" }))).toBe("NFT_PURCHASE");
  });

  it("classifies by protocol=blur", () => {
    expect(classifyTransaction(tx({ protocol: "blur" }))).toBe("NFT_PURCHASE");
  });

  it("classifies by protocol=x2y2", () => {
    expect(classifyTransaction(tx({ protocol: "x2y2" }))).toBe("NFT_PURCHASE");
  });

  it("classifies safeTransferFrom selector with non-zero value", () => {
    expect(
      classifyTransaction(
        tx({
          input: "0x42842e0e000000000000000000000000abc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
          value: "0x1000000000000000",
        })
      )
    ).toBe("NFT_PURCHASE");
  });

  it("classifies transferFrom selector with non-zero value", () => {
    expect(
      classifyTransaction(
        tx({
          input: "0x23b872dd000000000000000000000000abc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
          value: "1000000000000000000",
        })
      )
    ).toBe("NFT_PURCHASE");
  });

  it("does NOT classify safeTransferFrom with zero value as NFT_PURCHASE", () => {
    const result = classifyTransaction(
      tx({
        input: "0x42842e0e000000000000000000000000abc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
        value: "0x0",
      })
    );
    // Should fall through to OTHER (no protocol, no other match)
    expect(result).not.toBe("NFT_PURCHASE");
  });
});

// ─── LIQUIDITY_MOVE ───────────────────────────────────────────────────────────

describe("LIQUIDITY_MOVE classification", () => {
  it("classifies by protocol=curve", () => {
    expect(classifyTransaction(tx({ protocol: "curve" }))).toBe("LIQUIDITY_MOVE");
  });

  it("classifies by protocol=balancer", () => {
    expect(classifyTransaction(tx({ protocol: "balancer" }))).toBe("LIQUIDITY_MOVE");
  });

  it("classifies addLiquidity selector (0xe8e33700)", () => {
    expect(
      classifyTransaction(tx({ input: "0xe8e337000000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("LIQUIDITY_MOVE");
  });

  it("classifies removeLiquidity selector (0xbaa2abde)", () => {
    expect(
      classifyTransaction(tx({ input: "0xbaa2abde0000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("LIQUIDITY_MOVE");
  });

  it("classifies Uniswap V3 mint selector (0x88316456)", () => {
    expect(
      classifyTransaction(tx({ input: "0x883164560000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("LIQUIDITY_MOVE");
  });

  it("classifies by functionName=addLiquidity", () => {
    expect(classifyTransaction(tx({ functionName: "addLiquidity" }))).toBe("LIQUIDITY_MOVE");
  });

  it("classifies by functionName=removeLiquidityETH", () => {
    expect(classifyTransaction(tx({ functionName: "removeLiquidityETH" }))).toBe("LIQUIDITY_MOVE");
  });

  it("classifies by functionName=collect", () => {
    expect(classifyTransaction(tx({ functionName: "collect" }))).toBe("LIQUIDITY_MOVE");
  });

  it("classifies mint on uniswap protocol", () => {
    expect(classifyTransaction(tx({ functionName: "mint", protocol: "uniswap-v3" }))).toBe("LIQUIDITY_MOVE");
  });
});

// ─── DEFI_POSITION ────────────────────────────────────────────────────────────

describe("DEFI_POSITION classification", () => {
  it("classifies by protocol=aave", () => {
    expect(classifyTransaction(tx({ protocol: "aave" }))).toBe("DEFI_POSITION");
  });

  it("classifies by protocol=compound", () => {
    expect(classifyTransaction(tx({ protocol: "compound" }))).toBe("DEFI_POSITION");
  });

  it("classifies by protocol=lido", () => {
    expect(classifyTransaction(tx({ protocol: "lido" }))).toBe("DEFI_POSITION");
  });

  it("classifies by protocol=yearn", () => {
    expect(classifyTransaction(tx({ protocol: "yearn" }))).toBe("DEFI_POSITION");
  });

  it("classifies by protocol=convex", () => {
    expect(classifyTransaction(tx({ protocol: "convex" }))).toBe("DEFI_POSITION");
  });

  it("classifies by protocol=pendle", () => {
    expect(classifyTransaction(tx({ protocol: "pendle" }))).toBe("DEFI_POSITION");
  });

  it("classifies deposit selector (0xb6b55f25)", () => {
    expect(
      classifyTransaction(tx({ input: "0xb6b55f250000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("DEFI_POSITION");
  });

  it("classifies withdraw selector (0x2e1a7d4d)", () => {
    expect(
      classifyTransaction(tx({ input: "0x2e1a7d4d0000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("DEFI_POSITION");
  });

  it("classifies borrow selector (0xc5ebeaec)", () => {
    expect(
      classifyTransaction(tx({ input: "0xc5ebeaec0000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("DEFI_POSITION");
  });

  it("classifies stake selector (0xa694fc3a)", () => {
    expect(
      classifyTransaction(tx({ input: "0xa694fc3a0000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("DEFI_POSITION");
  });

  it("classifies by functionName=deposit", () => {
    expect(classifyTransaction(tx({ functionName: "deposit" }))).toBe("DEFI_POSITION");
  });

  it("classifies by functionName=withdraw", () => {
    expect(classifyTransaction(tx({ functionName: "withdraw" }))).toBe("DEFI_POSITION");
  });

  it("classifies by functionName=stake", () => {
    expect(classifyTransaction(tx({ functionName: "stake" }))).toBe("DEFI_POSITION");
  });

  it("classifies by functionName=unstake", () => {
    expect(classifyTransaction(tx({ functionName: "unstake" }))).toBe("DEFI_POSITION");
  });

  it("classifies by functionName=repay", () => {
    expect(classifyTransaction(tx({ functionName: "repay" }))).toBe("DEFI_POSITION");
  });
});

// ─── TRADE ────────────────────────────────────────────────────────────────────

describe("TRADE classification", () => {
  it("classifies by protocol=uniswap", () => {
    expect(classifyTransaction(tx({ protocol: "uniswap" }))).toBe("TRADE");
  });

  it("classifies by protocol=sushiswap", () => {
    expect(classifyTransaction(tx({ protocol: "sushiswap" }))).toBe("TRADE");
  });

  it("classifies by protocol=1inch", () => {
    expect(classifyTransaction(tx({ protocol: "1inch" }))).toBe("TRADE");
  });

  it("classifies by protocol=paraswap", () => {
    expect(classifyTransaction(tx({ protocol: "paraswap" }))).toBe("TRADE");
  });

  it("classifies by protocol=gmx", () => {
    expect(classifyTransaction(tx({ protocol: "gmx" }))).toBe("TRADE");
  });

  it("classifies by protocol=dydx", () => {
    expect(classifyTransaction(tx({ protocol: "dydx" }))).toBe("TRADE");
  });

  it("classifies swapExactTokensForTokens selector (0x38ed1739)", () => {
    expect(
      classifyTransaction(tx({ input: "0x38ed17390000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("TRADE");
  });

  it("classifies exactInputSingle selector (0x414bf389)", () => {
    expect(
      classifyTransaction(tx({ input: "0x414bf3890000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("TRADE");
  });

  it("classifies exactInput selector (0xc04b8d59)", () => {
    expect(
      classifyTransaction(tx({ input: "0xc04b8d590000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("TRADE");
  });

  it("classifies exactOutputSingle selector (0xdb3e2198)", () => {
    expect(
      classifyTransaction(tx({ input: "0xdb3e21980000000000000000000000000000000000000000000000000000000000000001" }))
    ).toBe("TRADE");
  });

  it("classifies by functionName=swapExactTokensForTokens", () => {
    expect(classifyTransaction(tx({ functionName: "swapExactTokensForTokens" }))).toBe("TRADE");
  });

  it("classifies by functionName starting with swap", () => {
    expect(classifyTransaction(tx({ functionName: "swapTokensForExactETH" }))).toBe("TRADE");
  });

  it("classifies by functionName starting with exactInput", () => {
    expect(classifyTransaction(tx({ functionName: "exactInputSingle" }))).toBe("TRADE");
  });

  it("classifies by functionName starting with exactOutput", () => {
    expect(classifyTransaction(tx({ functionName: "exactOutputSingle" }))).toBe("TRADE");
  });
});

// ─── OTHER (fallback) ─────────────────────────────────────────────────────────

describe("OTHER classification (fallback)", () => {
  it("classifies a plain ETH transfer with no input as OTHER", () => {
    expect(classifyTransaction(tx({ value: "1000000000000000000" }))).toBe("OTHER");
  });

  it("classifies a tx with no input, no protocol, no functionName as OTHER", () => {
    expect(classifyTransaction(tx())).toBe("OTHER");
  });

  it("classifies a tx with unknown selector as OTHER", () => {
    expect(classifyTransaction(tx({ input: "0xdeadbeef0000000000000000000000000000000000000000000000000000000000000001" }))).toBe("OTHER");
  });

  it("classifies a tx with unknown protocol as OTHER", () => {
    expect(classifyTransaction(tx({ protocol: "some-random-protocol" }))).toBe("OTHER");
  });

  it("classifies a contract deployment (no to) as OTHER", () => {
    expect(classifyTransaction(tx({ to: null, input: "0x6080604052" }))).toBe("OTHER");
  });
});

// ─── Priority ordering ────────────────────────────────────────────────────────

describe("Classification priority ordering", () => {
  it("GOVERNANCE_VOTE takes priority over TRADE when both protocol and selector match", () => {
    // snapshot protocol + swap selector — governance wins
    expect(
      classifyTransaction(
        tx({
          protocol: "snapshot",
          input: "0x38ed17390000000000000000000000000000000000000000000000000000000000000001",
        })
      )
    ).toBe("GOVERNANCE_VOTE");
  });

  it("NFT_PURCHASE takes priority over DEFI_POSITION", () => {
    // opensea protocol + deposit functionName — NFT wins
    expect(
      classifyTransaction(
        tx({
          protocol: "opensea",
          functionName: "deposit",
        })
      )
    ).toBe("NFT_PURCHASE");
  });

  it("LIQUIDITY_MOVE takes priority over DEFI_POSITION", () => {
    // curve protocol + deposit functionName — liquidity wins
    expect(
      classifyTransaction(
        tx({
          protocol: "curve",
          functionName: "deposit",
        })
      )
    ).toBe("LIQUIDITY_MOVE");
  });

  it("DEFI_POSITION takes priority over TRADE", () => {
    // aave protocol + swap functionName — defi wins
    expect(
      classifyTransaction(
        tx({
          protocol: "aave",
          functionName: "swapCollateral",
        })
      )
    ).toBe("DEFI_POSITION");
  });
});

// ─── Return type invariant ────────────────────────────────────────────────────

describe("Return type invariant", () => {
  const testCases: RawTransaction[] = [
    tx(),
    tx({ protocol: "uniswap" }),
    tx({ protocol: "aave" }),
    tx({ protocol: "opensea" }),
    tx({ protocol: "curve" }),
    tx({ protocol: "snapshot" }),
    tx({ input: "0x38ed17390000000000000000000000000000000000000000000000000000000000000001" }),
    tx({ input: "0xb6b55f250000000000000000000000000000000000000000000000000000000000000001" }),
    tx({ input: "0x56781388" }),
    tx({ input: null }),
    tx({ input: "0x" }),
    tx({ input: "" }),
    tx({ value: "0x0" }),
    tx({ value: "0" }),
    tx({ value: null }),
  ];

  it.each(testCases)("always returns a valid ActionType", (rawTx) => {
    const result = classifyTransaction(rawTx);
    expect(VALID_TYPES).toContain(result);
  });

  it("never returns null or undefined", () => {
    for (const rawTx of testCases) {
      const result = classifyTransaction(rawTx);
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
    }
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("handles input with only 0x prefix (too short for selector)", () => {
    expect(classifyTransaction(tx({ input: "0x" }))).toBe("OTHER");
  });

  it("handles input without 0x prefix", () => {
    // swapExactTokensForTokens without 0x
    const result = classifyTransaction(
      tx({ input: "38ed17390000000000000000000000000000000000000000000000000000000000000001" })
    );
    expect(result).toBe("TRADE");
  });

  it("handles uppercase hex selector", () => {
    // Selectors are normalised to lowercase
    const result = classifyTransaction(
      tx({ input: "0X38ED17390000000000000000000000000000000000000000000000000000000000000001" })
    );
    expect(result).toBe("TRADE");
  });

  it("handles protocol with mixed case", () => {
    expect(classifyTransaction(tx({ protocol: "Uniswap" }))).toBe("TRADE");
    expect(classifyTransaction(tx({ protocol: "AAVE" }))).toBe("DEFI_POSITION");
    expect(classifyTransaction(tx({ protocol: "OpenSea" }))).toBe("NFT_PURCHASE");
  });

  it("handles value=0x0 correctly (not non-zero)", () => {
    // safeTransferFrom with value=0x0 should NOT be NFT_PURCHASE
    const result = classifyTransaction(
      tx({
        input: "0x42842e0e000000000000000000000000abc000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001",
        value: "0x0",
      })
    );
    expect(result).not.toBe("NFT_PURCHASE");
  });
});
