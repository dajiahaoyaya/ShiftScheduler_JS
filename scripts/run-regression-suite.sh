#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

ARTIFACT_DIR="$ROOT_DIR/artifacts/bugs"
mkdir -p "$ARTIFACT_DIR"

# 清理本次套件会产出的旧文件，避免误读历史结果
rm -f \
  "$ARTIFACT_DIR/p0-main-flow-bugs.json" \
  "$ARTIFACT_DIR/p0-main-flow-bugs.md" \
  "$ARTIFACT_DIR/p1-random-5rounds-bugs.json" \
  "$ARTIFACT_DIR/p1-random-5rounds-bugs.md" \
  "$ARTIFACT_DIR/p1-vacation-conflict-guard-bugs.json" \
  "$ARTIFACT_DIR/p1-vacation-conflict-guard-bugs.md" \
  "$ARTIFACT_DIR/p1-vacation-conflict-random-5rounds-bugs.json" \
  "$ARTIFACT_DIR/p1-vacation-conflict-random-5rounds-bugs.md" \
  "$ARTIFACT_DIR/p1-vacation-conflict-continuous-guard-bugs.json" \
  "$ARTIFACT_DIR/p1-vacation-conflict-continuous-guard-bugs.md"

set +e
bash scripts/run-playwright.sh test \
  tests/e2e/p0-main-flow.spec.js \
  tests/e2e/p1-night-random-5rounds.spec.js \
  tests/e2e/p1-vacation-conflict-guard.spec.js \
  tests/e2e/p1-vacation-conflict-extended.spec.js \
  --project=chromium
TEST_EXIT=$?
set -e

NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  if command -v node >/dev/null 2>&1; then
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

"$NODE_BIN" scripts/summarize-bug-artifacts.js
exit "$TEST_EXIT"
