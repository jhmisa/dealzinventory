#!/usr/bin/env bash
# Run the FIRST/full backup. Includes a one-time git bundle of the repo on top
# of everything weekly.sh produces. Run this once; thereafter use weekly.sh.
#
# Usage:  ./scripts/backup/baseline.sh
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

run_backup baseline "$REPO_ROOT"
