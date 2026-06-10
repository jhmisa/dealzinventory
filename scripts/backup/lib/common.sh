# Shared helpers for backup/restore scripts. Sourced, not executed.
# Expects callers to have already `set -euo pipefail`.

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }
die() { printf '[ERROR] %s\n' "$*" >&2; exit 1; }

require_env() {
  local var="$1"
  if [[ -z "${!var:-}" ]]; then
    die "Required env var $var is not set. Copy .env.backup.example to .env.backup and fill it in."
  fi
}

require_cmd() {
  local cmd="$1"
  local install_hint="${2:-brew install $1}"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "Missing CLI: $cmd. Install with: $install_hint"
  fi
}

check_prereqs() {
  require_cmd pg_dump   "brew install postgresql@17 && brew link --force postgresql@17"
  require_cmd rclone    "brew install rclone"
  require_cmd zstd      "brew install zstd"
  require_cmd openssl   "openssl is built into macOS; should already exist"
  require_cmd jq        "brew install jq"
  require_cmd shasum    "shasum is built into macOS; should already exist"
  require_cmd tar       "tar is built into macOS; should already exist"
}

load_env() {
  local repo_root="$1"
  local env_file="$repo_root/.env.backup"
  [[ -f "$env_file" ]] || die "Missing $env_file. Copy .env.backup.example to .env.backup and fill it in."
  set -a
  # shellcheck source=/dev/null
  source "$env_file"
  set +a

  require_env SUPABASE_DB_URL
  require_env SUPABASE_S3_ACCESS_KEY_ID
  require_env SUPABASE_S3_SECRET_ACCESS_KEY
  require_env SUPABASE_PROJECT_REF
  require_env SUPABASE_S3_ENDPOINT
  require_env SUPABASE_S3_REGION
  require_env BACKUP_PASSPHRASE

  if [[ "$SUPABASE_DB_URL" == *REPLACE_ME* || "$BACKUP_PASSPHRASE" == "REPLACE_ME" ]]; then
    die ".env.backup still has REPLACE_ME placeholders. Fill in real values."
  fi
}

# Compute sha256 hash of a file, output the bare hex digest.
sha256_of() {
  shasum -a 256 "$1" | awk '{print $1}'
}

# Human-readable size of a file/directory (uses du -sh which exists on macOS).
size_of() {
  du -sh "$1" | awk '{print $1}'
}

# Write a JSON object describing an artifact and append to a manifest array file.
# Args: manifest_file, role (db|storage|functions|git), path (relative to backup folder), encrypted (true|false), pre_encrypt_sha256 (or empty).
manifest_add() {
  local manifest="$1"
  local role="$2"
  local rel_path="$3"
  local encrypted="$4"
  local pre_sha="$5"
  local backup_root
  backup_root="$(dirname "$manifest")"
  local abs_path="$backup_root/$rel_path"
  [[ -f "$abs_path" ]] || die "manifest_add: file not found: $abs_path"

  local sha bytes
  sha="$(sha256_of "$abs_path")"
  bytes="$(stat -f%z "$abs_path")"

  local entry
  entry="$(jq -nc \
    --arg role "$role" \
    --arg path "$rel_path" \
    --arg sha "$sha" \
    --argjson bytes "$bytes" \
    --arg enc "$encrypted" \
    --arg pre_sha "$pre_sha" \
    '{role: $role, path: $path, sha256: $sha, bytes: $bytes, encrypted: ($enc == "true"), pre_encrypt_sha256: (if $pre_sha == "" then null else $pre_sha end)}')"

  # Append to artifacts array in manifest.
  local tmp
  tmp="$(mktemp)"
  jq --argjson e "$entry" '.artifacts += [$e]' "$manifest" > "$tmp" && mv "$tmp" "$manifest"
}

# Write the initial manifest.json skeleton.
manifest_init() {
  local manifest="$1"
  local kind="$2"  # baseline | weekly
  jq -n \
    --arg kind "$kind" \
    --arg ref "$SUPABASE_PROJECT_REF" \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg host "$(hostname)" \
    --arg user "${USER:-unknown}" \
    '{kind: $kind, project_ref: $ref, created_at: $ts, host: $host, created_by: $user, cipher: "aes-256-cbc", kdf: "pbkdf2-sha256-200000", artifacts: []}' \
    > "$manifest"
}

# Build an rclone config snippet for the Supabase S3 remote and write to a temp file.
# Echoes the path to the temp config. Caller is responsible for deleting it.
rclone_config_for_supabase_s3() {
  local cfg
  cfg="$(mktemp)"
  cat > "$cfg" <<EOF
[supabase]
type = s3
provider = Other
access_key_id = $SUPABASE_S3_ACCESS_KEY_ID
secret_access_key = $SUPABASE_S3_SECRET_ACCESS_KEY
endpoint = $SUPABASE_S3_ENDPOINT
region = $SUPABASE_S3_REGION
force_path_style = true
EOF
  echo "$cfg"
}
