# Deploying Vibecraft on the Contabo server (Docker + shared Caddy)

Written for the Contabo server that already runs dlight-pos, triple-junction,
aspect-trading and desert-tech as Docker Compose projects behind one Caddy container
(`contabo-caddy-1`, config in `/opt/dlight-pos/deploy/contabo/Caddyfile`).

Vibecraft is added the same way as triple-junction: its own Compose project in
`/opt/vibecraft` with its **own private database**, joined to the shared
`contabo_default` network under the unique name `vibecraft-app`. The only change to
shared infrastructure is **one block appended to the Caddyfile**. Other apps' containers,
databases and volumes are not touched.

> Why unique names matter: on `contabo_default`, the name `db` already belongs to
> dlight-pos's database. Vibecraft's services are named `vibecraft-db` / `vibecraft-app`
> so the store can never connect to another app's database.

## 1. Get the code and settings

```bash
git clone https://github.com/Ekitanga/Vibe-Craft.git /opt/vibecraft
cd /opt/vibecraft/deploy/docker
cp .env.example .env && chmod 600 .env
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$(openssl rand -hex 24)|" .env
sed -i "s|^SETTINGS_ENCRYPTION_KEY=.*|SETTINGS_ENCRYPTION_KEY=$(openssl rand -base64 32)|" .env
nano .env    # paste GOOGLE_CLIENT_ID, GEMINI_API_KEY, CLOUDINARY_* from Render
```

If you already deployed to Render with a `SETTINGS_ENCRYPTION_KEY` and saved secrets in
Admin → Integrations, put **Render's key** in `.env` instead. Save the final key in a
password manager.

## 2. Start the database and copy the live data from Render

Do this in a quiet hour: orders placed on Render after the copy are not carried over.
Render → PostgreSQL → *Connections* → copy the **External Database URL**.

```bash
cd /opt/vibecraft/deploy/docker
docker compose up -d vibecraft-db
# Dump Render with a matching PostgreSQL client (no install on the host needed)
docker run --rm -v "$PWD/backups:/out" postgres:16-alpine \
  pg_dump --format=custom --no-owner --no-acl -f /out/render.dump "PASTE_RENDER_EXTERNAL_URL"
docker compose exec -T vibecraft-db pg_restore -U vibecraft -d vibecraft --no-owner /backups/render.dump
```

*Fresh store instead?* Skip the dump/restore; the app creates the tables on first start.
Then create the owner:
`docker compose exec vibecraft-app node Server/src/db/create-admin.js --email you@x.com --password "LONG-unique-password" --name "Your Name"`

## 3. Start the store and check it on the server

```bash
docker compose up -d --build
docker compose ps                                  # vibecraft-app should become "healthy"
curl -s http://127.0.0.1:4200/api/health           # {"success":true,...}
docker compose logs --tail=50 vibecraft-app        # "Applied migration …", "listening"
```

## 4. Add the domain to Caddy (the only shared change)

```bash
CF=/opt/dlight-pos/deploy/contabo/Caddyfile
cp "$CF" "$CF.before-vibecraft-$(date +%Y%m%d-%H%M)"        # backup
cat /opt/vibecraft/deploy/docker/Caddyfile.snippet >> "$CF"   # APPEND — keeps the file Caddy has mounted
docker exec contabo-caddy-1 caddy validate --config /etc/caddy/Caddyfile
docker exec contabo-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

* Always **append** (`>>`) or edit in place. Editors that save by replacing the file can
  leave the Caddy container reading the old copy.
* `validate` must say *Valid configuration* before `reload`. A reload is graceful: the
  other sites keep running.
* **Undo:** `cat "$CF.before-vibecraft-…" > "$CF" && docker exec contabo-caddy-1 caddy reload --config /etc/caddy/Caddyfile`

## 5. Point the domain to the server

Namecheap → vibecraft254.com → **Advanced DNS**: set two A records, `@` and `www`, to
your server's IP address (TTL 5 min) and delete the old Render records for `@`/`www`. Leave
MX/TXT (email) records alone.

Caddy obtains the HTTPS certificate automatically within a minute of DNS pointing at the
server. Check: `docker logs contabo-caddy-1 --since 10m | grep -i vibecraft254`.

## 6. After the switch

* Admin → Integrations → **Website**: `https://vibecraft254.com`.
* Google Cloud Console → OAuth client → authorised JavaScript origins include
  `https://vibecraft254.com` and `https://www.vibecraft254.com`.
* Nightly backups:
  `echo "40 2 * * * root /opt/vibecraft/deploy/docker/backup.sh >> /var/log/vibecraft-backup.log 2>&1" > /etc/cron.d/vibecraft-backup`
* Keep Render for a week as a fallback, then delete the service and database.

## Everyday operations

| Task | Command (in `/opt/vibecraft/deploy/docker`) |
| --- | --- |
| Deploy latest code | `./deploy.sh` (backs up, pulls, rebuilds only Vibecraft, health-checks) |
| Logs | `docker compose logs -f vibecraft-app` |
| Restart | `docker compose restart vibecraft-app` |
| Back up now | `./backup.sh` (files in `backups/`, kept 14 days — copy off-server too) |
| Restore | `docker compose stop vibecraft-app && docker compose exec -T vibecraft-db pg_restore -U vibecraft -d vibecraft --clean --if-exists --no-owner /backups/FILE.dump && docker compose start vibecraft-app` |
| Locked-out owner | `docker compose exec vibecraft-app node Server/src/db/create-admin.js --email you@x.com --password "NEW-long-password" --reset` |
| Remove Vibecraft completely | `docker compose down` (add `-v` only if you also want to delete its database) and remove its Caddy block |
