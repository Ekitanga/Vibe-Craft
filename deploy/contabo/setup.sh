#!/usr/bin/env bash
# One-time server setup for Vibecraft on a Contabo VPS (Ubuntu 22.04 or 24.04).
#
#   sudo bash setup.sh vibecraft254.com you@example.com
#
# Installs Node.js 20, PostgreSQL, nginx, a firewall and fail2ban; creates a dedicated
# `vibecraft` user, database and environment file; installs the systemd service, the
# nginx site and nightly backups. Safe to re-run: existing data, passwords and other
# nginx sites are left alone. HTTPS is added in a separate step once DNS points here.
set -euo pipefail

DOMAIN="${1:?Usage: sudo bash setup.sh <domain> <email-for-ssl-notices>}"
EMAIL="${2:?Usage: sudo bash setup.sh <domain> <email-for-ssl-notices>}"
REPO_URL="${REPO_URL:-https://github.com/Mutisyaaa/Vibecraft.git}"
BRANCH="${BRANCH:-main}"
APP_USER="vibecraft"
APP_DIR="/opt/vibecraft"
ENV_DIR="/etc/vibecraft"
ENV_FILE="$ENV_DIR/vibecraft.env"
DB_NAME="vibecraft"
DB_USER="vibecraft"
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }
grep -qiE 'ubuntu' /etc/os-release || echo "Warning: tested on Ubuntu only."

step() { echo; echo "==> $*"; }

step "System packages and automatic security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg nginx postgresql postgresql-contrib ufw fail2ban \
  certbot python3-certbot-nginx unattended-upgrades openssl
dpkg-reconfigure -f noninteractive unattended-upgrades || true

step "Node.js 20 LTS"
NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [[ -z "$NODE_MAJOR" || "$NODE_MAJOR" -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

step "Application user and code ($REPO_URL, branch $BRANCH)"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin
sudo -u "$APP_USER" git -C "$APP_DIR" checkout --quiet "$BRANCH"
sudo -u "$APP_USER" git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
sudo -u "$APP_USER" bash -c "cd '$APP_DIR/Server' && npm ci --omit=dev --no-audit --no-fund"

step "PostgreSQL database"
mkdir -p "$ENV_DIR"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';"
  echo "$DB_PASSWORD" > "$ENV_DIR/.db_password"
  chmod 600 "$ENV_DIR/.db_password"
fi
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

step "Environment file ($ENV_FILE)"
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASSWORD="$(cat "$ENV_DIR/.db_password")"
  sed -e "s|__DOMAIN__|$DOMAIN|g" \
      -e "s|__DB_PASSWORD__|$DB_PASSWORD|g" \
      -e "s|__ENCRYPTION_KEY__|$(openssl rand -base64 32)|g" \
      "$KIT_DIR/vibecraft.env.example" > "$ENV_FILE"
  echo "Created $ENV_FILE — fill in the Google, Gemini and Cloudinary values before starting."
else
  echo "$ENV_FILE already exists — left unchanged."
fi
chown root:"$APP_USER" "$ENV_FILE"
chmod 640 "$ENV_FILE"

step "systemd service"
install -m 644 "$KIT_DIR/vibecraft.service" /etc/systemd/system/vibecraft.service
systemctl daemon-reload
systemctl enable vibecraft >/dev/null

step "nginx site for $DOMAIN"
sed "s|__DOMAIN__|$DOMAIN|g" "$KIT_DIR/nginx-vibecraft.conf" > /etc/nginx/sites-available/vibecraft
ln -sf /etc/nginx/sites-available/vibecraft /etc/nginx/sites-enabled/vibecraft
[[ -L /etc/nginx/sites-enabled/default ]] && rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

step "Firewall (SSH + web only) and fail2ban"
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable
systemctl enable --now fail2ban >/dev/null

step "Nightly database backups (02:30, 14 days kept)"
install -m 750 "$KIT_DIR/backup.sh" /usr/local/bin/vibecraft-backup
install -m 750 "$KIT_DIR/deploy.sh" /usr/local/bin/vibecraft-deploy
mkdir -p /var/backups/vibecraft && chown postgres:postgres /var/backups/vibecraft && chmod 750 /var/backups/vibecraft
echo "30 2 * * * root /usr/local/bin/vibecraft-backup >> /var/log/vibecraft-backup.log 2>&1" > /etc/cron.d/vibecraft-backup

cat <<DONE

Setup complete. Next steps (see deploy/contabo/README.md):
  1. Edit $ENV_FILE and add GOOGLE_CLIENT_ID, GEMINI_API_KEY and the CLOUDINARY_* values.
  2. Copy your live data from Render (README step 4), or for a fresh store:
       sudo -u $APP_USER bash -c 'cd $APP_DIR/Server && set -a && . $ENV_FILE && npm run db:pg:init'
  3. sudo systemctl start vibecraft && sudo systemctl status vibecraft
  4. Point $DOMAIN to this server, then: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN -m $EMAIL --agree-tos --redirect
DONE
