#!/usr/bin/env bash
# Deploys the latest code (installed as /usr/local/bin/vibecraft-deploy).
#   sudo vibecraft-deploy            # latest of the current branch
#   sudo vibecraft-deploy main       # a specific branch
# Takes a database backup first; migrations run automatically when the app starts.
set -euo pipefail
APP_DIR=/opt/vibecraft
BRANCH="${1:-$(sudo -u vibecraft git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)}"

echo "==> Backup before deploy"
/usr/local/bin/vibecraft-backup

echo "==> Updating code ($BRANCH)"
PREVIOUS="$(sudo -u vibecraft git -C "$APP_DIR" rev-parse --short HEAD)"
sudo -u vibecraft git -C "$APP_DIR" fetch --quiet origin
sudo -u vibecraft git -C "$APP_DIR" checkout --quiet "$BRANCH"
sudo -u vibecraft git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
sudo -u vibecraft env PATH="/opt/vibecraft-node/bin:$PATH" bash -c "cd '$APP_DIR/Server' && npm ci --omit=dev --no-audit --no-fund"

echo "==> Restarting"
systemctl restart vibecraft
sleep 4
PORT="$(grep -E '^PORT=' /etc/vibecraft/vibecraft.env | cut -d= -f2)"
if curl -fsS --max-time 10 "http://127.0.0.1:${PORT:-5000}/api/health" >/dev/null; then
  echo "Deployed $(sudo -u vibecraft git -C "$APP_DIR" rev-parse --short HEAD) (was $PREVIOUS). Healthy."
else
  echo "Health check FAILED. Logs: sudo journalctl -u vibecraft -n 100"
  echo "Roll back with: sudo -u vibecraft git -C $APP_DIR checkout $PREVIOUS && sudo systemctl restart vibecraft"
  exit 1
fi
