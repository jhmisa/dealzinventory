#!/usr/bin/env bash
# PostToolUse(Bash) hook: after a `git commit` that changed source but not the
# project hub, remind Claude to log the change. Non-blocking (commit already ran).
set -uo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
INPUT="$(cat)"

# Extract the command string. Prefer jq; fall back to grep.
if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
else
  CMD="$(printf '%s' "$INPUT" | grep -o '"command"[^,]*' | head -1)"
fi

# Only react to git commits.
case "$CMD" in
  *"git commit"*) : ;;
  *) exit 0 ;;
esac

cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Files in the most recent commit.
FILES="$(git show --name-only --pretty=format: HEAD 2>/dev/null | sed '/^$/d')"
[[ -z "$FILES" ]] && exit 0   # nothing committed (e.g. empty/failed commit)

# Hub already updated? Then nothing to nag about.
if printf '%s\n' "$FILES" | grep -q '^docs/PROJECT_STATE.md$'; then
  exit 0
fi

# Did this commit touch tracked source domains?
if printf '%s\n' "$FILES" | grep -Eq '^(src/|supabase/)'; then
  echo "REMINDER: commit $(git rev-parse --short HEAD) changed source but did not update docs/PROJECT_STATE.md. Update the hub (Now / Recently shipped + what it touched) and check off any completed todos in the active plan. Commit the doc update as a follow-up." 1>&2
  exit 2
fi

exit 0
