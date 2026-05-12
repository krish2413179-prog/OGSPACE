"""
Action encoder for the behavioral transformer model.

Maps string fields (action_type, protocol, asset) to integer indices
for embedding lookup. Unknown values are mapped to index 0 (OOV token).
"""

from __future__ import annotations

from typing import Dict

# ── Action type vocabulary ────────────────────────────────────────────────────
# Index 0 is reserved for OOV / unknown values.
ACTION_TYPE_VOCAB: Dict[str, int] = {
    "<OOV>": 0,
    "TRADE": 1,
    "GOVERNANCE_VOTE": 2,
    "DEFI_POSITION": 3,
    "NFT_PURCHASE": 4,
    "LIQUIDITY_MOVE": 5,
    "OTHER": 6,
}

# ── Protocol vocabulary ───────────────────────────────────────────────────────
# Common DeFi / NFT protocols; anything not listed maps to 0.
PROTOCOL_VOCAB: Dict[str, int] = {
    "<OOV>": 0,
    "uniswap": 1,
    "uniswap_v2": 2,
    "uniswap_v3": 3,
    "sushiswap": 4,
    "curve": 5,
    "aave": 6,
    "aave_v2": 7,
    "aave_v3": 8,
    "compound": 9,
    "compound_v3": 10,
    "maker": 11,
    "lido": 12,
    "convex": 13,
    "yearn": 14,
    "balancer": 15,
    "1inch": 16,
    "paraswap": 17,
    "opensea": 18,
    "blur": 19,
    "x2y2": 20,
    "snapshot": 21,
    "gnosis_safe": 22,
    "frax": 23,
    "rocket_pool": 24,
    "pendle": 25,
    "gmx": 26,
    "dydx": 27,
    "synthetix": 28,
    "chainlink": 29,
    "other": 30,
}

# ── Asset vocabulary ──────────────────────────────────────────────────────────
# Common ERC-20 tokens and ETH; anything not listed maps to 0.
ASSET_VOCAB: Dict[str, int] = {
    "<OOV>": 0,
    "eth": 1,
    "weth": 2,
    "usdc": 3,
    "usdt": 4,
    "dai": 5,
    "wbtc": 6,
    "steth": 7,
    "wsteth": 8,
    "reth": 9,
    "frxeth": 10,
    "cbeth": 11,
    "link": 12,
    "uni": 13,
    "aave": 14,
    "crv": 15,
    "cvx": 16,
    "snx": 17,
    "mkr": 18,
    "comp": 19,
    "bal": 20,
    "ldo": 21,
    "matic": 22,
    "arb": 23,
    "op": 24,
    "gmx": 25,
    "pendle": 26,
    "frax": 27,
    "fxs": 28,
    "other": 29,
}

# Vocabulary sizes (used to size embedding tables)
ACTION_TYPE_VOCAB_SIZE: int = len(ACTION_TYPE_VOCAB)
PROTOCOL_VOCAB_SIZE: int = len(PROTOCOL_VOCAB)
ASSET_VOCAB_SIZE: int = len(ASSET_VOCAB)


def encode_action_type(action_type: str) -> int:
    """Map an action_type string to its integer index.

    Args:
        action_type: One of the six canonical action types or any string.

    Returns:
        Integer index; 0 for unknown values.
    """
    return ACTION_TYPE_VOCAB.get(action_type.upper() if action_type else "", 0)


def encode_protocol(protocol: str) -> int:
    """Map a protocol string to its integer index.

    Args:
        protocol: Protocol name (case-insensitive).

    Returns:
        Integer index; 0 for unknown values.
    """
    return PROTOCOL_VOCAB.get(protocol.lower() if protocol else "", 0)


def encode_asset(asset: str) -> int:
    """Map an asset symbol to its integer index.

    Args:
        asset: Asset symbol (case-insensitive).

    Returns:
        Integer index; 0 for unknown values.
    """
    return ASSET_VOCAB.get(asset.lower() if asset else "", 0)


def encode_action(action: dict) -> tuple[int, int, int]:
    """Encode a single wallet action dict into (action_type_idx, protocol_idx, asset_idx).

    Args:
        action: Dict with keys action_type, protocol, asset_in (or asset_out).

    Returns:
        Tuple of three integer indices.
    """
    action_type_idx = encode_action_type(action.get("action_type", ""))
    protocol_idx = encode_protocol(action.get("protocol", ""))
    # Use asset_in as the primary asset; fall back to asset_out
    asset = action.get("asset_in") or action.get("asset_out") or ""
    asset_idx = encode_asset(asset)
    return action_type_idx, protocol_idx, asset_idx
