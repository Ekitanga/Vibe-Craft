#!/usr/bin/env bash
# Vibecraft setup for a Contabo VPS that may ALREADY run other systems.
#
#   sudo bash setup.sh --check                                  # inspect only, changes nothing
#   sudo bash setup.sh vibecraft254.com you@example.com         # install
#
# Shared-server safe by design:
#   * Uses its OWN Node.js 20 in /opt/vibecraft-node — the system Node (if any) is untouched.
#   * Picks a free local port (5000-5099) and listens on 127.0.0.1 only.
#   * Adds ONE nginx site for the domain. Does not touch other sites, the default site,
#     the firewall, fail2ban or the automatic-update policy.
#   * Uses the existing PostgreSQL if present (own role + database), otherwise installs it.
#   * Stops with advice if something other than nginx serves ports 80/443.
# Safe to re-run: existing data, passwords and settings are kept.
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-20.19.5}"
REPO_URL="${REPO_URL:-https://github.com/Mutisyaaa/Vibecraft.git}"
BRANCH="${BRANCH:-main}"
APP_USER="vibecraft"
APP_DIR="/opt/vibecraft"
NODE_DIR="/opt/vibecraft-node"
ENV_DIR="/etc/vibecraft"
ENV_FILE="$ENV_DIR/vibecraft.env"
DB_NAME="vibecraft"
DB_USER="vibecraft"
KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ $EUID -eq 0 ]] || { echo "Run as root (sudo)."; exit 1; }

step() { echo; echo "==> $*"; }

# ---------------------------------------------------------------------------------
# Inspection (also the whole of --check mode)
# ---------------------------------------------------------------------------------
web_owner() { ss -ltnpH "( sport = :$1 )" 2>/dev/null | grep -oP 'users:\(\("\K[^"]+' | sort -u | tr '\n' ' '; }
port_free() { ! ss -ltnH "( sport = :$1 )" 2>/dev/null | grep -q .; }

inspect() {
  echo "Server:      $(. /etc/os-release; echo "$PRETTY_NAME") — $(nproc) CPU, $(free -h | awk '/Mem:/{print $2}') RAM, $(df -h / | awk 'NR==2{print $4}') disk free"
  echo "Port 80:     $(web_owner 80 || true)"
  echo "Port 443:    $(web_owner 443 || true)"
  echo "nginx:       $(command -v nginx >/dev/null && nginx -v 2>&1 | cut -d/ -f2 || echo 'not installed')"
  if [[ -d /etc/nginx/sites-enabled ]]; then
    echo "nginx sites: $(ls /etc/nginx/sites-enabled 2>/dev/null | tr '\n' ' ')"
    echo "Domains already configured in nginx:"
    grep -RhoE 'server_name[^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sed 's/server_name/   /' | sort -u || true
  fi
  echo "Apache:      $(command -v apache2 >/dev/null && echo installed || echo no)   Caddy: $(command -v caddy >/dev/null && echo installed || echo no)"
  echo "Docker:      $(command -v docker >/dev/null && echo "yes ($(docker ps -q 2>/dev/null | wc -l) containers running)" || echo no)"
  if command -v docker >/dev/null; then
    docker ps --format '   {{.Names}}  {{.Ports}}' 2>/dev/null | grep -E ':(80|443|5432)->' || true
  fi
  echo "System Node: $(command -v node >/dev/null && node -v || echo none)  (Vibecraft will use its own Node $NODE_VERSION)"
  echo "PostgreSQL:  $(command -v pg_lsclusters >/dev/null && pg_lsclusters --no-header 2>/dev/null | awk '{print $1"/"$2" port "$3" "$4}' | tr '\n' ' ' || echo 'not installed (will be installed)')"
  echo "Port 5432:   $(web_owner 5432 || true)"
  local p; for p in $(seq 5000 5099); do port_free "$p" && { echo "Free app port: $p"; break; }; done
  echo "Firewall:    $(command -v ufw >/dev/null && ufw status | head -1 || echo 'ufw not installed')"
}

if [[ "${1:-}" == "--check" ]]; then
  echo "Vibecraft pre-install check (nothing is changed)"; echo
  inspect
  echo
  echo "Send this output to your developer before installing."
  exit 0
fi

DOMAIN="${1:?Usage: sudo bash setup.sh <domain> <email>   or   sudo bash setup.sh --check}"
EMAIL="${2:?Usage: sudo bash setup.sh <domain> <email>}"

step "Pre-flight checks"
inspect
OWNER80="$(web_owner 80 || true)"
if [[ -n "$OWNER80" && "$OWNER80" != *nginx* ]]; then
  echo
  echo "STOP: port 80 is served by: $OWNER80"
  echo "This script adds an nginx site. With Apache/Caddy/Traefik/Docker in charge of port 80,"
  echo "the domain must be added to THAT web server instead (proxying to 127.0.0.1:<app port>)."
  echo "Nothing has been changed. Send the output above to your developer."
  exit 1
fi
if grep -RqsE "server_name[^;]*\b${DOMAIN//./\\.}\b" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null \
   && [[ ! -f /etc/nginx/sites-available/vibecraft ]]; then
  echo "STOP: another nginx site already uses $DOMAIN. Remove or rename it first. Nothing changed."
  exit 1
fi

step "Packages (only what is missing)"
export DEBIAN_FRONTEND=noninteractive
NEED=()
for pkg in curl git ca-certificates xz-utils openssl certbot python3-certbot-nginx; do dpkg -s "$pkg" >/dev/null 2>&1 || NEED+=("$pkg"); done
command -v nginx >/dev/null || NEED+=(nginx)
command -v pg_lsclusters >/dev/null || NEED+=(postgresql postgresql-contrib)
if ((${#NEED[@]})); then apt-get update -y && apt-get install -y "${NEED[@]}"; else echo "  nothing to install"; fi

step "Private Node.js $NODE_VERSION in $NODE_DIR (system Node untouched)"
if [[ ! -x "$NODE_DIR/bin/node" || "$("$NODE_DIR/bin/node" -v)" != "v$NODE_VERSION" ]]; then
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) ARCH=x64;; aarch64) ARCH=arm64;; esac
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$ARCH.tar.xz" -o "$TMP/node.tar.xz"
  curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  EXPECTED="$(grep " node-v$NODE_VERSION-linux-$ARCH.tar.xz\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)"
  echo "$EXPECTED  $TMP/node.tar.xz" | sha256sum -c -
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/node.tar.xz" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
fi
"$NODE_DIR/bin/node" -v

step "Application user and code ($REPO_URL, branch $BRANCH)"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
[[ -d "$APP_DIR/.git" ]] || git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" git -C "$APP_DIR" fetch --quiet origin
sudo -u "$APP_USER" git -C "$APP_DIR" checkout --quiet "$BRANCH"
sudo -u "$APP_USER" git -C "$APP_DIR" pull --quiet --ff-only origin "$BRANCH"
sudo -u "$APP_USER" env PATH="$NODE_DIR/bin:$PATH" bash -c "cd '$APP_DIR/Server' && npm ci --omit=dev --no-audit --no-fund"

step "PostgreSQL role and database (other databases untouched)"
PG_PORT="$(sudo -u postgres psql -tAc 'SHOW port' 2>/dev/null | tr -d ' ' || true)"
[[ -n "$PG_PORT" ]] || { echo "Could not reach the local PostgreSQL as user 'postgres'. Is it running? (pg_lsclusters)"; exit 1; }
echo "  using local PostgreSQL on port $PG_PORT"
mkdir -p "$ENV_DIR"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASSWORD';"
  echo "$DB_PASSWORD" > "$ENV_DIR/.db_password"; chmod 600 "$ENV_DIR/.db_password"
fi
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"

step "Environment file ($ENV_FILE)"
if [[ ! -f "$ENV_FILE" ]]; then
  APP_PORT=""; for p in $(seq 5000 5099); do port_free "$p" && { APP_PORT="$p"; break; }; done
  [[ -n "$APP_PORT" ]] || { echo "No free port between 5000 and 5099."; exit 1; }
  [[ -f "$ENV_DIR/.db_password" ]] || { echo "The '$DB_USER' database role exists but its password file is missing; set DATABASE_URL by hand."; exit 1; }
  sed -e "s|__DOMAIN__|$DOMAIN|g" \
      -e "s|__DB_PASSWORD__|$(cat "$ENV_DIR/.db_password")|g" \
      -e "s|__DB_PORT__|$PG_PORT|g" \
      -e "s|__APP_PORT__|$APP_PORT|g" \
      -e "s|__ENCRYPTION_KEY__|$(openssl rand -base64 32 | tr -d '\n')|g" \
      "$KIT_DIR/vibecraft.env.example" > "$ENV_FILE"
  echo "  created — the store will listen on 127.0.0.1:$APP_PORT"
else
  echo "  already exists — left unchanged"
fi
chown root:"$APP_USER" "$ENV_FILE"; chmod 640 "$ENV_FILE"
APP_PORT="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"

step "systemd service 'vibecraft'"
install -m 644 "$KIT_DIR/vibecraft.service" /etc/systemd/system/vibecraft.service
systemctl daemon-reload
systemctl enable vibecraft >/dev/null

step "nginx site for $DOMAIN (other sites untouched)"
sed -e "s|__DOMAIN__|$DOMAIN|g" -e "s|__APP_PORT__|$APP_PORT|g" "$KIT_DIR/nginx-vibecraft.conf" > /etc/nginx/sites-available/vibecraft
ln -sf /etc/nginx/sites-available/vibecraft /etc/nginx/sites-enabled/vibecraft
if ! nginx -t; then
  rm -f /etc/nginx/sites-enabled/vibecraft
  echo "nginx rejected the configuration; the Vibecraft site was disabled again. Other sites unaffected."
  exit 1
fi
systemctl reload nginx

step "Helper commands and nightly backups (02:30, 14 days kept)"
install -m 750 "$KIT_DIR/backup.sh" /usr/local/bin/vibecraft-backup
install -m 750 "$KIT_DIR/deploy.sh" /usr/local/bin/vibecraft-deploy
mkdir -p /var/backups/vibecraft && chown postgres:postgres /var/backups/vibecraft && chmod 750 /var/backups/vibecraft
echo "30 2 * * * root /usr/local/bin/vibecraft-backup >> /var/log/vibecraft-backup.log 2>&1" > /etc/cron.d/vibecraft-backup

cat <<DONE

Setup complete — your other systems were not modified. Next (deploy/contabo/README.md):
  1. Edit $ENV_FILE: add GOOGLE_CLIENT_ID, GEMINI_API_KEY and the CLOUDINARY_* values.
  2. Copy the live data from Render (README step 4).
  3. sudo systemctl start vibecraft && curl -s http://127.0.0.1:$APP_PORT/api/health
  4. Point $DOMAIN to this server's IP, then:
     sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN -m $EMAIL --agree-tos --redirect
DONE
