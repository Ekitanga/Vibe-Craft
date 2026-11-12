#!/usr/bin/env bash
# Nightly PostgreSQL backup for Vibecraft (installed as /usr/local/bin/vibecraft-backup).
# Keeps 14 days locally. ALSO copy backups off the server (see README) — a backup on
# the same machine does not survive losing the machine.
set -euo pipefail
DIR=/var/backups/vibecraft
KEEP_DAYS=14
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DIR/vibecraft_$STAMP.dump"

sudo -u postgres pg_dump --format=custom --no-owner --dbname=vibecraft --file="$FILE"
chmod 640 "$FILE"
find "$DIR" -name 'vibecraft_*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
