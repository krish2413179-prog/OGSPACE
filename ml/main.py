"""
MirrorMind ML Microservice

FastAPI application that serves as the entry point for the ML microservice.
The gRPC server (BehavioralModelService) runs alongside the HTTP server via asyncio.

HTTP endpoints (used by the API Server's mlClient):
  POST /train                  — train a behavioral model from wallet actions
  GET  /model/{wallet_address} — return cached model info for a wallet
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import struct
import sys
import time
import uuid

# Ensure the project root is in sys.path so 'ml' is importable as a package
# when this file is executed directly as a script (e.g., python ml/main.py)
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# gRPC server handle (set during startup, cleared on shutdown)
_grpc_server = None

# In-memory model cache shared with grpc_server (wallet_address → info dict)
# We import the same dict used by the gRPC server so both share state.
_http_model_cache: Dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage application lifespan: start gRPC server on startup, stop on shutdown."""
    global _grpc_server

    grpc_port = int(os.getenv("GRPC_PORT", "50051"))

    if os.getenv("ENABLE_GRPC", "false").lower() == "true":
        try:
            from ml.grpc_server import serve as grpc_serve

            _grpc_server = await grpc_serve(port=grpc_port)
            logger.info("MirrorMind ML Microservice started (gRPC port %d)", grpc_port)
        except Exception:
            logger.exception("Failed to start gRPC server — continuing without gRPC")
    else:
        logger.info("MirrorMind ML Microservice started (gRPC disabled)")

    yield

    if _grpc_server is not None:
        logger.info("Stopping gRPC server...")
        await _grpc_server.stop(grace=5)
        _grpc_server = None

    logger.info("MirrorMind ML Microservice shut down")


app = FastAPI(
    title="MirrorMind ML Microservice",
    description=(
        "Behavioral model training and inference service. "
        "Computes 512-dimensional behavioral fingerprints from on-chain wallet action sequences."
    ),
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint — service info."""
    return {
        "service": "mirrormind-ml",
        "version": "1.0.0",
        "grpc_port": os.getenv("GRPC_PORT", "50051"),
    }


# ── HTTP request / response models ────────────────────────────────────────────

class WalletActionHTTP(BaseModel):
    tx_hash: str
    action_type: str
    protocol: str = ""
    asset_in: str = ""
    asset_out: str = ""
    amount_usd: float = 0.0
    block_timestamp: int = 0
    block_number: int = 0


class TrainRequest(BaseModel):
    wallet_address: str
    actions: List[WalletActionHTTP]
    model_version: int = 1


class ModelDimensionsHTTP(BaseModel):
    risk_profile: int = 64
    timing_patterns: int = 64
    protocol_preferences: int = 128
    asset_behavior: int = 128
    decision_context: int = 128
    total: int = 512


class TrainResponse(BaseModel):
    vector_b64: str          # base64-encoded 512 float32 LE bytes
    performance_score: float
    model_version: int
    dimensions: ModelDimensionsHTTP
    model_id: str


class ModelInfoResponse(BaseModel):
    wallet_address: str
    model_version: int
    performance_score: float
    dimensions: ModelDimensionsHTTP
    trained_at: int


# ── HTTP endpoints ─────────────────────────────────────────────────────────────

@app.post("/train", response_model=TrainResponse)
async def train_model(request: TrainRequest) -> TrainResponse:
    """Train a behavioral model from wallet actions.

    Accepts a list of wallet actions, runs the transformer + backtester,
    and returns the 512-dim vector as base64 along with the performance score.

    Returns HTTP 422 if fewer than 10 actions are provided.
    """
    from ml.model.transformer import extract_vector
    from ml.training.backtester import compute_performance_score

    if len(request.actions) < 10:
        raise HTTPException(
            status_code=422,
            detail=(
                f"At least 10 wallet actions are required for model training; "
                f"got {len(request.actions)}."
            ),
        )

    action_dicts = [
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
        for a in request.actions
    ]

    try:
        import numpy as np
        vector: np.ndarray = extract_vector(action_dicts)
    except Exception as exc:
        logger.exception("extract_vector failed for wallet=%s", request.wallet_address)
        raise HTTPException(status_code=500, detail=f"Model inference failed: {exc}") from exc

    try:
        performance_score: float = compute_performance_score(action_dicts)
    except Exception:
        logger.exception("compute_performance_score failed for wallet=%s", request.wallet_address)
        performance_score = 50.0

    model_version = request.model_version if request.model_version > 0 else 1
    model_id = str(uuid.uuid4())
    trained_at = int(time.time())

    # Serialize vector to little-endian float32 bytes, then base64-encode
    vector_bytes = struct.pack(f"<{len(vector)}f", *vector.tolist())
    vector_b64 = base64.b64encode(vector_bytes).decode("ascii")

    # Cache for GET /model/{wallet_address}
    _http_model_cache[request.wallet_address] = {
        "wallet_address": request.wallet_address,
        "model_version": model_version,
        "performance_score": performance_score,
        "trained_at": trained_at,
    }

    # Also update the gRPC server's cache if available
    try:
        from ml.grpc_server import _model_cache as grpc_cache
        grpc_cache[request.wallet_address] = _http_model_cache[request.wallet_address]
    except Exception:
        pass  # gRPC server may not be running; non-fatal

    logger.info(
        "HTTP /train complete for wallet=%s: score=%.2f version=%d model_id=%s",
        request.wallet_address,
        performance_score,
        model_version,
        model_id,
    )

    return TrainResponse(
        vector_b64=vector_b64,
        performance_score=performance_score,
        model_version=model_version,
        dimensions=ModelDimensionsHTTP(),
        model_id=model_id,
    )


@app.get("/model/{wallet_address}", response_model=ModelInfoResponse)
async def get_model_info(wallet_address: str) -> ModelInfoResponse:
    """Return cached model info for a wallet address.

    Returns HTTP 404 if no model has been trained for the wallet.
    """
    # Check HTTP cache first, then gRPC cache
    cached = _http_model_cache.get(wallet_address)
    if cached is None:
        try:
            from ml.grpc_server import _model_cache as grpc_cache
            cached = grpc_cache.get(wallet_address)
        except Exception:
            pass

    if cached is None:
        raise HTTPException(
            status_code=404,
            detail=f"No trained model found for wallet address: {wallet_address}",
        )

    return ModelInfoResponse(
        wallet_address=cached["wallet_address"],
        model_version=cached["model_version"],
        performance_score=cached["performance_score"],
        dimensions=ModelDimensionsHTTP(),
        trained_at=cached["trained_at"],
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(
        "ml.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        reload=os.getenv("RELOAD", "false").lower() == "true",
        log_level="info",
    )
