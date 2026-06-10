#!/usr/bin/env bash
# Shared driver for baseline and weekly backups. Sourced by ../baseline.sh
# and ../weekly.sh, which call run_backup with a kind argument.
set -euo pipefail

# git_bundle is only used in baseline runs.
git_bundle() {
  local out_dir="$1"
  local repo_root="$2"
  mkdir -p "$out_dir"
  log "Git: bundling repo (--all)…"
  git -C "$repo_root" bundle create "$out_dir/repo.bundle" --all
  git -C "$repo_root" rev-parse HEAD > "$out_dir/HEAD.txt"
  log "Git: bundle complete ($(size_of "$out_dir/repo.bundle"))."
}

# run_backup <kind:baseline|weekly> <repo_root>
run_backup() {
  local kind="$1"
  local repo_root="$2"
  [[ "$kind" == "baseline" || "$kind" == "weekly" ]] || die "run_backup: invalid kind '$kind'"

  check_prereqs
  load_env "$repo_root"

  local date_stamp
  date_stamp="$(date +%Y-%m-%d)"
  local backup_root="$repo_root/backups/${kind}-${date_stamp}"

  if [[ -e "$backup_root" ]]; then
    die "Backup folder already exists: $backup_root. Move it aside before re-running."
  fi
  mkdir -p "$backup_root"
  log "Backup folder: $backup_root"

  local manifest="$backup_root/manifest.json"
  manifest_init "$manifest" "$kind"

  # 1) DB
  dump_db "$backup_root/db"
  local db_pre_sha
  db_pre_sha="$(sha256_of "$backup_root/db/full.dump")"
  encrypt_file "$backup_root/db/full.dump" "$backup_root/db/full.dump.enc"
  manifest_add "$manifest" db "db/full.dump.enc"  true  "$db_pre_sha"
  manifest_add "$manifest" db "db/schema.sql"     false ""

  # 2) Storage (id-documents tar gets encrypted; the public buckets do not).
  mirror_storage "$backup_root/storage"
  for bucket in photo-group-media kaitori-media item-media; do
    manifest_add "$manifest" storage "storage/${bucket}.tar.zst" false ""
  done
  local id_pre_sha
  id_pre_sha="$(sha256_of "$backup_root/storage/id-documents.tar.zst")"
  encrypt_file \
    "$backup_root/storage/id-documents.tar.zst" \
    "$backup_root/storage/id-documents.tar.zst.enc"
  manifest_add "$manifest" storage "storage/id-documents.tar.zst.enc" true "$id_pre_sha"

  # 3) Edge functions
  snapshot_functions "$backup_root/functions" "$repo_root"
  manifest_add "$manifest" functions "functions/functions.tar.zst" false ""
  if [[ -f "$backup_root/functions/deployed.txt" ]]; then
    manifest_add "$manifest" functions "functions/deployed.txt" false ""
  fi

  # 4) Git bundle (baseline only)
  if [[ "$kind" == "baseline" ]]; then
    git_bundle "$backup_root/git" "$repo_root"
    manifest_add "$manifest" git "git/repo.bundle" false ""
    manifest_add "$manifest" git "git/HEAD.txt"    false ""
  fi

  # 5) Final summary
  local total_size
  total_size="$(size_of "$backup_root")"
  log "Manifest: $(jq '.artifacts | length' "$manifest") artifacts written."

  printf '\n'
  printf '======================================================================\n'
  printf '  Backup complete: %s (%s)\n' "$backup_root" "$total_size"
  printf '======================================================================\n'
  printf '\n'
  printf '  Open in Finder:    open "%s"\n' "$backup_root"
  printf '  Verify integrity:  scripts/backup/lib/verify-manifest.sh "%s"\n' "$backup_root"
  printf '  Upload to Drive:   drag the folder into Dealz-Backups/ in https://drive.google.com\n'
  printf '\n'
  printf '  After upload, delete the local folder if you want:\n'
  printf '    rm -rf "%s"\n' "$backup_root"
  printf '\n'
}
