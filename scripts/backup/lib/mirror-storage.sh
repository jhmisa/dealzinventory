#!/usr/bin/env bash
# Mirror each Supabase Storage bucket to a local directory, then tar+zstd it.
# Uses rclone against the project's S3-compatible endpoint.
#
# Args:
#   $1  output directory (e.g. backups/2026-05-06/storage)
#
# Requires env: SUPABASE_S3_* (see .env.backup.example) and rclone installed.
set -euo pipefail

# Buckets to mirror. id-documents goes last so the encryption step can wipe its
# plaintext directory immediately after tarring.
STORAGE_BUCKETS=(photo-group-media kaitori-media item-media id-documents)

mirror_storage() {
  local out_dir="$1"
  mkdir -p "$out_dir"

  local rclone_cfg
  rclone_cfg="$(rclone_config_for_supabase_s3)"
  trap 'rm -f "$rclone_cfg"' RETURN

  local bucket
  for bucket in "${STORAGE_BUCKETS[@]}"; do
    local local_dir="$out_dir/$bucket"
    local tar_file="$out_dir/${bucket}.tar.zst"

    log "Storage: syncing bucket '$bucket'…"
    mkdir -p "$local_dir"
    if ! rclone --config "$rclone_cfg" sync \
         "supabase:$bucket" "$local_dir" \
         --transfers=8 --checkers=16 --fast-list \
         --stats=10s --stats-one-line; then
      log "Storage: bucket '$bucket' not present or empty — continuing."
    fi

    log "Storage: tarring '$bucket'…"
    tar --use-compress-program='zstd -19 --long' \
        -cf "$tar_file" \
        -C "$out_dir" "$bucket"

    # Wipe the plaintext mirror — we keep only the tar (which will be encrypted
    # for id-documents in the next step).
    rm -rf "$local_dir"

    log "Storage: '$bucket' tarred ($(size_of "$tar_file"))."
  done
}
