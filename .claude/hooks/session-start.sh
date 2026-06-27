#!/usr/bin/env bash
# SessionStart hook: inject the project command center (PROJECT_STATE.md)
# into Claude's context at the start of every session. No-op if absent.
set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
STATE_FILE="$PROJECT_DIR/docs/PROJECT_STATE.md"

if [[ -f "$STATE_FILE" ]]; then
  echo "===== docs/PROJECT_STATE.md — project command center (current state, auto-loaded) ====="
  cat "$STATE_FILE"
  echo "===== end PROJECT_STATE.md ====="
fi
exit 0
