#!/usr/bin/env bash
# Dump Postgres database from Supabase to a custom-format dump file plus a
# plaintext schema-only file (for diffing against supabase/migrations/).
#
# Args:
#   $1  output directory (e.g. backups/2026-05-06/db)
#
# Requires env: SUPABASE_DB_URL
set -euo pipefail

dump_db() {
  local out_dir="$1"
  mkdir -p "$out_dir"

  log "DB: dumping schema (plaintext)…"
  pg_dump "$SUPABASE_DB_URL" \
    --schema-only \
    --no-owner --no-privileges \
    --schema=public --schema=auth --schema=storage \
    -f "$out_dir/schema.sql"

  log "DB: dumping full database (custom format, includes auth + storage data)…"
  # We exclude Supabase-managed schemas that re-create themselves on a fresh
  # project. We KEEP: public (app data), auth (staff users), storage (bucket
  # metadata + object records). pg_restore can pick and choose at restore time.
  pg_dump "$SUPABASE_DB_URL" \
    --format=custom \
    --no-owner --no-privileges \
    --schema=public --schema=auth --schema=storage \
    -f "$out_dir/full.dump"

  log "DB: dump complete ($(size_of "$out_dir/full.dump"))."
}
