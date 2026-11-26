# Vibecraft on WordPress (EasyWP)

The approved Vibecraft storefront, running on WordPress + WooCommerce. It looks and works
the same as the previous site: the same pages, Vibe AI, and one-page checkout with M-Pesa
paybill. The difference is that everything is now managed from the WordPress admin, and
Meta (Facebook/Instagram ads) connects through Meta's own plugin.

| Piece | What it does |
| --- | --- |
| **Vibecraft theme** (`vibecraft-theme.zip`) | The approved pages, styles and scripts, unchanged in look. |
| **Vibecraft Core plugin** (`vibecraft-core.zip`) | Product data for the pages, checkout → WooCommerce orders, M-Pesa paybill, delivery fees per county, promo codes (WooCommerce coupons), Vibe AI, customer accounts and Google sign-in, testimonials, store settings, security hardening, and a one-click import from the previous site. |
| **WooCommerce** | Products, stock, orders, coupons, customers, emails. |
| **Facebook for WooCommerce** (Meta's plugin) | Pixel + Conversions API (PageView, ViewContent, Purchase), product catalog sync. |
| **WPS Hide Login** | Moves the admin login to a private address (e.g. `/kevo`). |

## Install on EasyWP (about 20 minutes)

1. **Open the site's admin.** In the Namecheap EasyWP dashboard, open the WordPress site
   (the temporary EasyWP address is fine for now) and log in to WP Admin.
2. **Install the free plugins.** Go to Plugins → Add New, then search for, install and
   activate each:
   - **WooCommerce**. Skip its setup wizard; the Vibecraft plugin configures it.
   - **Facebook for WooCommerce**
   - **WPS Hide Login**
   - **WP Mail SMTP**, optional but recommended so order emails reliably arrive.
3. **Install the Vibecraft plugin.** Plugins → Add New → **Upload Plugin**, choose
   `vibecraft-core.zip`, then Install → **Activate**.
   - Activating it creates the pages: Home, Shop, About, Contact, Cart, Login, Sign up,
     Account, Find your setup, Privacy, Terms and Returns.
   - It also sets WooCommerce to KES, Kenya and guest checkout, with product addresses
     like `/products/<name>`.
4. **Install the theme.** Appearance → Themes → Add New → **Upload Theme**, choose
   `vibecraft-theme.zip`, then Install → **Activate**.
5. **Refresh addresses.** Settings → Permalinks, then click **Save Changes** without
   changing anything.
6. **Import the catalogue.** WooCommerce → **Vibecraft → Import** → Start import. It
   copies products with photos, categories, store settings and testimonials. You can run
   it again safely.
7. **Vibe AI and Google sign-in.** In WooCommerce → **Vibecraft → Vibe AI & sign-in**:
   - **Gemini API key.** Get one from <https://aistudio.google.com/apikey>.
   - **Google sign-in client ID.** In Google Cloud Console, add the site's address to the
     client's *Authorised JavaScript origins*.
8. **Private admin address.** Settings → **WPS Hide Login**, set the login URL to your
   private word (e.g. `kevo`), then Save. From then on the admin login is only at
   `https://<your domain>/kevo`.
9. **Connect Meta.** Marketing → **Facebook** → Get started / Connect:
   - Choose business **vibecraft254**.
   - Pixel: **vibecraft254's pixel**.
   - Catalog: **Vibecraft254 Catalogue**.
   - Page: **Vibecraft254**.

   Leave Conversions API on. Meta's plugin then syncs the products to the catalog by
   itself.
10. **Test an order.** Place one real order on the site. It appears in WooCommerce →
    Orders as **On hold**.
11. **Point the domain.** In the EasyWP dashboard, attach `vibecraft254.com` to the site.
    If the domain is in the same Namecheap account, EasyWP updates the DNS itself.
    HTTPS is issued automatically.

## Day to day

| Task | Where |
| --- | --- |
| Confirm a payment | WooCommerce → Orders → open the order (the M-Pesa code is shown) → status **Processing** |
| Add or edit a product | Products → Add New. Price, sale price, stock and photos are standard WooCommerce. Projector details (resolution, brightness, specs, what's in the box, videos) are in the **Vibecraft product details** box. |
| Promo codes | Marketing → Coupons (percentage or fixed amount, minimum spend, expiry, usage limit) |
| Delivery fees per county, free-delivery threshold | WooCommerce → Vibecraft → Delivery fees |
| Phone, WhatsApp, paybill, address, hours, colours, social links | WooCommerce → Vibecraft → Store details |
| Testimonials | WooCommerce → Testimonials |
| Policies (privacy, terms, returns) | Pages |
| Abuse limits (orders per hour, fake-order protection, AI usage, login lock) | WooCommerce → Vibecraft → Abuse limits |
| Staff accounts and roles | Users (WooCommerce roles: Shop manager, Administrator) |

## Security built in

- Staff cannot sign in on the shop's login page, only at the private admin address.
- Customer sign-in locks for 15 minutes after repeated wrong passwords.
- Orders, sign-ups and Vibe AI are rate-limited per connection.
- One phone number can only hold a few unconfirmed orders.
- Requests that change data must come from the site itself.
- XML-RPC is off, and staff usernames are not exposed (author pages, users API, sitemap).
- The theme and plugin editor is disabled in the dashboard.
- Security headers are sent.
- API keys (Gemini) are never sent to browsers.

Recommended: a strong admin password, two-factor login (e.g. the free **Two Factor**
plugin), and EasyWP's daily backups switched on.

## For developers

- `Client/` is still the source of the storefront design. After changing it, run
  `python wordpress/build-zips.py`. It re-syncs the theme (`sync-theme.py`) and writes
  `wordpress/dist/*.zip`.
- Local WordPress: `cd wordpress/dev && docker compose up -d` gives
  <http://localhost:8090>. Bootstrap commands are in `dev/docker-compose.yml`.
- Storefront API: `/wp-json/vibecraft/v1/{products,categories,settings,testimonials,orders,promotions/validate,ai/chat,auth/*}`.
  It has the same shapes as the previous Node API, so the page scripts are unchanged.
