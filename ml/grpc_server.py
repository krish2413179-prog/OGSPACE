"""
gRPC server for the MirrorMind ML Microservice.

Implements BehavioralModelServiceServicer with:
- TrainModel: validates actions >= 10, runs transformer + backtester,
              returns TrainModelResponse with 512-dim vector.
- GetModelInfo: returns cached model info keyed by wallet_address.
- serve(port): async function to start the gRPC server.
"""

from __future__ import annotations

import logging
import struct
import time
import uuid
from typing import Dict

import grpc
import grpc.aio
import numpy as np

from ml.model.transformer import extract_vector
from ml.proto import behavioral_model_pb2 as pb2
from ml.proto import behavioral_model_pb2_grpc as pb2_grpc
from ml.training.backtester import compute_performance_score

logger = logging.getLogger(__name__)

# In-memory cache: wallet_address → GetModelInfoResponse data dict
_model_cache: Dict[str, dict] = {}

# Dimension constants matching the proto ModelDimensions message
_DIMENSIONS = pb2.ModelDimensions(
    risk_profile=64,
    timing_patterns=64,
    protocol_preferences=128,
    asset_behavior=128,
    decision_context=128,
    total=512,
)


def _wallet_actions_from_proto(proto_actions) -> list[dict]:
    """Convert repeated WalletAction proto messages to plain dicts."""
    return [
        {
            "tx_hash": a.tx_hash,
            "action_type": a.action_type,
            "protocol": a.protocol,
            "asset_in": a.asset_in,
            "asset_out": a.asset_out,
            "amount_usd": a.amount_usd,
            "block_timestamp": a.block_timestamp,
            "block_number": a.block_number,
        }
        for a in proto_actions
    ]


def _vector_to_bytes(vector: np.ndarray) -> bytes:
    """Serialize a float32 numpy array to little-endian bytes."""
    return struct.pack(f"<{len(vector)}f", *vector.tolist())


class BehavioralModelServicer(pb2_grpc.BehavioralModelServiceServicer):
    """Concrete implementation of BehavioralModelService."""

    def TrainModel(self, request, context):
        """Train a behavioral model from wallet actions.

        Validates that at least 10 actions are provided, then:
        1. Converts proto WalletAction messages to dicts.
        2. Calls extract_vector() to get the 512-dim behavioral vector.
        3. Calls compute_performance_score() for the backtested score.
        4. Caches the result and returns TrainModelResponse.

        Raises:
            grpc.StatusCode.INVALID_ARGUMENT if fewer than 10 actions provided.
        """
        wallet_address = request.wallet_address
        actions = list(request.actions)

        logger.info(
            "TrainModel called for wallet=%s with %d actions",
            wallet_address,
            len(actions),
        )

        if len(actions) < 10:
            context.set_code(grpc.StatusCode.INVALID_ARGUMENT)
            context.set_details(
                f"At least 10 wallet actions are required for model training; "
                f"got {len(actions)}."
            )
            return pb2.TrainModelResponse()

        action_dicts = _wallet_actions_from_proto(actions)

        try:
            vector: np.ndarray = extract_vector(action_dicts)
        except Exception as exc:
            logger.exception("extract_vector failed for wallet=%s", wallet_address)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Model inference failed: {exc}")
            return pb2.TrainModelResponse()

        try:
            performance_score: float = compute_performance_score(action_dicts)
        except Exception as exc:
            logger.exception("compute_performance_score failed for wallet=%s", wallet_address)
            # Non-fatal: fall back to neutral score
            performance_score = 50.0

        model_version = request.model_version if request.model_version > 0 else 1
        model_id = str(uuid.uuid4())
        trained_at = int(time.time())

        # Cache the result for GetModelInfo
        _model_cache[wallet_address] = {
            "wallet_address": wallet_address,
            "model_version": model_version,
            "performance_score": performance_score,
            "trained_at": trained_at,
        }

        vector_bytes = _vector_to_bytes(vector)

        response = pb2.TrainModelResponse(
            vector=vector_bytes,
            performance_score=performance_score,
            model_version=model_version,
            dimensions=_DIMENSIONS,
            model_id=model_id,
        )

        logger.info(
            "TrainModel complete for wallet=%s: score=%.2f version=%d model_id=%s",
            wallet_address,
            performance_score,
            model_version,
            model_id,
        )

        return response

    def GetModelInfo(self, request, context):
        """Return cached model info for a wallet address.

        Returns the most recently trained model info from the in-memory cache.
        If no model has been trained for the wallet, returns NOT_FOUND.
        """
        wallet_address = request.wallet_address

        cached = _model_cache.get(wallet_address)
        if cached is None:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details(
                f"No trained model found for wallet address: {wallet_address}"
            )
            return pb2.GetModelInfoResponse()

        return pb2.GetModelInfoResponse(
            wallet_address=cached["wallet_address"],
            model_version=cached["model_version"],
            performance_score=cached["performance_score"],
            dimensions=_DIMENSIONS,
            trained_at=cached["trained_at"],
        )


async def serve(port: int = 50051) -> grpc.aio.Server:
    """Start the async gRPC server on the given port.

    Args:
        port: TCP port to listen on (default 50051).

    Returns:
        The running grpc.aio.Server instance.
    """
    server = grpc.aio.server()
    pb2_grpc.add_BehavioralModelServiceServicer_to_server(
        BehavioralModelServicer(), server
    )
    listen_addr = f"[::]:{port}"
    server.add_insecure_port(listen_addr)
    await server.start()
    logger.info("gRPC server listening on %s", listen_addr)
    return server
