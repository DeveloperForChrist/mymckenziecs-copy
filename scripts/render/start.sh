#!/usr/bin/env bash
set -euo pipefail

PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-.render-python}"
START_PY_BRIDGE="${START_PY_BRIDGE:-1}"
PY_BRIDGE_HOST="${PY_BRIDGE_HOST:-127.0.0.1}"
PY_BRIDGE_PORT="${PY_BRIDGE_PORT:-8000}"

if [ -x "${PYTHON_VENV_DIR}/bin/python" ]; then
  export PYTHON_BIN="${PWD}/${PYTHON_VENV_DIR}/bin/python"
  export PATH="${PWD}/${PYTHON_VENV_DIR}/bin:${PATH}"
fi

export PY_BRIDGE_URL="${PY_BRIDGE_URL:-http://${PY_BRIDGE_HOST}:${PY_BRIDGE_PORT}}"

if [ "${START_PY_BRIDGE}" = "1" ]; then
  if [ -n "${PYTHON_BIN:-}" ]; then
    echo "Starting Python Milvus bridge at ${PY_BRIDGE_URL}"
    PY_BRIDGE_HOST="${PY_BRIDGE_HOST}" PY_BRIDGE_PORT="${PY_BRIDGE_PORT}" \
      "${PYTHON_BIN}" scripts/case-law/milvus_bridge.py &
  else
    echo "WARNING: Python runtime is unavailable; Python Milvus bridge will not start."
  fi
fi

if [ -f ".next/standalone/server.js" ]; then
  echo "Starting Next.js standalone server"
  export HOSTNAME="${HOSTNAME:-0.0.0.0}"
  exec node .next/standalone/server.js
fi

echo "Standalone server not found; falling back to npm start"
exec npm start
