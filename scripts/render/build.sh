#!/usr/bin/env bash
set -euo pipefail

PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-.render-python}"
PYTHON_REQUIREMENTS="${PYTHON_REQUIREMENTS:-scripts/case-law/requirements-milvus.txt}"
RENDER_STRICT_PYTHON_DEPS="${RENDER_STRICT_PYTHON_DEPS:-0}"

install_python_deps() {
  echo "Creating Python virtualenv at ${PYTHON_VENV_DIR}"
  python3 -m venv "${PYTHON_VENV_DIR}"

  echo "Installing Python dependencies from ${PYTHON_REQUIREMENTS}"
  "${PYTHON_VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
  "${PYTHON_VENV_DIR}/bin/pip" install -r "${PYTHON_REQUIREMENTS}"
}

if command -v python3 >/dev/null 2>&1; then
  if ! install_python_deps; then
    echo "WARNING: Python dependency installation failed. Milvus runtime helpers may be unavailable on this deploy."
    if [ "${RENDER_STRICT_PYTHON_DEPS}" = "1" ]; then
      echo "RENDER_STRICT_PYTHON_DEPS=1, failing build."
      exit 1
    fi
  fi
else
  echo "WARNING: python3 is unavailable. Milvus runtime helpers will be skipped on this deploy."
  if [ "${RENDER_STRICT_PYTHON_DEPS}" = "1" ]; then
    echo "RENDER_STRICT_PYTHON_DEPS=1, failing build."
    exit 1
  fi
fi

echo "Installing Node dependencies"
npm install

echo "Building Next.js app"
npm run build
