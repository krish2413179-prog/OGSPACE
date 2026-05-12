/**
 * Guardian — pure function safety engine for agent actions.
 *
 * Enforces 6 hardcoded safety rules (never overridable):
 * 1. max_single_tx_usd:         $1,000
 * 2. max_daily_spend_usd:       $5,000 (rolling 24h)
 * 3. no_unverified_contracts:   only interact with verified contracts
 * 4. no_honeypot_tokens:        reject honeypot-flagged contracts
 * 5. slippage_max_bps:          300 (3%)
 * 6. require_liquidity_min_usd: $50,000
 *
 * Returns { allowed: boolean, reason?: string } — never throws.
 *
 * Requirements: 5.2, 5.3, 5.5
 */

const MAX_SINGLE_TX_USD = 1_000;
const MAX_DAILY_SPEND_USD = 5_000;
const SLIPPAGE_MAX_BPS = 300;
const MIN_POOL_LIQUIDITY_USD = 50_000;

export interface ProposedAction {
  actionType: string;
  protocol: string;
  assetIn?: string;
  assetOut?: string;
  amountUsd: number;
  slippageBps?: number;
  poolLiquidityUsd?: number;
  targetContract?: string;
  isContractVerified?: boolean;
  isHoneypot?: boolean;
}

export interface GuardianResult {
  allowed: boolean;
  reason?: string;
  violatedRule?: string;
}

export function evaluate(
  proposedAction: ProposedAction,
  dailySpendSoFarUsd: number
): GuardianResult {
  try {
    // Rule 1: Max single transaction value
    if (proposedAction.amountUsd > MAX_SINGLE_TX_USD) {
      return {
        allowed: false,
        reason: `Transaction value $${proposedAction.amountUsd.toFixed(2)} exceeds the maximum allowed single transaction value of $${MAX_SINGLE_TX_USD}.`,
        violatedRule: "max_single_tx_usd",
      };
    }

    // Rule 2: Max daily spend (rolling)
    const projectedDailySpend = dailySpendSoFarUsd + proposedAction.amountUsd;
    if (projectedDailySpend > MAX_DAILY_SPEND_USD) {
      return {
        allowed: false,
        reason: `Projected daily spend $${projectedDailySpend.toFixed(2)} would exceed the maximum daily spend limit of $${MAX_DAILY_SPEND_USD}. Already spent: $${dailySpendSoFarUsd.toFixed(2)}.`,
        violatedRule: "max_daily_spend_usd",
      };
    }

    // Rule 3: No unverified contracts
    if (
      proposedAction.targetContract !== undefined &&
      proposedAction.targetContract !== null &&
      proposedAction.targetContract !== "" &&
      proposedAction.isContractVerified === false
    ) {
      return {
        allowed: false,
        reason: `Target contract ${proposedAction.targetContract} is not verified. Only interactions with verified contracts are permitted.`,
        violatedRule: "no_unverified_contracts",
      };
    }

    // Rule 4: No honeypot tokens
    if (proposedAction.isHoneypot === true) {
      return {
        allowed: false,
        reason: `Target contract ${proposedAction.targetContract ?? "unknown"} is flagged as a honeypot. Interaction blocked.`,
        violatedRule: "no_honeypot_tokens",
      };
    }

    // Rule 5: Max slippage 3% (300 bps)
    if (
      proposedAction.slippageBps !== undefined &&
      proposedAction.slippageBps !== null &&
      proposedAction.slippageBps > SLIPPAGE_MAX_BPS
    ) {
      return {
        allowed: false,
        reason: `Requested slippage ${proposedAction.slippageBps} bps exceeds the maximum allowed slippage of ${SLIPPAGE_MAX_BPS} bps (3%).`,
        violatedRule: "slippage_max_bps",
      };
    }

    // Rule 6: Minimum pool liquidity $50,000
    if (
      proposedAction.poolLiquidityUsd !== undefined &&
      proposedAction.poolLiquidityUsd !== null &&
      proposedAction.poolLiquidityUsd < MIN_POOL_LIQUIDITY_USD
    ) {
      return {
        allowed: false,
        reason: `Pool liquidity $${proposedAction.poolLiquidityUsd.toFixed(2)} is below the minimum required liquidity of $${MIN_POOL_LIQUIDITY_USD.toLocaleString()}.`,
        violatedRule: "require_liquidity_min_usd",
      };
    }

    return { allowed: true };
  } catch {
    return {
      allowed: false,
      reason: "Guardian encountered an unexpected error during evaluation. Action blocked for safety.",
      violatedRule: "internal_error",
    };
  }
}

export const GUARDIAN_RULES = {
  MAX_SINGLE_TX_USD,
  MAX_DAILY_SPEND_USD,
  SLIPPAGE_MAX_BPS,
  MIN_POOL_LIQUIDITY_USD,
} as const;
