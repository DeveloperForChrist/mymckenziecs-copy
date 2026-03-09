#!/usr/bin/env bash
set -euo pipefail

PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-.render-python}"

if [ -x "${PYTHON_VENV_DIR}/bin/python" ]; then
  export PYTHON_BIN="${PWD}/${PYTHON_VENV_DIR}/bin/python"
  export PATH="${PWD}/${PYTHON_VENV_DIR}/bin:${PATH}"
fi

exec npm start
