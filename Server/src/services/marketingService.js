// Attribution & ROAS reporting for Admin → Marketing.
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const integrationSettings = require("./integrationSettingsService");
const metaService = require("./metaService");
const mpesaService = require("./mpesaService");
const { getPublicBaseUrl } = require("./publicUrl");

const META_SOURCES = new Set(["facebook", "fb", "instagram", "ig", "meta", "an", "messenger", "whatsapp"]);

const referrerHost = (referrer) => {
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch (_error) {
    return "";
  }
};

// Classifies an order by its last marketing touch (falls back to first touch).
const channelFor = (attribution) => {
  const touch = (attribution && (attribution.last || attribution.first)) || {};
  const source = String(touch.utm_source || "").toLowerCase();
  if (touch.fbclid || (attribution && attribution.fbclid) || META_SOURCES.has(source)) return "Meta ads";
  if (source) return source.charAt(0).toUpperCase() + source.slice(1);
  const host = referrerHost(touch.referrer);
  if (/facebook\.com|instagram\.com|fb\.com/.test(host)) return "Meta (organic)";
  if (/google\./.test(host)) return "Google";
  if (/tiktok\.com/.test(host)) return "TikTok";
  if (host) return host;
  return "Direct / unknown";
};

const parseDate = (value, fallback) => {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw new HttpError(400, "Dates must look like 2026-11-01.");
  return String(value);
};

const isoDay = (date) => date.toISOString().slice(0, 10);

const addTo = (map, key, order) => {
  const entry = map.get(key) || { key, orders: 0, revenue: 0, paidRevenue: 0 };
  entry.orders += 1;
  entry.revenue += Number(order.total || 0);
  if (order.payment_verified) entry.paidRevenue += Number(order.total || 0);
  map.set(key, entry);
};

const report = async ({ since, until } = {}) => {
  const today = new Date();
  const untilDay = parseDate(until, isoDay(today));
  const sinceDay = parseDate(since, isoDay(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
  if (sinceDay > untilDay) throw new HttpError(400, "The start date must be before the end date.");

  const result = await db.query(
    `SELECT id, total, payment_verified, status, promotion_code, attribution, created_at
     FROM orders
     WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day') AND status <> 'cancelled'`,
    [sinceDay, untilDay]
  );

  const channels = new Map();
  const campaigns = new Map();
  const promos = new Map();
  let totalRevenue = 0;

  result.rows.forEach((order) => {
    totalRevenue += Number(order.total || 0);
    const channel = channelFor(order.attribution);
    addTo(channels, channel, order);
    const touch = (order.attribution && (order.attribution.last || order.attribution.first)) || {};
    if (touch.utm_campaign) addTo(campaigns, `${channel} · ${touch.utm_campaign}`, order);
    if (order.promotion_code) addTo(promos, order.promotion_code, order);
  });

  const sorted = (map) => [...map.values()].sort((a, b) => b.revenue - a.revenue);
  const metaRevenue = (channels.get("Meta ads") || { revenue: 0 }).revenue;
  const metaPaidRevenue = (channels.get("Meta ads") || { paidRevenue: 0 }).paidRevenue;

  let insights = { configured: false };
  try {
    insights = await metaService.fetchInsights({ since: sinceDay, until: untilDay });
  } catch (error) {
    insights = { configured: true, error: error.message };
  }

  return {
    since: sinceDay,
    until: untilDay,
    totals: { orders: result.rows.length, revenue: totalRevenue },
    channels: sorted(channels),
    campaigns: sorted(campaigns),
    promotions: sorted(promos),
    meta: {
      revenue: metaRevenue,
      paidRevenue: metaPaidRevenue,
      spend: insights.spend || 0,
      roas: insights.spend ? Number((metaRevenue / insights.spend).toFixed(2)) : null,
      insights,
    },
  };
};

// URLs the admin needs to paste into Meta / Safaricom dashboards.
const setupLinks = async (req) => {
  const [baseUrl, meta, mpesa] = await Promise.all([
    getPublicBaseUrl(req),
    integrationSettings.getAll("meta"),
    integrationSettings.getAll("mpesa"),
  ]);
  const key = meta.catalogFeedToken ? `?key=${encodeURIComponent(meta.catalogFeedToken)}` : "";
  return {
    baseUrl,
    catalogFeedXml: meta.catalogFeedEnabled ? `${baseUrl}/feeds/meta-catalog.xml${key}` : null,
    catalogFeedCsv: meta.catalogFeedEnabled ? `${baseUrl}/feeds/meta-catalog.csv${key}` : null,
    leadAdsWebhook: `${baseUrl}/api/webhooks/meta`,
    webhookVerifyToken: meta.webhookVerifyToken || null,
    mpesaCallback: mpesa.callbackToken ? mpesaService.callbackUrl(mpesa, baseUrl) : null,
    privacyPolicy: `${baseUrl}/privacy`,
    termsOfService: `${baseUrl}/terms`,
    sitemap: `${baseUrl}/sitemap.xml`,
    utmExample: `${baseUrl}/?utm_source=facebook&utm_medium=paid&utm_campaign=YOUR_CAMPAIGN`,
  };
};

module.exports = { channelFor, report, setupLinks };
