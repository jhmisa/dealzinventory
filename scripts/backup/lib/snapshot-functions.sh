#!/usr/bin/env bash
# Snapshot the supabase/functions/ directory and capture the list of currently
# deployed functions on the live project.
#
# Args:
#   $1  output directory (e.g. backups/2026-05-06/functions)
#   $2  repo root (so we can find supabase/functions)
#
# Requires: supabase CLI logged in OR SUPABASE_ACCESS_TOKEN set.
set -euo pipefail

snapshot_functions() {
  local out_dir="$1"
  local repo_root="$2"
  mkdir -p "$out_dir"

  if [[ ! -d "$repo_root/supabase/functions" ]]; then
    die "snapshot_functions: $repo_root/supabase/functions does not exist."
  fi

  log "Functions: tarring supabase/functions/ source…"
  tar --use-compress-program='zstd -19 --long' \
      -cf "$out_dir/functions.tar.zst" \
      -C "$repo_root/supabase" functions

  log "Functions: querying live deployment list…"
  if supabase functions list --project-ref "$SUPABASE_PROJECT_REF" \
       > "$out_dir/deployed.txt" 2>"$out_dir/deployed.err"; then
    rm -f "$out_dir/deployed.err"
  else
    log "Functions: WARN — \`supabase functions list\` failed. See deployed.err. Continuing."
  fi

  log "Functions: snapshot complete ($(size_of "$out_dir/functions.tar.zst"))."
}
