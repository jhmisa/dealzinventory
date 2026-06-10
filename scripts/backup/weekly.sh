#!/usr/bin/env bash
# Run a weekly backup (everything baseline.sh does, minus the git bundle).
# Schedule: Sunday evenings via macOS Calendar / Reminders.
#
# Usage:  ./scripts/backup/weekly.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=lib/dump-db.sh
source "$SCRIPT_DIR/lib/dump-db.sh"
# shellcheck source=lib/mirror-storage.sh
source "$SCRIPT_DIR/lib/mirror-storage.sh"
# shellcheck source=lib/snapshot-functions.sh
source "$SCRIPT_DIR/lib/snapshot-functions.sh"
# shellcheck source=lib/encrypt.sh
source "$SCRIPT_DIR/lib/encrypt.sh"
# shellcheck source=lib/run-backup.sh
source "$SCRIPT_DIR/lib/run-backup.sh"

run_backup weekly "$REPO_ROOT"
