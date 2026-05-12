"""
Lightweight transformer model for behavioral fingerprinting.

Architecture:
- Embedding layer: action_type + protocol + asset (128-dim each → concat → 384-dim)
- Linear projection: 384 → 256
- 4-layer TransformerEncoder (8 heads, 256 hidden dim, 1024 ff dim)
- Mean pooling over sequence
- Linear projection: 256 → 512 (behavioral vector)

Output partitioning (512 dims total):
- Risk Profile:          dims [0:64]
- Timing Patterns:       dims [64:128]
- Protocol Preferences:  dims [128:256]
- Asset Behavior:        dims [256:384]
- Decision Context:      dims [384:512]
"""

from __future__ import annotations

import math
from typing import List

import numpy as np
import torch
import torch.nn as nn

from ml.model.action_encoder import (
    ACTION_TYPE_VOCAB_SIZE,
    ASSET_VOCAB_SIZE,
    PROTOCOL_VOCAB_SIZE,
    encode_action,
)

# ── Constants ─────────────────────────────────────────────────────────────────
EMBED_DIM: int = 128          # per-field embedding dimension
CONCAT_DIM: int = 384         # 3 × EMBED_DIM after concatenation
PROJ_DIM: int = 256           # projection dimension fed into transformer
FF_DIM: int = 1024            # transformer feed-forward hidden dim
N_HEADS: int = 8              # attention heads
N_LAYERS: int = 4             # transformer encoder layers
OUTPUT_DIM: int = 512         # final behavioral vector dimension
MAX_SEQ_LEN: int = 1000       # maximum number of actions to process

# Output segment boundaries
RISK_PROFILE_SLICE = slice(0, 64)
TIMING_PATTERNS_SLICE = slice(64, 128)
PROTOCOL_PREFERENCES_SLICE = slice(128, 256)
ASSET_BEHAVIOR_SLICE = slice(256, 384)
DECISION_CONTEXT_SLICE = slice(384, 512)


class BehavioralTransformer(nn.Module):
    """Lightweight transformer encoder for behavioral fingerprinting.

    Accepts a batch of encoded action sequences and returns a 512-dimensional
    behavioral vector per sequence.
    """

    def __init__(self) -> None:
        super().__init__()

        # Embedding tables for each categorical field
        self.action_type_embed = nn.Embedding(ACTION_TYPE_VOCAB_SIZE, EMBED_DIM, padding_idx=0)
        self.protocol_embed = nn.Embedding(PROTOCOL_VOCAB_SIZE, EMBED_DIM, padding_idx=0)
        self.asset_embed = nn.Embedding(ASSET_VOCAB_SIZE, EMBED_DIM, padding_idx=0)

        # Project concatenated embeddings (384) → transformer hidden dim (256)
        self.input_proj = nn.Linear(CONCAT_DIM, PROJ_DIM)

        # Positional encoding (sinusoidal, fixed)
        self.register_buffer("pos_enc", self._build_pos_enc(MAX_SEQ_LEN, PROJ_DIM))

        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=PROJ_DIM,
            nhead=N_HEADS,
            dim_feedforward=FF_DIM,
            dropout=0.0,          # deterministic at inference
            batch_first=True,
            norm_first=True,      # pre-norm for stability
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=N_LAYERS)

        # Output projection: 256 → 512
        self.output_proj = nn.Linear(PROJ_DIM, OUTPUT_DIM)

        # Initialize weights
        self._init_weights()

    # ── Weight initialisation ─────────────────────────────────────────────────

    def _init_weights(self) -> None:
        """Xavier uniform init for linear layers; normal for embeddings."""
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.Embedding):
                nn.init.normal_(module.weight, mean=0.0, std=0.02)
                if module.padding_idx is not None:
                    module.weight.data[module.padding_idx].zero_()

    # ── Positional encoding ───────────────────────────────────────────────────

    @staticmethod
    def _build_pos_enc(max_len: int, d_model: int) -> torch.Tensor:
        """Build sinusoidal positional encoding table of shape (1, max_len, d_model)."""
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2, dtype=torch.float) * (-math.log(10000.0) / d_model)
        )
        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)
        return pe.unsqueeze(0)  # (1, max_len, d_model)

    # ── Forward pass ──────────────────────────────────────────────────────────

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Compute behavioral vector from encoded action sequence.

        Args:
            x: LongTensor of shape (batch, seq_len, 3) where the last dim is
               [action_type_idx, protocol_idx, asset_idx].

        Returns:
            FloatTensor of shape (batch, 512).
        """
        batch_size, seq_len, _ = x.shape

        # Embed each field and concatenate → (batch, seq_len, 384)
        action_emb = self.action_type_embed(x[:, :, 0])   # (B, S, 128)
        protocol_emb = self.protocol_embed(x[:, :, 1])    # (B, S, 128)
        asset_emb = self.asset_embed(x[:, :, 2])          # (B, S, 128)
        combined = torch.cat([action_emb, protocol_emb, asset_emb], dim=-1)  # (B, S, 384)

        # Project to transformer dim → (batch, seq_len, 256)
        projected = self.input_proj(combined)

        # Add positional encoding
        projected = projected + self.pos_enc[:, :seq_len, :]

        # Transformer encoder → (batch, seq_len, 256)
        encoded = self.transformer(projected)

        # Mean pooling over sequence dimension → (batch, 256)
        pooled = encoded.mean(dim=1)

        # Output projection → (batch, 512)
        vector = self.output_proj(pooled)

        return vector


# ── Module-level singleton (lazy-initialised) ─────────────────────────────────
_model: BehavioralTransformer | None = None


def _get_model() -> BehavioralTransformer:
    """Return the module-level model singleton in eval mode."""
    global _model
    if _model is None:
        _model = BehavioralTransformer()
        _model.eval()
    return _model


# ── Public helpers ────────────────────────────────────────────────────────────

def encode_actions(actions: List[dict]) -> torch.Tensor:
    """Encode a list of wallet action dicts into a model-ready tensor.

    Args:
        actions: List of dicts with keys action_type, protocol, asset_in, asset_out.

    Returns:
        LongTensor of shape (1, seq_len, 3) — batch dimension of 1.
    """
    if not actions:
        raise ValueError("actions list must not be empty")

    # Truncate to MAX_SEQ_LEN
    actions = actions[:MAX_SEQ_LEN]

    indices = [encode_action(a) for a in actions]
    tensor = torch.tensor(indices, dtype=torch.long)  # (seq_len, 3)
    return tensor.unsqueeze(0)                         # (1, seq_len, 3)


def extract_vector(actions: List[dict]) -> np.ndarray:
    """Compute the 512-dimensional behavioral vector for a list of wallet actions.

    This is the primary public API for the transformer module.

    Args:
        actions: List of wallet action dicts (at least 1 required).

    Returns:
        numpy array of shape (512,) with dtype float32.

    Raises:
        ValueError: If actions is empty.
    """
    model = _get_model()
    x = encode_actions(actions)

    with torch.no_grad():
        vector = model(x)  # (1, 512)

    return vector.squeeze(0).numpy().astype(np.float32)
