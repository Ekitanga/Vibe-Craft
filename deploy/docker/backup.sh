#!/usr/bin/env bash
# Nightly Vibecraft database backup. Keeps 14 days in deploy/docker/backups.
# Cron: 40 2 * * * root /opt/vibecraft/deploy/docker/backup.sh >> /var/log/vibecraft-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
STAMP="$(date +%Y-%m-%d_%H%M)"
docker compose exec -T vibecraft-db pg_dump -U vibecraft -d vibecraft --format=custom --no-owner -f "/backups/vibecraft_$STAMP.dump"
find ./backups -name 'vibecraft_*.dump' -mtime +14 -delete
echo "$(date -Is) backup ok: vibecraft_$STAMP.dump ($(du -h "backups/vibecraft_$STAMP.dump" | cut -f1))"
