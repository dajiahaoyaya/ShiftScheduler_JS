#!/usr/bin/env bash
set -euo pipefail

NODE_BIN="${NODE_BIN:-}"

if [[ -z "$NODE_BIN" ]]; then
  if [[ -n "${WSL_DISTRO_NAME:-}" ]]; then
    if command -v node.exe >/dev/null 2>&1; then
      NODE_BIN="$(command -v node.exe)"
    elif [[ -x "/mnt/f/program_setup/nodejs_20260104/node.exe" ]]; then
      NODE_BIN="/mnt/f/program_setup/nodejs_20260104/node.exe"
    elif command -v node >/dev/null 2>&1; then
      NODE_BIN="$(command -v node)"
    else
      echo "Node runtime not found. Set NODE_BIN to your node executable path." >&2
      exit 1
    fi
  elif command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif command -v node.exe >/dev/null 2>&1; then
    NODE_BIN="$(command -v node.exe)"
  elif [[ -x "/mnt/f/program_setup/nodejs_20260104/node.exe" ]]; then
    NODE_BIN="/mnt/f/program_setup/nodejs_20260104/node.exe"
  else
    echo "Node runtime not found. Set NODE_BIN to your node executable path." >&2
    exit 1
  fi
fi

exec "$NODE_BIN" "./node_modules/playwright/cli.js" "$@"
