const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const marketingService = require("../services/marketingService");
const metaService = require("../services/metaService");
const catalogFeedService = require("../services/catalogFeedService");
const integrationSettings = require("../services/integrationSettingsService");
const siteSettingsService = require("../services/siteSettingsService");
const auditService = require("../services/auditService");
const { allowedOrigins } = require("../middleware/security");
const { getPublicBaseUrl } = require("../services/publicUrl");
const { parseCookies } = require("../utils/cookies");

// ---- Admin -------------------------------------------------------------------------
const overview = asyncHandler(async (req, res) => {
  const [report, links, events] = await Promise.all([
    marketingService.report({ since: req.query.since, until: req.query.until }),
    marketingService.setupLinks(req),
    metaService.recentEvents(30),
  ]);
  res.json({ success: true, data: { report, links, events } });
});

const listLeads = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await metaService.listLeads() });
});

const updateLead = asyncHandler(async (req, res) => {
  await metaService.updateLeadStatus(req.params.id, (req.body || {}).status);
  await auditService.record(req.admin, "update_lead", "lead", req.params.id, { status: (req.body || {}).status });
  res.json({ success: true, data: { updated: true } });
});

const listEvents = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await metaService.recentEvents(req.query.limit) });
});

// ---- Public: browser event relay for the Conversions API -----------------------------
const relayEvent = asyncHandler(async (req, res) => {
  const result = await metaService.relayBrowserEvent({
    body: req.body || {},
    ip: req.ip,
    userAgent: req.get("user-agent"),
    cookies: parseCookies(req.headers.cookie || ""),
    customer: req.customer || null,
    allowedOrigins: await allowedOrigins(req),
  });
  res.status(202).json({ success: true, data: result });
});

// ---- Public: product catalog feed ------------------------------------------------------
const catalogFeed = (format) =>
  asyncHandler(async (req, res) => {
    const meta = await integrationSettings.getConfig("meta");
    if (!meta.catalogFeedEnabled) throw new HttpError(404, "Not found.");
    if (meta.catalogFeedToken && req.query.key !== meta.catalogFeedToken) throw new HttpError(404, "Not found.");

    const [baseUrl, settings] = await Promise.all([getPublicBaseUrl(req), siteSettingsService.getSettings()]);
    const items = await catalogFeedService.buildItems(baseUrl);
    res.setHeader("Cache-Control", "public, max-age=900");
    if (format === "csv") {
      res.type("text/csv; charset=utf-8").send(catalogFeedService.toCsv(items));
    } else {
      res.type("application/xml; charset=utf-8").send(catalogFeedService.toXml(items, { storeName: settings.storeName, baseUrl }));
    }
  });

// ---- Public: Meta webhooks (Lead Ads) ---------------------------------------------------
const verifyWebhook = asyncHandler(async (req, res) => {
  const challenge = await metaService.verifyWebhookSubscription(req.query);
  res.type("text/plain").send(challenge);
});

const receiveWebhook = asyncHandler(async (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  await metaService.handleWebhook({ rawBody, signature: req.get("x-hub-signature-256") });
  res.status(200).json({ success: true });
});

module.exports = {
  catalogFeed,
  listEvents,
  listLeads,
  overview,
  receiveWebhook,
  relayEvent,
  updateLead,
  verifyWebhook,
};
