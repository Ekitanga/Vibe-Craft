# Hosting Vibecraft on a Contabo VPS

This moves the store from Render to your own Contabo server: Node.js app + PostgreSQL
database + nginx web server + free HTTPS certificate, on one machine. Expect about
1–2 hours the first time, with roughly 15 minutes when the site is switching over.

**Who does what:** steps marked 🧑 are done in a web dashboard (Contabo, Namecheap,
Render, Google, Meta). Everything else is typed into the server over SSH.

## What you need

* A Contabo VPS with **Ubuntu 22.04 or 24.04** and about 1 GB of RAM to spare.
* **The server can already run other systems.** The setup is built for shared servers:
  it uses its own copy of Node.js, picks a free port, adds one nginx site for the
  domain, and does not touch other sites, other databases, the firewall or system
  packages your other systems rely on. It requires **nginx** to be the program serving
  ports 80/443; if Apache, Caddy or a Docker proxy does that, it stops without changing
  anything and tells you.
* The server's **IP address** and **root password / SSH key** (Contabo customer panel → VPS).
* Access to **Namecheap** (where vibecraft254.com is registered) and to **Render**.
* The code pushed to GitHub and merged into `main`.

## 1. Connect to the server

From Windows PowerShell (replace the IP):

```powershell
ssh root@YOUR.SERVER.IP
```

First thing on a new server — create your own admin user and stop using root:

```bash
adduser vcadmin && usermod -aG sudo vcadmin
# then log out and back in as: ssh vcadmin@YOUR.SERVER.IP
```

## 2. Check the server, then run the setup

First an inspection that **changes nothing** — send its output to your developer:

```bash
git clone --branch main https://github.com/Mutisyaaa/Vibecraft.git ~/vibecraft-kit
sudo bash ~/vibecraft-kit/deploy/contabo/setup.sh --check
```

It lists what serves ports 80/443, the domains nginx already hosts, Docker containers,
PostgreSQL and the free port the store will use. Then install:

```bash
sudo bash ~/vibecraft-kit/deploy/contabo/setup.sh vibecraft254.com you@yourmail.com
```

It installs only what is missing, a private Node.js in `/opt/vibecraft-node`, the code in
`/opt/vibecraft`, a `vibecraft` database (with its own user and random password) in the
existing PostgreSQL, the settings file, the `vibecraft` service, one nginx site and
nightly backups. If nginx rejects the new site, it is switched off again automatically.
It is safe to run again.

*Firewall:* the setup leaves your firewall alone. Ports 80 and 443 must be open (they
already are if the server hosts other websites). The store itself listens on
`127.0.0.1` only, so it is never reachable directly from the internet.

## 3. Fill in the secrets

```bash
sudo nano /etc/vibecraft/vibecraft.env
```

🧑 Copy these values from **Render → vibecraft service → Environment**:
`GOOGLE_CLIENT_ID`, `GEMINI_API_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`.

**`SETTINGS_ENCRYPTION_KEY`:** if you already deployed to Render with a key and saved
Meta/M-Pesa/email secrets in the admin, replace the generated value with **Render's key**
(otherwise those secrets must be re-entered). Save a copy of the final key in a password
manager — losing it means re-entering every integration secret.

## 4. Copy the live data from Render

🧑 Render → your **PostgreSQL** database → *Connections* → copy the **External Database URL**.

Do this at a quiet time (late evening): orders placed on the old site after the copy
would not be carried over.

```bash
# Dump from Render (paste the URL inside the quotes)
pg_dump --format=custom --no-owner --no-acl "PASTE_RENDER_EXTERNAL_URL" -f /tmp/render.dump

# Load into the new database
sudo -u postgres pg_restore --no-owner --role=vibecraft --dbname=vibecraft /tmp/render.dump
rm /tmp/render.dump
```

*Note:* if `pg_dump` complains about a **version mismatch** (common on Ubuntu 22.04),
install a newer client: `sudo apt-get install -y postgresql-client-16` after adding the
PostgreSQL repository (`sudo apt install -y postgresql-common && sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh`).

*Starting fresh instead?* Skip the dump and run:
`sudo -u vibecraft bash -c 'cd /opt/vibecraft/Server && set -a && . /etc/vibecraft/vibecraft.env && npm run db:pg:init'`
then create the owner with `npm run admin:create -- --email … --password …` the same way.

## 5. Start the store and test it on the server

```bash
sudo systemctl start vibecraft
sudo systemctl status vibecraft --no-pager       # should say "active (running)"
curl -s http://127.0.0.1:$(sudo grep -oP '^PORT=\K.*' /etc/vibecraft/vibecraft.env)/api/health   # {"success":true,...}
sudo journalctl -u vibecraft -n 50 --no-pager   # logs (migrations are applied on first start)
```

You can preview it before switching the domain: on your Windows PC, open Notepad **as
administrator**, edit `C:\Windows\System32\drivers\etc\hosts`, add
`YOUR.SERVER.IP vibecraft254.com`, and browse to http://vibecraft254.com. Remove that
line afterwards.

## 6. Point the domain to the server 🧑

Namecheap → Domain List → vibecraft254.com → **Advanced DNS**:

| Type | Host | Value | TTL |
| --- | --- | --- | --- |
| A Record | `@` | YOUR.SERVER.IP | 5 min |
| A Record | `www` | YOUR.SERVER.IP | 5 min |

Delete the old records that point to Render (A/CNAME for `@` and `www`). Leave email
(MX/TXT) records alone. Changes usually take effect in 5–30 minutes.

Check from the server: `dig +short vibecraft254.com` should print your server's IP.

## 7. Turn on HTTPS

```bash
sudo certbot --nginx -d vibecraft254.com -d www.vibecraft254.com -m you@yourmail.com --agree-tos --redirect
```

Certificates renew automatically. Then open https://vibecraft254.com and check:
home page, a product, add to cart, admin login, an image upload.

## 8. After the switch

* 🧑 **Google sign-in:** Google Cloud Console → Credentials → your OAuth client →
  *Authorised JavaScript origins* must include `https://vibecraft254.com` and
  `https://www.vibecraft254.com` (unchanged if they were already there).
* 🧑 **Admin → Integrations → Website:** set `https://vibecraft254.com`.
* 🧑 **Keep Render running for about a week** as a fallback, then delete the Render
  service and database (they keep costing money / the free database expires).
* 🧑 **Off-server backups:** backups are in `/var/backups/vibecraft` on the same machine.
  Also turn on Contabo snapshots/backup add-on, or copy the newest dump off the server
  weekly, e.g. from Windows: `scp vcadmin@YOUR.SERVER.IP:/var/backups/vibecraft/*.dump .`

## Optional: Cloudflare in front (recommended)

Free DDoS protection and caching. 🧑 Add the site to Cloudflare, switch Namecheap's
nameservers to Cloudflare's, create the same two A records with the **orange cloud on**,
and set SSL mode to **Full (strict)**. Then on the server:

```bash
sudo cp /opt/vibecraft/deploy/contabo/cloudflare-realip.conf /etc/nginx/conf.d/
sudo nginx -t && sudo systemctl reload nginx
```

(Without that file, rate limits would see Cloudflare's address instead of each visitor's.)

## Everyday operations

| Task | Command |
| --- | --- |
| Deploy the latest `main` | `sudo vibecraft-deploy main` (backs up first, health-checks after) |
| Restart | `sudo systemctl restart vibecraft` |
| Live logs | `sudo journalctl -u vibecraft -f` |
| Back up now | `sudo vibecraft-backup` |
| Restore a backup | `sudo systemctl stop vibecraft && sudo -u postgres pg_restore --clean --if-exists --no-owner --role=vibecraft -d vibecraft /var/backups/vibecraft/FILE.dump && sudo systemctl start vibecraft` |
| Edit settings | `sudo nano /etc/vibecraft/vibecraft.env` then restart |
| Locked-out owner | `sudo -u vibecraft bash -c 'cd /opt/vibecraft/Server && set -a && . /etc/vibecraft/vibecraft.env && npm run admin:create -- --email you@x.com --password "NEW-long-password" --reset'` |

Keep the server's packages updated as you do for your other systems. After a reboot the
store starts again by itself.
