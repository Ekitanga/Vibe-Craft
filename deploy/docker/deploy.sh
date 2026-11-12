#!/usr/bin/env bash
# Update Vibecraft to the latest code on its branch: backup, pull, rebuild, health check.
#   sudo /opt/vibecraft/deploy/docker/deploy.sh
# Only the vibecraft containers are rebuilt/restarted; other apps are not touched.
set -euo pipefail
cd "$(dirname "$0")"
REPO="$(cd ../.. && pwd)"
./backup.sh
PREVIOUS="$(git -C "$REPO" rev-parse --short HEAD)"
git -C "$REPO" pull --ff-only
docker compose up -d --build vibecraft-app
PORT="$(grep -E '^APP_HOST_PORT=' .env | cut -d= -f2)"
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT:-4200}/api/health" >/dev/null 2>&1; then
    echo "Deployed $(git -C "$REPO" rev-parse --short HEAD) (was $PREVIOUS). Healthy."
    exit 0
  fi
  sleep 2
done
echo "Health check FAILED: docker compose logs --tail=100 vibecraft-app"
echo "Roll back: git -C $REPO checkout $PREVIOUS && docker compose up -d --build vibecraft-app"
exit 1
