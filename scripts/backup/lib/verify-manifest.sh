#!/usr/bin/env bash
# Verify a backup folder's manifest.json by re-hashing every artifact and
# comparing to the recorded sha256. Run this:
#   - immediately after baseline.sh / weekly.sh complete
#   - after copying the folder to Drive (download a sample file and check)
#   - before any restore attempt
#
# Usage:
#   scripts/backup/lib/verify-manifest.sh backups/2026-05-06
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

main() {
  local folder="${1:-}"
  [[ -n "$folder" && -d "$folder" ]] || die "Usage: $0 <backup-folder>"
  local manifest="$folder/manifest.json"
  [[ -f "$manifest" ]] || die "No manifest.json in $folder"

  require_cmd jq
  require_cmd shasum

  local total ok bad
  total=$(jq '.artifacts | length' "$manifest")
  ok=0; bad=0

  log "Verifying $total artifacts in $folder…"
  while IFS=$'\t' read -r path expected; do
    local abs="$folder/$path"
    if [[ ! -f "$abs" ]]; then
      log "  MISSING: $path"
      bad=$((bad+1))
      continue
    fi
    local actual
    actual=$(sha256_of "$abs")
    if [[ "$actual" == "$expected" ]]; then
      ok=$((ok+1))
    else
      log "  MISMATCH: $path"
      log "    expected: $expected"
      log "    actual:   $actual"
      bad=$((bad+1))
    fi
  done < <(jq -r '.artifacts[] | [.path, .sha256] | @tsv' "$manifest")

  log "Verification: $ok ok, $bad bad, of $total total."
  [[ "$bad" -eq 0 ]] || exit 1
}

main "$@"
