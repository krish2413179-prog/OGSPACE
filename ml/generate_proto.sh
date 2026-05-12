#!/usr/bin/env bash
# Generate Python gRPC stubs from behavioral_model.proto
# Run from the ml/ directory: bash generate_proto.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROTO_DIR="${SCRIPT_DIR}/proto"
OUT_DIR="${SCRIPT_DIR}/proto"

echo "Generating Python gRPC stubs from ${PROTO_DIR}/behavioral_model.proto ..."

python -m grpc_tools.protoc \
  --proto_path="${PROTO_DIR}" \
  --python_out="${OUT_DIR}" \
  --grpc_python_out="${OUT_DIR}" \
  "${PROTO_DIR}/behavioral_model.proto"

echo "Done. Generated files:"
echo "  ${OUT_DIR}/behavioral_model_pb2.py"
echo "  ${OUT_DIR}/behavioral_model_pb2_grpc.py"
