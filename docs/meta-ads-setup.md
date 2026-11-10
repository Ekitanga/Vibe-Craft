# Setting up Meta (Facebook & Instagram) ads for Vibecraft

Everything below is done in **Meta Business Suite / Events Manager** and in the
Vibecraft admin under **Integrations** and **Marketing**. No code changes are needed.

## 1. Before you start

* A Meta Business portfolio that owns the Facebook Page, Instagram account and ad account.
* Admin → Integrations → **Website**: set the public address, e.g. `https://vibecraft254.com`.
* Admin → Integrations → **Policies**: review the privacy policy (a sensible default is
  published at `/privacy` until you write your own). Meta asks for this URL.

## 2. Pixel (browser events)

The existing Pixel `27209025962115778` has been moved into the admin and is switched on.

* Admin → Integrations → Meta → **Pixel**: check the Pixel ID; tick *Enable Meta Pixel*.
* Events now sent: PageView, ViewContent (product pages), AddToCart (every add-to-cart
  button), InitiateCheckout (cart), Purchase (order placed), Lead (first AI assistant
  reply), Contact (WhatsApp / call / email clicks), CompleteRegistration (sign-up, sent
  from the server).
* Sign-in, sign-up and account pages never load the Pixel (editable list).

## 3. Conversions API (server events)

Server events are counted even when browsers block the Pixel, and Meta de-duplicates
them against the Pixel using a shared event ID.

1. Events Manager → your Pixel → **Settings** → *Conversions API* → **Generate access token**.
2. Admin → Integrations → Meta → **Conversions API**: paste the token, tick *Enable*, save.
3. Optional: copy a code from Events Manager → **Test events** into *Test event code*,
   click **Test Meta connection**, and watch the event arrive. Remove the code afterwards.
4. *Report a Purchase when*: “order is placed” (fast signal) or “payment is verified”
   (only paid orders — more accurate if many orders are never paid).

Health check: Admin → Marketing → *Conversions API activity* lists every server event
and any error (an expired token is the usual cause).

## 4. Domain verification

Business settings → Brand safety → **Domains** → add `vibecraft254.com` → choose the
*meta-tag* method → copy only the `content` value → paste into Admin → Integrations →
Meta → *Domain verification code* → save → click **Verify** in Meta.

## 5. Product catalog (dynamic ads, Shops)

1. Admin → Marketing → *Setup links* → copy **Catalog feed (XML)**.
2. Commerce Manager → create a catalog (E-commerce) → *Data sources* → **Data feed** →
   *Scheduled feed* → paste the URL → refresh **hourly** or **daily**, currency **KES**.
3. In Events Manager, connect the catalog to the Pixel. Product IDs in the feed match the
   IDs the Pixel sends, so Meta can show people the exact products they viewed.

Optional: set a *Feed access key* in Integrations; the feed URL then includes `?key=…`.

## 6. Tag your ad links

Use URL parameters on every ad, e.g.
`https://vibecraft254.com/?utm_source=facebook&utm_medium=paid&utm_campaign=december-sale`
(in Ads Manager: *Tracking → URL parameters*:
`utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}`).

Orders are then credited per campaign in Admin → Marketing, each order shows where it
came from on the Orders page, and WhatsApp messages started from a tagged visit
include `Ref: <campaign>` so chat sales can be attributed too.

Tip: create a promo code per campaign (Admin → Promotions); Marketing shows revenue per code.

## 7. Ad spend and ROAS in the admin

1. Business settings → Users → **System users** → add one → *Add assets* → your ad account
   (and Page, for Lead Ads) → **Generate token** with `ads_read` (and `leads_retrieval`,
   `pages_manage_metadata`, `pages_show_list` for Lead Ads).
2. Admin → Integrations → Meta → **Reporting**: ad account ID (`act_…`) and that token.
3. Admin → Marketing now shows spend, clicks, per-campaign spend and return on ad spend.

## 8. Lead Ads (instant forms)

1. Create a Meta app (Business type) → add the **Webhooks** product → *Page* →
   subscribe to `leadgen`.
2. Callback URL and verify token: Admin → Marketing → *Setup links*.
3. App secret: Meta app → Settings → Basic → paste into Integrations → Meta → *Meta app secret*.
4. Tick *Receive Lead Ads leads*, save. New leads appear in Admin → Marketing → Leads,
   where you can mark them contacted/converted.

## 9. Consent (Kenya Data Protection Act)

Integrations → **Cookie consent** adds a small banner (off by default so the storefront
stays exactly as approved). Turn on *Wait for consent before loading the Pixel* if your
legal advice requires opt-in tracking.

## 10. Before launching ads — checklist

- [ ] Owner password changed; every admin has their own account and the right role.
- [ ] `SETTINGS_ENCRYPTION_KEY` set on the server.
- [ ] Pixel + Conversions API test events received; test event code removed.
- [ ] Domain verified; catalog feed fetching without errors.
- [ ] Privacy policy reviewed and linked in Meta.
- [ ] Ads use UTM-tagged links.
