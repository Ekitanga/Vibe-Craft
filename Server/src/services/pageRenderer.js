// Serves the storefront and admin HTML files with server-side additions that do not
// change how the pages look:
//   * a per-request CSP nonce on every <script> tag;
//   * share-preview (Open Graph) tags, product-specific on product pages;
//   * the Meta domain-verification tag;
//   * the tracking bootstrap (Pixel config from Admin → Integrations, no hard-coded IDs).
// It also builds the policy pages and sitemap/robots files.
const fs = require("fs/promises");
const path = require("path");
const env = require("../config/env");
const integrationSettings = require("./integrationSettingsService");
const siteSettingsService = require("./siteSettingsService");
const productService = require("./productService");
const { absoluteUrl, getPublicBaseUrl } = require("./publicUrl");

const clientPath = path.join(__dirname, "../../../Client");
const fileCache = new Map();

const readClientFile = async (fileName) => {
  if (env.isProduction && fileCache.has(fileName)) return fileCache.get(fileName);
  const content = await fs.readFile(path.join(clientPath, fileName), "utf8");
  if (env.isProduction) fileCache.set(fileName, content);
  return content;
};

const attr = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// JSON that is safe to embed inside a <script> element.
const scriptJson = (value) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const addNonces = (html, nonce) => html.replace(/<script(?![^>]*\snonce=)/gi, `<script nonce="${nonce}"`);

const pageTitle = (html) => {
  const match = html.match(/<title>([^<]*)<\/title>/i);
  return match ? match[1].trim() : "";
};

const pathExcluded = (requestPath, prefixes) =>
  (prefixes || []).some((prefix) => prefix && (requestPath === prefix || requestPath.startsWith(prefix.endsWith("/") ? prefix : prefix + "/") || requestPath.startsWith(prefix + ".")));

const trackingConfig = async (req) => {
  const [meta, consent] = await Promise.all([integrationSettings.getConfig("meta"), integrationSettings.getConfig("consent")]);
  const pixelOn = Boolean(meta.pixelEnabled && meta.pixelId && !pathExcluded(req.path, meta.excludedPaths));
  const config = {
    pixelId: pixelOn ? meta.pixelId : null,
    serverEvents: Boolean(meta.capiEnabled),
    purchaseTrigger: meta.purchaseTrigger || "placed",
    advancedMatching: Boolean(meta.advancedMatching),
    currency: "KES",
    consent: {
      bannerEnabled: Boolean(consent.bannerEnabled),
      requireConsent: Boolean(consent.requireConsent),
      message: consent.message,
      acceptLabel: consent.acceptLabel,
      declineLabel: consent.declineLabel,
      policyUrl: "/privacy",
    },
  };
  // Advanced matching: the Pixel hashes these in the browser before sending.
  if (pixelOn && meta.advancedMatching && req.customer) {
    config.user = { em: req.customer.email || undefined, ph: req.customer.phone || undefined, external_id: req.customer.id };
  }
  return config;
};

// Set by the /products/:slug route.
const productForPage = (req) => req.productForPage || null;

const shareTags = async (req, html, { baseUrl, settings, product }) => {
  const seo = await integrationSettings.getConfig("seo");
  if (!seo.openGraphEnabled || /property="og:/.test(html)) return "";

  // Canonical address: no query string (ad tracking parameters, etc.).
  const url = `${baseUrl}${product ? productService.productPath(product) : req.path}`;
  const image = product
    ? absoluteUrl(baseUrl, (product.images || []).find((src) => !/\/video\/upload\/|\.(mp4|webm|mov)(\?|$)/i.test(src)))
    : absoluteUrl(baseUrl, seo.defaultImageUrl || "/assets/outdoor-cinema.jpg");
  const title = product ? `${product.name} — ${settings.storeName}` : pageTitle(html) || settings.storeName;
  const description = String((product && (product.shortSummary || product.description)) || seo.defaultDescription || settings.tagline || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);

  const tags = [
    ["property", "og:site_name", settings.storeName],
    ["property", "og:type", product ? "product" : "website"],
    ["property", "og:title", title],
    ["property", "og:description", description],
    ["property", "og:url", url],
    ["property", "og:image", image],
    ["name", "twitter:card", image ? "summary_large_image" : "summary"],
  ];
  if (product) {
    tags.push(["property", "product:price:amount", String(product.price)]);
    tags.push(["property", "product:price:currency", product.currency || "KES"]);
    tags.push(["property", "product:availability", product.stock > 0 ? "in stock" : "out of stock"]);
    tags.push(["property", "product:retailer_item_id", product.id]);
  }
  return [`<link rel="canonical" href="${attr(url)}" />`]
    .concat(tags
      .filter(([, , content]) => content)
      .map(([kind, name, content]) => `<meta ${kind}="${attr(name)}" content="${attr(content)}" />`))
    .join("\n    ");
};

const storefrontHead = async (req, html, nonce) => {
  const [meta, settings, baseUrl] = await Promise.all([
    integrationSettings.getConfig("meta"),
    siteSettingsService.getSettings(),
    getPublicBaseUrl(req),
  ]);
  const product = productForPage(req);
  const parts = [];

  if (meta.domainVerificationCode) {
    parts.push(`<meta name="facebook-domain-verification" content="${attr(meta.domainVerificationCode)}" />`);
  }
  const share = await shareTags(req, html, { baseUrl, settings, product });
  if (share) parts.push(share);

  const tracking = await trackingConfig(req);
  parts.push(`<script nonce="${nonce}">window.VIBECRAFT_TRACKING=${scriptJson(tracking)};</script>`);
  parts.push(`<script nonce="${nonce}" src="/meta-pixel.js?v=tracking-2"></script>`);
  if (tracking.pixelId && !tracking.consent.requireConsent) {
    parts.push(
      `<noscript><img height="1" width="1" style="display:none" alt="" src="https://www.facebook.com/tr?id=${encodeURIComponent(tracking.pixelId)}&amp;ev=PageView&amp;noscript=1" /></noscript>`
    );
  }
  return parts.join("\n    ");
};

const sendHtml = (res, html) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // HTML may contain per-visitor data (nonce, signed-in customer for advanced matching).
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
};

// adminLogin: the sign-in page served at the private admin address (no storefront
// tracking, never indexed). loginPath: where admin pages send a signed-out admin.
const renderPage = async (req, res, fileName, { admin = false, adminLogin = false, loginPath = "" } = {}) => {
  const nonce = res.locals.cspNonce || "";
  let html = await readClientFile(fileName);
  if (adminLogin) {
    const config = scriptJson({ loginPage: true, path: "/" + loginPath });
    html = html.replace(/<\/head>/i, `    <meta name="robots" content="noindex, nofollow">\n    <script nonce="${nonce}">window.VIBECRAFT_ADMIN_LOGIN=${config};</script>\n  </head>`);
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
  } else if (admin) {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    const config = scriptJson({ path: loginPath ? "/" + loginPath : "/login" });
    html = html.replace(/<\/head>/i, `    <script nonce="${nonce}">window.VIBECRAFT_ADMIN_LOGIN=${config};</script>\n  </head>`);
  }
  if (!admin && !adminLogin) {
    // Pages are also served at nested paths (/products/<slug>); keep relative assets at the root.
    html = html.replace(/<head>/i, '<head>\n    <base href="/">');
    const head = await storefrontHead(req, html, nonce);
    html = html.replace(/<\/head>/i, `    ${head}\n  </head>`);
  }
  sendHtml(res, addNonces(html, nonce));
};

// ---- Policy pages -----------------------------------------------------------------
const POLICIES = {
  privacy: { field: "privacyPolicy", title: "Privacy policy" },
  terms: { field: "termsOfService", title: "Terms of service" },
  refunds: { field: "refundPolicy", title: "Returns & refunds" },
};

const defaultPolicy = (kind, settings) => {
  const contact = [settings.phone && `phone/WhatsApp ${settings.phone}`, settings.contactEmail && `email ${settings.contactEmail}`, settings.address]
    .filter(Boolean)
    .join(", ");
  if (kind === "privacy") {
    return `# Who we are
${settings.storeName} sells projectors and accessories in Kenya. We are the data controller for the personal data described here, under the Kenya Data Protection Act, 2019.

# What we collect
When you order or create an account we collect your name, phone number, email address, delivery address and M-Pesa transaction details. We also collect basic technical data such as your IP address, browser type and the pages you visit.

# Why we use it
To process and deliver your orders, confirm payments, contact you about your order, keep your account secure, and improve our store. With your consent we use advertising cookies (Meta Pixel) to measure and improve our adverts on Facebook and Instagram. Contact details are hashed before they are shared with Meta.

# Who we share it with
Delivery partners (to deliver your order), Safaricom M-Pesa (to process payments), Meta Platforms (advertising measurement), Google (sign-in, if you use it) and our hosting providers. We do not sell your personal data.

# How long we keep it
Order records are kept for as long as required for accounting and tax purposes. You can ask us to delete your account at any time.

# Your rights
You may ask to access, correct or delete your personal data, object to processing, or withdraw consent for advertising cookies. You can also complain to the Office of the Data Protection Commissioner.

# Contact
${contact}`;
  }
  if (kind === "terms") {
    return `# Orders
Placing an order is an offer to buy. We confirm orders by phone or WhatsApp before delivery. Prices are in Kenyan Shillings and exclude VAT unless stated.

# Payment
Pay via M-Pesa Paybill ${settings.paybill}, account ${settings.mpesaAccount}, or on delivery where offered.

# Delivery
Delivery times are estimates. Unconfirmed, unpaid orders may be cancelled automatically.

# Contact
${contact}`;
  }
  return `# Returns
Contact us within 7 days of delivery if your item is faulty or not as described. Items must be returned in their original packaging with all accessories.

# Refunds
Approved refunds are paid back via M-Pesa once the returned item has been inspected.

# Contact
${contact}`;
};

const policyHtml = (text) =>
  String(text)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const out = [];
      let paragraph = [];
      const flush = () => {
        if (paragraph.length) out.push(`<p>${paragraph.map(attr).join("<br />")}</p>`);
        paragraph = [];
      };
      lines.forEach((line) => {
        if (/^#\s+/.test(line)) {
          flush();
          out.push(`<h2>${attr(line.replace(/^#\s+/, ""))}</h2>`);
        } else {
          paragraph.push(line);
        }
      });
      flush();
      return out.join("\n");
    })
    .join("\n");

// Reuses the approved storefront header/footer (from cart.html) around the policy text.
const renderPolicy = async (req, res, kind) => {
  const policy = POLICIES[kind];
  const [legal, settings] = await Promise.all([integrationSettings.getConfig("legal"), siteSettingsService.getSettings()]);
  const text = legal[policy.field] || defaultPolicy(kind, settings);
  let html = await readClientFile("cart.html");

  // Scoped to .policy-page so the storefront's large display headings stay untouched elsewhere.
  const main = `<main id="top">
      <style>
        .policy-page { max-width: 820px; padding-top: 48px; padding-bottom: 72px; }
        .policy-page h1 { font-size: clamp(34px, 6vw, 56px); line-height: 1.05; margin: 6px 0 28px; }
        .policy-page h2 { font-size: clamp(20px, 2.6vw, 26px); line-height: 1.25; letter-spacing: -0.01em; margin: 32px 0 10px; }
        .policy-page p { font-size: 16px; line-height: 1.65; margin: 0 0 14px; max-width: 70ch; }
      </style>
      <section class="section-shell policy-page">
        <p class="eyebrow">${attr(settings.storeName)}</p>
        <h1>${attr(policy.title)}</h1>
        ${policyHtml(text)}
      </section>
    </main>`;
  html = html
    .replace(/<main[\s\S]*<\/main>/i, main)
    .replace(/<title>[^<]*<\/title>/i, `<title>${attr(settings.storeName)} — ${attr(policy.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"/i, `<meta name="description" content="${attr(policy.title)} for ${attr(settings.storeName)}."`)
    .replace(/\s*<script src="(?:delivery-fees|cart)\.js[^"]*"><\/script>/gi, "")
    .replace(/ aria-current="page"/g, "");

  const nonce = res.locals.cspNonce || "";
  const head = await storefrontHead(req, html, nonce);
  html = html.replace(/<\/head>/i, `    ${head}\n  </head>`);
  sendHtml(res, addNonces(html, nonce));
};

// ---- robots.txt & sitemap.xml ------------------------------------------------------
const robotsTxt = async (req) => {
  const [seo, baseUrl] = await Promise.all([integrationSettings.getConfig("seo"), getPublicBaseUrl(req)]);
  const lines = ["User-agent: *", ...(seo.robotsDisallow || []).map((item) => `Disallow: ${item}`)];
  if (seo.sitemapEnabled) lines.push("", `Sitemap: ${baseUrl}/sitemap.xml`);
  return lines.join("\n") + "\n";
};

const sitemapXml = async (req) => {
  const baseUrl = await getPublicBaseUrl(req);
  const products = await productService.listProducts();
  const urls = [
    { loc: `${baseUrl}/`, priority: "1.0" },
    { loc: `${baseUrl}/find-your-setup`, priority: "0.6" },
    { loc: `${baseUrl}/privacy`, priority: "0.2" },
    { loc: `${baseUrl}/terms`, priority: "0.2" },
    { loc: `${baseUrl}/refunds`, priority: "0.2" },
    ...products.map((product) => ({
      loc: `${baseUrl}${productService.productPath(product)}`,
      lastmod: product.updatedAt ? new Date(product.updatedAt).toISOString().slice(0, 10) : undefined,
      priority: "0.8",
    })),
  ];
  const body = urls
    .map((url) => `  <url><loc>${attr(url.loc)}</loc>${url.lastmod ? `<lastmod>${url.lastmod}</lastmod>` : ""}<priority>${url.priority}</priority></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
};

module.exports = { POLICIES, addNonces, renderPage, renderPolicy, robotsTxt, scriptJson, sitemapXml };
