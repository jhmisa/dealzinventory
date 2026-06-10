#!/usr/bin/env bash
# AES-256-CBC encryption with PBKDF2 (200k iterations, SHA-256). Reads passphrase
# from BACKUP_PASSPHRASE env var so the script is fully non-interactive.
#
# encrypt_file <input_path> <output_path>     # input is REMOVED on success
# decrypt_file <input_path> <output_path>     # input is preserved
set -euo pipefail

OPENSSL_ARGS=(enc -aes-256-cbc -pbkdf2 -iter 200000 -salt)

encrypt_file() {
  local in="$1"
  local out="$2"
  [[ -f "$in" ]] || die "encrypt_file: input not found: $in"
  [[ -n "${BACKUP_PASSPHRASE:-}" ]] || die "encrypt_file: BACKUP_PASSPHRASE not set"

  log "Encrypt: $(basename "$in") -> $(basename "$out")"
  openssl "${OPENSSL_ARGS[@]}" \
    -in "$in" -out "$out" \
    -pass env:BACKUP_PASSPHRASE

  # Sanity round-trip: decrypt to /dev/null to confirm passphrase + integrity.
  openssl "${OPENSSL_ARGS[@]}" -d \
    -in "$out" -out /dev/null \
    -pass env:BACKUP_PASSPHRASE \
    || die "encrypt_file: round-trip decryption check FAILED for $out"

  rm -f "$in"
}

decrypt_file() {
  local in="$1"
  local out="$2"
  [[ -f "$in" ]] || die "decrypt_file: input not found: $in"
  [[ -n "${BACKUP_PASSPHRASE:-}" ]] || die "decrypt_file: BACKUP_PASSPHRASE not set"

  log "Decrypt: $(basename "$in") -> $(basename "$out")"
  openssl "${OPENSSL_ARGS[@]}" -d \
    -in "$in" -out "$out" \
    -pass env:BACKUP_PASSPHRASE
}
