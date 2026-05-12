"""
Backtesting module for behavioral model evaluation.

Computes Performance_Score by:
1. Splitting actions into train set (all except last 30 days) and test set (last 30 days)
2. For each action in the test set, predicting the action type given the preceding context
3. Computing accuracy as correct_predictions / total_test_actions * 100
4. Clamping to [0.0, 100.0]

If fewer than 2 test actions exist, returns 50.0 (neutral score).
"""

from __future__ import annotations

from typing import List

import torch

from ml.model.action_encoder import ACTION_TYPE_VOCAB_SIZE
from ml.model.transformer import (
    BehavioralTransformer,
    _get_model,
    encode_actions,
)

# 30 days in seconds
_THIRTY_DAYS_SECONDS: int = 30 * 24 * 60 * 60


def _split_actions(
    actions: List[dict],
) -> tuple[List[dict], List[dict]]:
    """Split actions into train (before last 30 days) and test (last 30 days) sets.

    The split is based on the block_timestamp field (Unix seconds).
    If block_timestamp is missing or zero, the action is treated as very old
    and placed in the train set.

    Args:
        actions: List of wallet action dicts sorted by block_timestamp ascending.

    Returns:
        (train_actions, test_actions) tuple.
    """
    if not actions:
        return [], []

    # Determine the cutoff: max timestamp minus 30 days
    timestamps = [int(a.get("block_timestamp", 0)) for a in actions]
    max_ts = max(timestamps) if timestamps else 0
    cutoff = max_ts - _THIRTY_DAYS_SECONDS

    train_actions = [a for a, ts in zip(actions, timestamps) if ts < cutoff]
    test_actions = [a for a, ts in zip(actions, timestamps) if ts >= cutoff]

    return train_actions, test_actions


def _predict_action_type(
    model: BehavioralTransformer,
    context: List[dict],
) -> str:
    """Predict the most likely next action type given a context sequence.

    Uses the model's output vector to score each action type via a simple
    dot-product with the first ACTION_TYPE_VOCAB_SIZE dimensions of the vector.

    Args:
        model: The BehavioralTransformer in eval mode.
        context: List of preceding wallet action dicts (at least 1).

    Returns:
        Predicted action type string (e.g. "TRADE").
    """
    from ml.model.action_encoder import ACTION_TYPE_VOCAB

    if not context:
        return "OTHER"

    x = encode_actions(context)
    with torch.no_grad():
        vector = model(x).squeeze(0)  # (512,)

    # Use the first ACTION_TYPE_VOCAB_SIZE dimensions as logits over action types
    # (a lightweight classification head without extra parameters)
    n_classes = min(ACTION_TYPE_VOCAB_SIZE, vector.shape[0])
    logits = vector[:n_classes]
    predicted_idx = int(logits.argmax().item())

    # Reverse-lookup the action type string
    idx_to_type = {v: k for k, v in ACTION_TYPE_VOCAB.items()}
    return idx_to_type.get(predicted_idx, "OTHER")


def compute_performance_score(actions: List[dict]) -> float:
    """Compute the Performance_Score for a wallet's action history.

    Algorithm:
    1. Split actions into train (before last 30 days) and test (last 30 days).
    2. If fewer than 2 test actions exist, return 50.0 (neutral score).
    3. For each test action at index i, use all preceding actions as context
       and predict the action type.
    4. Accuracy = correct_predictions / total_test_actions * 100.
    5. Clamp to [0.0, 100.0].

    Args:
        actions: List of wallet action dicts. Must contain at least 1 action.
                 Each dict should have block_timestamp and action_type fields.

    Returns:
        Performance_Score in [0.0, 100.0].
    """
    if not actions:
        return 50.0

    # Sort by timestamp ascending for correct temporal ordering
    sorted_actions = sorted(
        actions,
        key=lambda a: int(a.get("block_timestamp", 0)),
    )

    train_actions, test_actions = _split_actions(sorted_actions)

    if len(test_actions) < 2:
        return 50.0

    model = _get_model()
    model.eval()

    correct = 0
    total = len(test_actions)

    for i, test_action in enumerate(test_actions):
        # Context = all train actions + test actions seen so far
        context = train_actions + test_actions[:i]

        if not context:
            # No context available; skip this prediction
            continue

        predicted = _predict_action_type(model, context)
        actual = test_action.get("action_type", "OTHER")

        if predicted == actual:
            correct += 1

    if total == 0:
        return 50.0

    score = (correct / total) * 100.0
    # Clamp to [0.0, 100.0]
    return float(max(0.0, min(100.0, score)))
