#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:?Usage: restore-postgres.sh /path/to/platform.sql}"
PLATFORM_DB="${PLATFORM_DB:-tna_platform}"

sudo -u postgres psql "$PLATFORM_DB" < "$BACKUP_FILE"
echo "Restore complete."
