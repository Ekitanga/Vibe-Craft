// Admin-editable configuration for every integration and security control.
//
// Each section is described by a schema (below). The admin UI renders its forms from
// these schemas, so adding a field here is enough to make it editable — nothing is
// hard-coded in the browser. Secret fields are encrypted at rest (utils/secretBox) and
// are never sent back to the browser; the UI only learns whether they are set.
const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const secretBox = require("../utils/secretBox");

const SECTIONS = [
  {
    key: "site",
    title: "Website",
    description: "The public address of the store. Used for feeds, payment callbacks, share previews and Meta events.",
    fields: [
      { key: "publicBaseUrl", label: "Public website address", type: "url", default: "", placeholder: "https://vibecraft254.com", help: "Leave blank to use the address the request came in on." },
    ],
  },
  {
    key: "meta",
    title: "Meta (Facebook & Instagram) ads",
    description: "Pixel, Conversions API, product catalog, Lead Ads and ad-spend reporting.",
    fields: [
      { key: "pixelEnabled", group: "Pixel", label: "Enable Meta Pixel", type: "boolean", default: false },
      { key: "pixelId", group: "Pixel", label: "Pixel (dataset) ID", type: "text", default: "", pattern: "^[0-9]{5,20}$", placeholder: "27209025962115778", help: "Events Manager → Data sources → your pixel → Settings." },
      { key: "advancedMatching", group: "Pixel", label: "Advanced matching for signed-in customers", type: "boolean", default: true, help: "Sends the customer's email and phone to Meta (hashed in the browser) to improve ad attribution." },
      { key: "excludedPaths", group: "Pixel", label: "Pages that never load the Pixel", type: "list", default: ["/login", "/signup", "/account", "/admin"], help: "Comma-separated path prefixes. Keeps tracking off sign-in and account pages." },
      { key: "capiEnabled", group: "Conversions API", label: "Enable Conversions API (server-side events)", type: "boolean", default: false, help: "Sends events from the server so they are counted even when browsers block the Pixel. Uses the same event IDs as the Pixel, so Meta de-duplicates them." },
      { key: "capiAccessToken", group: "Conversions API", label: "Conversions API access token", type: "secret", help: "Events Manager → your pixel → Settings → Conversions API → Generate access token." },
      { key: "testEventCode", group: "Conversions API", label: "Test event code", type: "text", default: "", help: "From Events Manager → Test events. Remove it when you are done testing." },
      { key: "purchaseTrigger", group: "Conversions API", label: "Report a Purchase when", type: "select", default: "placed", options: [{ value: "placed", label: "The order is placed" }, { value: "verified", label: "The payment is verified" }], help: "\"Verified\" reports only paid orders (more accurate optimisation, but slower signal)." },
      { key: "graphApiVersion", group: "Conversions API", label: "Graph API version", type: "text", default: "v23.0", pattern: "^v[0-9]{2}\\.[0-9]$" },
      { key: "domainVerificationCode", group: "Domain & catalog", label: "Domain verification code", type: "text", default: "", help: "Business settings → Brand safety → Domains → Meta-tag option. Paste only the content value." },
      { key: "catalogFeedEnabled", group: "Domain & catalog", label: "Publish product catalog feed", type: "boolean", default: true, help: "Feed URLs are shown on the Marketing page. Add one as a scheduled data feed in Commerce Manager." },
      { key: "catalogFeedToken", group: "Domain & catalog", label: "Feed access key", type: "text", default: "", help: "Optional. When set, the feed URL must include ?key=<this value>." },
      { key: "adAccountId", group: "Reporting", label: "Ad account ID", type: "text", default: "", pattern: "^(act_)?[0-9]{5,20}$", placeholder: "act_1234567890", help: "Used to show ad spend and return on ad spend on the Marketing page." },
      { key: "marketingAccessToken", group: "Reporting", label: "Marketing API access token", type: "secret", help: "A System User token with ads_read (and leads_retrieval for Lead Ads)." },
      { key: "leadAdsEnabled", group: "Lead Ads", label: "Receive Lead Ads leads", type: "boolean", default: false },
      { key: "appSecret", group: "Lead Ads", label: "Meta app secret", type: "secret", help: "Used to verify that webhook calls really come from Meta." },
      { key: "webhookVerifyToken", group: "Lead Ads", label: "Webhook verify token", type: "secret", generate: true, reveal: true, help: "Paste this into the app's Webhooks setup together with the callback URL shown on the Marketing page." },
      { key: "pageAccessToken", group: "Lead Ads", label: "Page access token", type: "secret", help: "Optional. Used to download lead details; falls back to the Marketing API token." },
    ],
  },
  {
    key: "mpesa",
    title: "M-Pesa (Daraja) payments",
    description: "Send an M-Pesa payment prompt (STK Push) to the customer's phone and verify payments automatically. Requires your own Daraja app and a paybill/till enabled for Lipa Na M-Pesa Online.",
    fields: [
      { key: "enabled", label: "Enable M-Pesa STK Push", type: "boolean", default: false },
      { key: "environment", label: "Environment", type: "select", default: "sandbox", options: [{ value: "sandbox", label: "Sandbox (testing)" }, { value: "production", label: "Production (live money)" }] },
      { key: "shortcode", label: "Business shortcode", type: "text", default: "", pattern: "^[0-9]{5,10}$", help: "The paybill or Head Office number registered on Daraja." },
      { key: "transactionType", label: "Transaction type", type: "select", default: "CustomerPayBillOnline", options: [{ value: "CustomerPayBillOnline", label: "Paybill" }, { value: "CustomerBuyGoodsOnline", label: "Buy Goods (till)" }] },
      { key: "tillNumber", label: "Till number (Buy Goods only)", type: "text", default: "", pattern: "^[0-9]{5,10}$" },
      { key: "accountReference", label: "Account reference", type: "text", default: "", help: "Shown on the customer's phone. Leave blank to use the order number." },
      { key: "autoPromptOnCheckout", label: "Prompt the customer automatically after checkout", type: "boolean", default: false, help: "Off by default so checkout behaves exactly as it does today until you switch it on." },
      { key: "verifyCallbacksWithQuery", label: "Double-check every callback with Safaricom", type: "boolean", default: true, help: "Confirms each payment with the STK Query API before marking the order paid." },
      { key: "consumerKey", label: "Consumer key", type: "secret" },
      { key: "consumerSecret", label: "Consumer secret", type: "secret" },
      { key: "passkey", label: "Lipa Na M-Pesa passkey", type: "secret" },
      { key: "callbackToken", label: "Callback secret", type: "secret", generate: true, help: "Generated automatically and embedded in the callback URL so only Safaricom knows it." },
    ],
  },
  {
    key: "email",
    title: "Email (SMTP)",
    description: "Order confirmations, new-order alerts and email address verification.",
    fields: [
      { key: "enabled", label: "Enable email", type: "boolean", default: false },
      { key: "host", label: "SMTP host", type: "text", default: "", placeholder: "smtp.gmail.com" },
      { key: "port", label: "SMTP port", type: "number", default: 587, min: 1, max: 65535 },
      { key: "secure", label: "Use TLS from the start (port 465)", type: "boolean", default: false },
      { key: "username", label: "SMTP username", type: "text", default: "" },
      { key: "password", label: "SMTP password / app password", type: "secret" },
      { key: "fromAddress", label: "From address", type: "email", default: "" },
      { key: "fromName", label: "From name", type: "text", default: "Vibecraft" },
      { key: "storeNotificationEmails", label: "Send new-order alerts to", type: "list", default: [], help: "Comma-separated email addresses." },
      { key: "sendOrderConfirmation", label: "Email customers an order confirmation", type: "boolean", default: true },
      { key: "sendNewOrderAlert", label: "Email the store about new orders", type: "boolean", default: true },
      { key: "sendEmailVerification", label: "Ask new customers to verify their email", type: "boolean", default: true },
    ],
  },
  {
    key: "security",
    title: "Security & abuse protection",
    description: "Limits that stop password guessing, fake orders and spam. Set a limit to 0 to switch it off.",
    fields: [
      { key: "loginAttempts", group: "Sign-in", label: "Failed sign-ins allowed per account", type: "number", default: 8, min: 0, max: 100 },
      { key: "loginAttemptsPerIp", group: "Sign-in", label: "Sign-in attempts allowed per IP address", type: "number", default: 30, min: 0, max: 1000 },
      { key: "loginWindowMinutes", group: "Sign-in", label: "Sign-in lockout window (minutes)", type: "number", default: 15, min: 1, max: 1440 },
      { key: "adminPasswordMinLength", group: "Sign-in", label: "Minimum admin password length", type: "number", default: 10, min: 8, max: 64 },
      { key: "customerPasswordMinLength", group: "Sign-in", label: "Minimum customer password length", type: "number", default: 8, min: 8, max: 64 },
      { key: "adminSessionHours", group: "Sign-in", label: "Admin session length (hours)", type: "number", default: 72, min: 1, max: 720 },
      { key: "signupsPerHourPerIp", group: "Accounts", label: "New accounts per hour per IP", type: "number", default: 10, min: 0, max: 1000 },
      { key: "ordersPerHourPerIp", group: "Orders", label: "Orders per hour per IP", type: "number", default: 8, min: 0, max: 1000 },
      { key: "maxPendingOrdersPerPhone", group: "Orders", label: "Unconfirmed orders allowed per phone number", type: "number", default: 3, min: 0, max: 100 },
      { key: "pendingOrderExpiryHours", group: "Orders", label: "Cancel unpaid, unconfirmed orders after (hours)", type: "number", default: 48, min: 0, max: 720, help: "Returns reserved stock and promo uses. Only touches orders still \"pending\" with no verified payment. 0 = never." },
      { key: "promoChecksPer10Min", group: "Abuse", label: "Promo code checks per 10 minutes per IP", type: "number", default: 20, min: 0, max: 1000 },
      { key: "aiMessagesPer5Min", group: "Abuse", label: "AI assistant messages per 5 minutes per IP", type: "number", default: 20, min: 0, max: 1000 },
      { key: "trackingEventsPerMinute", group: "Abuse", label: "Tracking events per minute per IP", type: "number", default: 60, min: 0, max: 10000 },
      { key: "cspMode", group: "Browser protection", label: "Content Security Policy", type: "select", default: "enforce", options: [{ value: "enforce", label: "Enforce (recommended)" }, { value: "report-only", label: "Report only" }, { value: "off", label: "Off" }], help: "Blocks injected scripts. Switch to \"Report only\" if a new third-party tool stops working, then add its domain below." },
      { key: "cspExtraSources", group: "Browser protection", label: "Extra trusted domains", type: "list", default: [], help: "Comma-separated https:// origins allowed to load scripts, frames and connections." },
      { key: "allowedOrigins", group: "Browser protection", label: "Extra allowed site origins", type: "list", default: [], help: "Other domains that may call the API (for example a staging site)." },
    ],
  },
  {
    key: "seo",
    title: "Share previews & search",
    description: "How links look when shared on WhatsApp, Facebook and Instagram, and what search engines can index.",
    fields: [
      { key: "openGraphEnabled", label: "Add share-preview tags", type: "boolean", default: true },
      { key: "defaultImageUrl", label: "Default share image", type: "url", default: "", help: "Leave blank to use the store photo. Products use their own first image." },
      { key: "defaultDescription", label: "Default share description", type: "textarea", default: "Projectors, screens and setups for movie nights, gaming and presentations. Delivered across Kenya.", maxLength: 300 },
      { key: "sitemapEnabled", label: "Publish sitemap.xml", type: "boolean", default: true },
      { key: "robotsDisallow", label: "Hide from search engines", type: "list", default: ["/admin", "/api/", "/account", "/cart", "/login", "/signup"] },
    ],
  },
  {
    key: "consent",
    title: "Cookie consent",
    description: "Kenya's Data Protection Act requires consent before tracking. The banner is off by default so the storefront looks exactly as approved until you switch it on.",
    fields: [
      { key: "bannerEnabled", label: "Show a consent banner", type: "boolean", default: false },
      { key: "requireConsent", label: "Wait for consent before loading the Pixel", type: "boolean", default: false, help: "When on, the Pixel only loads after the visitor accepts." },
      { key: "message", label: "Banner text", type: "textarea", default: "We use cookies to measure our ads and improve your shopping experience.", maxLength: 300 },
      { key: "acceptLabel", label: "Accept button", type: "text", default: "Accept", maxLength: 30 },
      { key: "declineLabel", label: "Decline button", type: "text", default: "No thanks", maxLength: 30 },
    ],
  },
  {
    key: "legal",
    title: "Policies",
    description: "Published at /privacy, /terms and /refunds. Meta requires a privacy policy URL for ads and Lead Ads.",
    fields: [
      { key: "privacyPolicy", label: "Privacy policy", type: "textarea", default: "", maxLength: 30000, rows: 12, help: "Plain text. Blank lines start new paragraphs; lines starting with # become headings." },
      { key: "termsOfService", label: "Terms of service", type: "textarea", default: "", maxLength: 30000, rows: 10 },
      { key: "refundPolicy", label: "Returns & refunds", type: "textarea", default: "", maxLength: 30000, rows: 8 },
    ],
  },
];

const SECTION_MAP = new Map(SECTIONS.map((section) => [section.key, section]));
const CACHE_TTL_MS = 15 * 1000;
const cache = new Map();

const getSection = (key) => {
  const section = SECTION_MAP.get(key);
  if (!section) throw new HttpError(404, "Unknown integration section.");
  return section;
};

const defaultsFor = (section) =>
  section.fields.reduce((values, field) => {
    if (field.type !== "secret") values[field.key] = Array.isArray(field.default) ? field.default.slice() : field.default;
    return values;
  }, {});

const generateToken = () => crypto.randomBytes(24).toString("base64url");

const loadRow = async (key) => {
  const result = await db.query("SELECT config, secrets, updated_at FROM integration_settings WHERE key = $1", [key]);
  return result.rows[0] || null;
};

const load = async (key) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const section = getSection(key);
  const row = await loadRow(key);
  const config = { ...defaultsFor(section), ...((row && row.config) || {}) };
  let secrets = row && row.secrets ? await secretBox.decrypt(db, row.secrets) : {};

  // Auto-generate tokens the store needs to share with a provider (callback/verify tokens).
  const missing = section.fields.filter((field) => field.type === "secret" && field.generate && !secrets[field.key]);
  if (missing.length) {
    secrets = { ...secrets };
    missing.forEach((field) => {
      secrets[field.key] = generateToken();
    });
    await saveRow(key, config, secrets, null, row ? row.config || {} : {});
  }

  const value = { config, secrets, updatedAt: row ? row.updated_at : null };
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
};

const saveRow = async (key, _mergedConfig, secrets, adminId, storedConfig) => {
  const encrypted = Object.keys(secrets || {}).length ? await secretBox.encrypt(db, secrets) : null;
  await db.query(
    `INSERT INTO integration_settings (key, config, secrets, updated_by, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET config = EXCLUDED.config, secrets = EXCLUDED.secrets,
       updated_by = COALESCE(EXCLUDED.updated_by, integration_settings.updated_by), updated_at = NOW()`,
    [key, JSON.stringify(storedConfig || {}), encrypted, adminId || null]
  );
  cache.delete(key);
};

const getConfig = async (key) => (await load(key)).config;
const getSecrets = async (key) => (await load(key)).secrets;
const getAll = async (key) => {
  const { config, secrets } = await load(key);
  return { ...config, ...secrets };
};

const cleanValue = (field, raw) => {
  const fail = (message) => {
    throw new HttpError(400, `${field.label}: ${message}`);
  };

  switch (field.type) {
    case "boolean":
      return raw === true || raw === "true" || raw === 1 || raw === "on";
    case "number": {
      const value = Number(raw);
      if (!Number.isFinite(value) || !Number.isInteger(value)) fail("must be a whole number.");
      if (field.min !== undefined && value < field.min) fail(`must be at least ${field.min}.`);
      if (field.max !== undefined && value > field.max) fail(`must be at most ${field.max}.`);
      return value;
    }
    case "select": {
      const value = String(raw);
      if (!field.options.some((option) => option.value === value)) fail("choose one of the listed options.");
      return value;
    }
    case "list": {
      const items = (Array.isArray(raw) ? raw : String(raw || "").split(/[,\n]/))
        .map((item) => String(item).trim())
        .filter(Boolean);
      if (items.length > 50) fail("too many entries.");
      items.forEach((item) => {
        if (item.length > 200) fail("an entry is too long.");
      });
      return items;
    }
    case "url": {
      const value = String(raw || "").trim().replace(/\/+$/, "");
      if (!value) return "";
      if (!/^https?:\/\/[^\s<>"']+$/i.test(value)) fail("must start with https:// (or http:// for local testing).");
      if (value.length > 500) fail("is too long.");
      return value;
    }
    case "email": {
      const value = String(raw || "").trim();
      if (value && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value)) fail("must be a valid email address.");
      return value;
    }
    default: {
      const value = String(raw === undefined || raw === null ? "" : raw).trim();
      const max = field.maxLength || (field.type === "textarea" ? 5000 : 300);
      if (value.length > max) fail(`must be ${max} characters or fewer.`);
      if (value && field.pattern && !new RegExp(field.pattern).test(value)) fail("is not in the expected format.");
      return value;
    }
  }
};

// input: { values: {...}, clearSecrets: ["fieldKey"], regenerate: ["fieldKey"] }
// Secret fields left blank keep their current value.
const update = async (key, input = {}, adminId) => {
  const section = getSection(key);
  const row = await loadRow(key);
  const storedConfig = { ...((row && row.config) || {}) };
  let secrets = row && row.secrets ? await secretBox.decrypt(db, row.secrets) : {};
  const values = input.values && typeof input.values === "object" ? input.values : {};
  const clear = new Set(Array.isArray(input.clearSecrets) ? input.clearSecrets : []);
  const regenerate = new Set(Array.isArray(input.regenerate) ? input.regenerate : []);
  const changed = [];

  section.fields.forEach((field) => {
    if (field.type === "secret") {
      if (regenerate.has(field.key) && field.generate) {
        secrets[field.key] = generateToken();
        changed.push(field.key);
      } else if (clear.has(field.key)) {
        delete secrets[field.key];
        changed.push(field.key);
      } else if (typeof values[field.key] === "string" && values[field.key].trim()) {
        const secret = values[field.key].trim();
        if (secret.length > 2000) throw new HttpError(400, `${field.label} is too long.`);
        secrets[field.key] = secret;
        changed.push(field.key);
      }
      return;
    }
    if (values[field.key] === undefined) return;
    storedConfig[field.key] = cleanValue(field, values[field.key]);
    changed.push(field.key);
  });

  secrets = { ...secrets };
  await saveRow(key, null, secrets, adminId, storedConfig);
  return { changed };
};

const maskSecret = (field, value) => {
  if (!value) return { set: false };
  if (field.reveal) return { set: true, value };
  return { set: true, hint: value.length > 8 ? "••••" + value.slice(-4) : "••••" };
};

const adminView = async (key) => {
  const section = getSection(key);
  const { config, secrets, updatedAt } = await load(key);
  const values = {};
  section.fields.forEach((field) => {
    values[field.key] = field.type === "secret" ? maskSecret(field, secrets[field.key]) : config[field.key];
  });
  return {
    key: section.key,
    title: section.title,
    description: section.description,
    fields: section.fields.map(({ pattern, ...field }) => field),
    values,
    updatedAt,
  };
};

const adminViewAll = async () => Promise.all(SECTIONS.map((section) => adminView(section.key)));

const clearCache = () => cache.clear();

module.exports = {
  SECTIONS,
  adminView,
  adminViewAll,
  clearCache,
  getAll,
  getConfig,
  getSecrets,
  update,
};
