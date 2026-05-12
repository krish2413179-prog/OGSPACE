/**
 * Transaction classifier — pure function that maps a raw transaction to one
 * of the six canonical ActionType values.
 *
 * Classification logic (in priority order):
 * 1. GOVERNANCE_VOTE
 * 2. NFT_PURCHASE
 * 3. LIQUIDITY_MOVE
 * 4. DEFI_POSITION
 * 5. TRADE
 * 6. OTHER (fallback)
 *
 * Requirements: 2.3
 */

export type ActionType =
  | "TRADE"
  | "GOVERNANCE_VOTE"
  | "DEFI_POSITION"
  | "NFT_PURCHASE"
  | "LIQUIDITY_MOVE"
  | "OTHER";

export interface RawTransaction {
  hash: string;
  from: string;
  to?: string | null;
  input?: string | null;
  value?: string | null;
  protocol?: string | null;
  functionName?: string | null;
}

// ─── 4-byte selectors ─────────────────────────────────────────────────────────

const GOVERNANCE_SELECTORS = new Set([
  "0x56781388", // castVote(uint256,uint8)
  "0x7b3c71d3", // castVoteWithReason(uint256,uint8,string)
  "0x0121b93f", // vote(uint256)
]);

const NFT_SELECTORS = new Set([
  "0x42842e0e", // safeTransferFrom(address,address,uint256)
  "0xb88d4fde", // safeTransferFrom(address,address,uint256,bytes)
  "0x23b872dd", // transferFrom(address,address,uint256)
]);

const LIQUIDITY_SELECTORS = new Set([
  "0xe8e33700", // addLiquidity
  "0xf305d719", // addLiquidityETH
  "0xbaa2abde", // removeLiquidity
  "0x02751cec", // removeLiquidityETH
  "0x88316456", // mint (Uniswap V3 position manager)
  "0xa34123a7", // mint (Uniswap V3 pool)
  "0x4f1eb3d8", // collect
  "0xfc6f7865", // collect (alt)
]);

const DEFI_SELECTORS = new Set([
  "0xb6b55f25", // deposit(uint256)
  "0x6e553f65", // deposit(uint256,address) ERC-4626
  "0x2e1a7d4d", // withdraw(uint256)
  "0x69328dec", // withdraw(address,uint256,address) Aave
  "0xc5ebeaec", // borrow(uint256)
  "0xa415bcad", // borrow Aave
  "0x573ade81", // repay Aave
  "0x0e752702", // repay
  "0xa694fc3a", // stake(uint256)
  "0x2def6620", // unstake(uint256)
]);

const TRADE_SELECTORS = new Set([
  "0x38ed1739", // swapExactTokensForTokens
  "0x8803dbee", // swapTokensForExactTokens
  "0x7ff36ab5", // swapExactETHForTokens
  "0x18cbafe5", // swapExactTokensForETH
  "0x414bf389", // exactInputSingle (Uniswap V3)
  "0xc04b8d59", // exactInput (Uniswap V3)
  "0xdb3e2198", // exactOutputSingle (Uniswap V3)
  "0xf28c0498", // exactOutput (Uniswap V3)
  "0x128acb08", // swap (Uniswap V3 pool)
  "0x022c0d9f", // swap (Uniswap V2 pool)
  "0x2e95b6c8", // swap (1inch)
  "0x12aa3caf", // swap (1inch v5)
]);

// ─── Protocol sets ────────────────────────────────────────────────────────────

const GOVERNANCE_PROTOCOLS = new Set([
  "snapshot", "compound-governance", "aave-governance",
  "uniswap-governance", "maker-governance",
]);

const NFT_PROTOCOLS = new Set(["opensea", "blur", "x2y2", "looksrare", "nftx"]);

const LIQUIDITY_PROTOCOLS = new Set([
  "curve", "balancer", "uniswap-v2-lp", "uniswap-v3-lp",
]);

const DEFI_PROTOCOLS = new Set([
  "aave", "compound", "maker", "lido", "yearn",
  "convex", "pendle", "morpho", "euler", "spark",
]);

const TRADE_PROTOCOLS = new Set([
  "uniswap", "uniswap-v2", "uniswap-v3", "sushiswap",
  "1inch", "paraswap", "gmx", "dydx", "kyberswap", "odos", "cowswap",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractSelector(input: string | null | undefined): string | null {
  if (!input) return null;
  const lower = input.toLowerCase();
  const hex = lower.startsWith("0x") ? lower : `0x${lower}`;
  if (hex.length < 10) return null;
  return hex.slice(0, 10);
}

function normaliseProtocol(p: string | null | undefined): string {
  return (p ?? "").toLowerCase().trim();
}

function normaliseFn(fn: string | null | undefined): string {
  return (fn ?? "").toLowerCase().trim();
}

function hasNonZeroValue(value: string | null | undefined): boolean {
  if (!value) return false;
  const v = value.trim();
  if (v === "0x0" || v === "0" || v === "") return false;
  try {
    return BigInt(v.startsWith("0x") || v.startsWith("0X") ? v : v) > 0n;
  } catch {
    return false;
  }
}

// ─── Classifier ───────────────────────────────────────────────────────────────

export function classifyTransaction(rawTx: RawTransaction): ActionType {
  const selector = extractSelector(rawTx.input);
  const protocol = normaliseProtocol(rawTx.protocol);
  const fn = normaliseFn(rawTx.functionName);

  // 1. GOVERNANCE_VOTE
  if (
    GOVERNANCE_PROTOCOLS.has(protocol) ||
    (selector !== null && GOVERNANCE_SELECTORS.has(selector)) ||
    fn.startsWith("castvote") ||
    fn === "vote"
  ) {
    return "GOVERNANCE_VOTE";
  }

  // 2. NFT_PURCHASE
  if (
    NFT_PROTOCOLS.has(protocol) ||
    (selector !== null && NFT_SELECTORS.has(selector) && hasNonZeroValue(rawTx.value))
  ) {
    return "NFT_PURCHASE";
  }

  // 3. LIQUIDITY_MOVE
  if (
    LIQUIDITY_PROTOCOLS.has(protocol) ||
    (selector !== null && LIQUIDITY_SELECTORS.has(selector)) ||
    fn.startsWith("addliquidity") ||
    fn.startsWith("removeliquidity") ||
    fn === "collect" ||
    (fn === "mint" && (protocol.includes("uniswap") || protocol.includes("curve") || protocol.includes("balancer")))
  ) {
    return "LIQUIDITY_MOVE";
  }

  // 4. DEFI_POSITION
  if (
    DEFI_PROTOCOLS.has(protocol) ||
    (selector !== null && DEFI_SELECTORS.has(selector)) ||
    fn === "deposit" || fn === "withdraw" || fn === "borrow" ||
    fn === "repay" || fn === "stake" || fn === "unstake" ||
    fn.startsWith("deposit") || fn.startsWith("withdraw") ||
    fn.startsWith("borrow") || fn.startsWith("repay") ||
    fn.startsWith("stake") || fn.startsWith("unstake")
  ) {
    return "DEFI_POSITION";
  }

  // 5. TRADE
  if (
    TRADE_PROTOCOLS.has(protocol) ||
    (selector !== null && TRADE_SELECTORS.has(selector)) ||
    fn.startsWith("swap") ||
    fn.startsWith("exactinput") ||
    fn.startsWith("exactoutput")
  ) {
    return "TRADE";
  }

  return "OTHER";
}
