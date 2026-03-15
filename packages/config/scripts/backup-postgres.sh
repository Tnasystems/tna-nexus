#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/tna-nexus}"
PG_USER="${PG_USER:-postgres}"
PLATFORM_DB="${PLATFORM_DB:-tna_platform}"
mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
sudo -u postgres pg_dump "$PLATFORM_DB" > "$BACKUP_DIR/platform-$STAMP.sql"

if [[ -d /var/www/tna-nexus/uploads ]]; then
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C /var/www/tna-nexus uploads
fi

echo "Backup complete: $BACKUP_DIR"
