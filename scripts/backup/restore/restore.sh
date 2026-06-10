#!/usr/bin/env bash
# Restore a Dealz backup to a target Supabase project (Scenario A: NEW project).
#
# WORKFLOW (READ THIS BEFORE RUNNING):
#   1. Create a new Supabase project (or pick an existing empty one).
#   2. supabase link --project-ref <new-ref>
#   3. supabase db push                      # applies all migrations -> clean schema
#   4. Copy .env.restore.example to .env.restore, fill in TARGET_* values.
#      Make sure .env.backup is also in place (BACKUP_PASSPHRASE is read from it).
#   5. ./scripts/backup/restore/restore.sh <backup-folder>
#
# What this script does:
#   - Decrypts the encrypted artifacts (DB dump, ID-documents tar) using
#     BACKUP_PASSPHRASE.
#   - pg_restores DATA only into the target DB (schema came from migrations).
#   - Re-uploads storage objects to the target's Supabase Storage S3 endpoint.
#   - Deploys each edge function found in functions.tar.zst.
#
# What this script does NOT do (manual follow-up):
#   - Re-create edge function secrets (not in the dump).
#   - Update Vercel env vars to point at the new project.
#   - Re-enable any external webhooks pointed at the OLD project URL.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_LIB="$(cd "$SCRIPT_DIR/../lib" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# shellcheck source=../lib/common.sh
source "$BACKUP_LIB/common.sh"
# shellcheck source=../lib/encrypt.sh
source "$BACKUP_LIB/encrypt.sh"

require_target_env() {
  require_env TARGET_DB_URL
  require_env TARGET_PROJECT_REF
  require_env TARGET_S3_ACCESS_KEY_ID
  require_env TARGET_S3_SECRET_ACCESS_KEY
  require_env TARGET_S3_ENDPOINT
  require_env TARGET_S3_REGION
}

load_restore_env() {
  local backup_env="$REPO_ROOT/.env.backup"
  local restore_env="$REPO_ROOT/.env.restore"
  [[ -f "$backup_env"  ]] || die "Missing .env.backup (need BACKUP_PASSPHRASE)."
  [[ -f "$restore_env" ]] || die "Missing .env.restore. Copy .env.restore.example and fill it in."

  set -a
  # shellcheck source=/dev/null
  source "$backup_env"
  # shellcheck source=/dev/null
  source "$restore_env"
  set +a

  require_env BACKUP_PASSPHRASE
  require_target_env
}

target_rclone_config() {
  local cfg
  cfg="$(mktemp)"
  cat > "$cfg" <<EOF
[target]
type = s3
provider = Other
access_key_id = $TARGET_S3_ACCESS_KEY_ID
secret_access_key = $TARGET_S3_SECRET_ACCESS_KEY
endpoint = $TARGET_S3_ENDPOINT
region = $TARGET_S3_REGION
force_path_style = true
EOF
  echo "$cfg"
}

restore_db() {
  local folder="$1"
  local enc="$folder/db/full.dump.enc"
  local plain="$folder/db/full.dump"
  [[ -f "$enc" ]] || die "Missing $enc"

  log "DB: decrypting dump…"
  decrypt_file "$enc" "$plain"

  log "DB: pg_restore --data-only --disable-triggers into target…"
  # --data-only: schema came from `supabase db push`.
  # --disable-triggers: lets us insert into auth.users without identity-handler side-effects.
  # --no-owner --no-privileges: target may have different role names.
  # --exit-on-error so we don't silently swallow FK violations.
  pg_restore \
    --data-only \
    --disable-triggers \
    --no-owner --no-privileges \
    --exit-on-error \
    -d "$TARGET_DB_URL" \
    "$plain"

  log "DB: removing decrypted plaintext."
  rm -f "$plain"
}

restore_storage() {
  local folder="$1"
  local cfg
  cfg="$(target_rclone_config)"
  trap 'rm -f "$cfg"' RETURN

  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"; rm -f "$cfg"' RETURN

  # id-documents needs decryption first.
  log "Storage: decrypting id-documents tar…"
  decrypt_file \
    "$folder/storage/id-documents.tar.zst.enc" \
    "$work/id-documents.tar.zst"

  local bucket
  for bucket in photo-group-media kaitori-media item-media id-documents; do
    local tar_file
    if [[ "$bucket" == "id-documents" ]]; then
      tar_file="$work/id-documents.tar.zst"
    else
      tar_file="$folder/storage/${bucket}.tar.zst"
    fi
    [[ -f "$tar_file" ]] || die "Missing storage tar: $tar_file"

    log "Storage: extracting '$bucket'…"
    mkdir -p "$work/$bucket"
    tar --use-compress-program='zstd -d --long=31' \
        -xf "$tar_file" -C "$work"

    log "Storage: uploading '$bucket' to target…"
    rclone --config "$cfg" copy \
      "$work/$bucket" "target:$bucket" \
      --transfers=8 --checkers=16 \
      --stats=10s --stats-one-line

    rm -rf "$work/$bucket"
  done
}

restore_functions() {
  local folder="$1"
  local tar_file="$folder/functions/functions.tar.zst"
  [[ -f "$tar_file" ]] || die "Missing $tar_file"

  local work
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' RETURN

  log "Functions: extracting source…"
  tar --use-compress-program='zstd -d --long=31' -xf "$tar_file" -C "$work"

  local fn_root="$work/functions"
  [[ -d "$fn_root" ]] || die "Expected functions/ directory inside tar"

  local fn
  for fn in "$fn_root"/*/; do
    fn="${fn%/}"
    local name
    name="$(basename "$fn")"
    [[ "$name" == "_shared" ]] && continue   # _shared is a helper folder, not a function

    log "Functions: deploying '$name'…"
    if ! supabase functions deploy "$name" \
         --project-ref "$TARGET_PROJECT_REF" \
         --use-api 2>&1; then
      log "Functions: WARN — deploy of '$name' failed. Continuing."
    fi
  done
}

main() {
  local folder="${1:-}"
  [[ -n "$folder" && -d "$folder" ]] || die "Usage: $0 <backup-folder>"
  local manifest="$folder/manifest.json"
  [[ -f "$manifest" ]] || die "No manifest.json in $folder"

  check_prereqs
  require_cmd pg_restore "brew install postgresql@17 && brew link --force postgresql@17"
  require_cmd supabase   "https://supabase.com/docs/guides/local-development/cli/getting-started"
  load_restore_env

  log "Verifying source backup integrity before restore…"
  bash "$BACKUP_LIB/verify-manifest.sh" "$folder"

  log "Source: backup folder $folder"
  log "Target: project_ref=$TARGET_PROJECT_REF db=$TARGET_DB_URL"

  read -r -p "Type the target project ref to confirm restore: " confirm
  [[ "$confirm" == "$TARGET_PROJECT_REF" ]] || die "Confirmation mismatch. Aborted."

  restore_db        "$folder"
  restore_storage   "$folder"
  restore_functions "$folder"

  printf '\n'
  printf '======================================================================\n'
  printf '  Restore data complete for project %s\n' "$TARGET_PROJECT_REF"
  printf '======================================================================\n'
  printf '\n'
  printf '  MANUAL FOLLOW-UP STEPS (script does not handle these):\n'
  printf '    1. Re-create edge function secrets in Supabase dashboard\n'
  printf '       https://supabase.com/dashboard/project/%s/functions\n' "$TARGET_PROJECT_REF"
  printf '    2. Update Vercel env vars VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY\n'
  printf '    3. Smoke-test: log in as a staff user, scan a P-code QR, view a photo\n'
  printf '    4. Verify auth.users count and customers count match the source backup\n'
  printf '\n'
}

main "$@"
