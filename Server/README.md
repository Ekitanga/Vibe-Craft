# Vibecraft Server

Express + PostgreSQL backend for the Vibecraft projector shop. It also serves the
plain HTML/CSS/JS storefront and admin from `../Client`, so the whole app runs from
one URL.

## Getting started

```bash
cp Server/.env.example Server/.env   # fill in the database connection
npm install                          # from the project root
npm run db:pg:init                   # create tables (migrations) and seed the catalog
npm run admin:create -- --email you@example.com --password "a-long-unique-password" --name "Your Name"
npm start                            # http://localhost:5000
```

`npm run dev` inside `Server/` restarts on file changes.

## Database & migrations

The schema is managed by numbered migrations in `src/db/migrations/`. They run
automatically when the server starts (and via `npm run db:migrate`), each once, inside a
transaction, recorded in `schema_migrations`. To change the schema, add a new
`NNN-description.js` file exporting `up(client)`; never edit a migration that has
already run in production.

`db:pg:init` runs the migrations and seeds the demo catalog; `db:pg:reset` wipes and
reseeds (destructive).

## Admins, roles and permissions

* Admin accounts are managed in **Admin → Team**. Roles and what they can do are
  managed in **Admin → Access**. Built-in roles: Owner, Admin, Manager, Editor; owners
  can create custom roles (e.g. “Support”).
* Every admin API route checks a permission (`src/config/permissions.js`,
  `src/routes/adminRoutes.js`). Roles are ranked: nobody can grant a role or a
  permission above their own, and the last active owner cannot be removed or demoted.
* `ADMIN_EMAIL`/`ADMIN_PASSWORD` only create the first owner on an **empty** database.
  They never overwrite an existing account. Remove them after first use.
* `npm run admin:create -- --email … --password … --reset` is the break-glass reset for a
  locked-out owner (requires server/shell access).
* An admin whose password fails the current rules (e.g. `password`) is forced to change
  it before using the admin area.

## Integrations (no code changes needed)

**Admin → Integrations** configures, from schema definitions in
`src/services/integrationSettingsService.js`:

| Section | What it does |
| --- | --- |
| Website | Public base URL used for feeds, callbacks and share previews |
| Meta | Pixel, Conversions API, catalog feed, domain verification, Lead Ads, ad-spend reporting |
| M-Pesa (Daraja) | STK Push payment prompts, automatic payment confirmation |
| Email (SMTP) | Order confirmations, new-order alerts, email verification |
| Security | Login lockout, order/promo/AI/tracking rate limits, unpaid-order expiry, CSP mode, allowed origins |
| Share previews | Open Graph tags, sitemap, robots |
| Cookie consent | Optional consent banner (off by default) |
| Policies | Privacy policy, terms, refunds at `/privacy`, `/terms`, `/refunds` |

Secret fields are encrypted with AES-256-GCM (`src/utils/secretBox.js`) and never sent
back to the browser. Set `SETTINGS_ENCRYPTION_KEY` in production; without it, a key
stored in the database is used and the admin UI shows a warning.

See `docs/meta-ads-setup.md` for the step-by-step Meta setup.

## Security model (summary)

* Sessions: random 256-bit tokens, stored hashed, HTTP-only + SameSite=Lax + Secure cookies.
* Passwords: scrypt (async), minimum length and common-password checks; changing a
  password signs out other devices.
* Brute force: per-account and per-IP sign-in lockout (`src/services/loginGuard.js`).
* CSRF: state-changing `/api` requests from foreign origins are refused
  (`src/middleware/security.js`); CORS only allows configured origins.
* CSP with per-request nonces on every `<script>` (`src/services/pageRenderer.js`),
  HSTS, nosniff, frame-ancestors none.
* Abuse: rate limits on orders, sign-ups, promo checks, AI chat and tracking; a cap on
  unconfirmed orders per phone; unpaid unconfirmed orders auto-cancel and restock.
* Customer accounts must verify their email (link or Google) before guest orders with
  that email appear in their history; Google sign-in evicts unverified squatters.
* Errors: unexpected errors are logged server-side; clients get a generic message.

## Tests

```bash
# Uses a DISPOSABLE database: it is wiped on every run.
TEST_DATABASE_URL=postgres://postgres@localhost:5432/vibecraft_test npm test --prefix Server
npm run check --prefix Server        # syntax check of all server + client JS
```

CI (`.github/workflows/ci.yml`) runs the syntax check, `npm audit` and the tests against
PostgreSQL on every push and pull request.

## Main routes

Public: `GET /api/products`, `GET /api/products/:id`, `GET /api/categories`,
`GET /api/settings`, `GET /api/testimonials`, `POST /api/orders`,
`POST /api/promotions/validate`, `POST /api/ai/chat`, `POST /api/marketing/events`,
`/api/auth/*` (signup, login, Google, verify-email, profile), `GET /feeds/meta-catalog.xml|csv`,
`/sitemap.xml`, `/robots.txt`, `/privacy`, `/terms`, `/refunds`.

Webhooks: `GET|POST /api/webhooks/meta` (Lead Ads, signed),
`POST /api/payments/mpesa/callback/:secret` (Daraja).

Admin (`/api/admin/*`, permission-checked): products, uploads, testimonials,
promotions, orders (+ `/:id/mpesa-request`), customers, settings, integrations,
marketing (overview, leads, events), admins, roles, audit logs.
