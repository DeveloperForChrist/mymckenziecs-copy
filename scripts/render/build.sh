#!/usr/bin/env bash
set -euo pipefail

PYTHON_VENV_DIR="${PYTHON_VENV_DIR:-.render-python}"
PYTHON_REQUIREMENTS="${PYTHON_REQUIREMENTS:-scripts/case-law/requirements-milvus.txt}"
RENDER_STRICT_PYTHON_DEPS="${RENDER_STRICT_PYTHON_DEPS:-0}"
NODE_DEPS_STATE_FILE="${NODE_DEPS_STATE_FILE:-.render-node-deps.sha256}"

compute_file_sha256() {
  local file_path="$1"

  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "${file_path}" | awk '{print $1}'
    return
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "${file_path}" | awk '{print $1}'
    return
  fi

  openssl dgst -sha256 "${file_path}" | awk '{print $NF}'
}

install_python_deps() {
  echo "Creating Python virtualenv at ${PYTHON_VENV_DIR}"
  python3 -m venv "${PYTHON_VENV_DIR}"

  echo "Installing Python dependencies from ${PYTHON_REQUIREMENTS}"
  "${PYTHON_VENV_DIR}/bin/python" -m pip install --upgrade pip setuptools wheel
  "${PYTHON_VENV_DIR}/bin/pip" install -r "${PYTHON_REQUIREMENTS}"
}

install_node_deps() {
  local manifest_file=""
  if [ -f "package-lock.json" ]; then
    manifest_file="package-lock.json"
  elif [ -f "package.json" ]; then
    manifest_file="package.json"
  fi

  local current_hash=""
  local cached_hash=""
  if [ -n "${manifest_file}" ]; then
    current_hash="$(compute_file_sha256 "${manifest_file}")"
    if [ -f "${NODE_DEPS_STATE_FILE}" ]; then
      cached_hash="$(cat "${NODE_DEPS_STATE_FILE}")"
    fi
  fi

  if [ -d "node_modules" ] && [ -n "${current_hash}" ] && [ "${current_hash}" = "${cached_hash}" ]; then
    echo "Node dependencies already present for current dependency manifest; skipping install"
    return
  fi

  echo "Installing Node dependencies"
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi

  if [ -n "${current_hash}" ]; then
    printf '%s\n' "${current_hash}" > "${NODE_DEPS_STATE_FILE}"
  fi
}

copy_standalone_assets() {
  if [ ! -d ".next/standalone" ]; then
    echo "Standalone output not found; skipping static asset copy"
    return
  fi

  if [ -d "public" ]; then
    echo "Copying public assets into standalone output"
    cp -R public .next/standalone/
  fi

  if [ -d ".next/static" ]; then
    echo "Copying Next static assets into standalone output"
    mkdir -p .next/standalone/.next
    cp -R .next/static .next/standalone/.next/
  fi
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

install_node_deps

echo "Building Next.js app"
npm run build
copy_standalone_assets
