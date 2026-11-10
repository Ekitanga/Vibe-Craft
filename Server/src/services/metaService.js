// Meta (Facebook / Instagram) integration:
//   * Conversions API — server-side events, de-duplicated with the browser Pixel by event_id.
//   * Lead Ads — webhook signature check + lead download.
//   * Marketing API — ad spend for ROAS reporting.
// Everything is configured in Admin → Integrations → Meta; nothing here is hard-coded.
const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const integrationSettings = require("./integrationSettingsService");

const GRAPH = "https://graph.facebook.com";
const REQUEST_TIMEOUT_MS = 8000;

// Browser events the store accepts for server-side relay. Purchase is deliberately not
// relayable: it is only ever sent by the server from a real order.
const RELAYABLE_EVENTS = new Set([
  "PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Lead", "Contact", "CompleteRegistration", "Search", "AddPaymentInfo",
]);

const sha256 = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");

const normalizeText = (value) => String(value || "").trim().toLowerCase();

// Kenyan numbers → E.164 digits without "+", the format Meta expects before hashing.
const normalizePhone = (value) => {
  let digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0") && digits.length === 10) digits = "254" + digits.slice(1);
  else if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) digits = "254" + digits;
  return digits.length >= 9 ? digits : "";
};

const hashed = (value) => (value ? [sha256(value)] : undefined);

const splitName = (name) => {
  const parts = normalizeText(name).split(/\s+/).filter(Boolean);
  return { first: parts[0] || "", last: parts.length > 1 ? parts[parts.length - 1] : "" };
};

const fbcFromClickId = (fbclid, timestamp = Date.now()) =>
  fbclid && /^[A-Za-z0-9_-]{10,500}$/.test(fbclid) ? `fb.1.${timestamp}.${fbclid}` : undefined;

const cleanCookie = (value) => (value && /^fb\.\d\.\d+\.[A-Za-z0-9_.-]{3,500}$/.test(value) ? value : undefined);

const buildUserData = ({ email, phone, name, city, country = "ke", externalId, ip, userAgent, fbp, fbc } = {}) => {
  const { first, last } = splitName(name);
  const data = {
    em: hashed(normalizeText(email) || ""),
    ph: hashed(normalizePhone(phone)),
    fn: hashed(first),
    ln: hashed(last),
    ct: hashed(normalizeText(city).replace(/[^a-z]/g, "")),
    country: hashed(normalizeText(country)),
    external_id: hashed(externalId),
    client_ip_address: ip || undefined,
    client_user_agent: userAgent || undefined,
    fbp: cleanCookie(fbp),
    fbc: cleanCookie(fbc),
  };
  Object.keys(data).forEach((key) => data[key] === undefined && delete data[key]);
  return data;
};

const getMeta = () => integrationSettings.getAll("meta");

const logEvent = async ({ eventName, eventId, source, status, httpStatus, detail }) => {
  try {
    await db.query(
      `INSERT INTO meta_event_log (event_name, event_id, source, status, http_status, detail)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [eventName, eventId || null, source, status, httpStatus || null, JSON.stringify(detail || {})]
    );
  } catch (error) {
    console.error("[meta] could not write event log", error.message);
  }
};

const pruneEventLog = async () => {
  await db.query(
    `DELETE FROM meta_event_log WHERE id < (SELECT COALESCE(MIN(id), 0) FROM (SELECT id FROM meta_event_log ORDER BY id DESC LIMIT 2000) recent)`
  );
};

const graphFetch = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let body = null;
    try {
      body = await response.json();
    } catch (_error) {
      body = null;
    }
    return { ok: response.ok, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const graphError = (result) =>
  (result.body && result.body.error && (result.body.error.error_user_msg || result.body.error.message)) || `HTTP ${result.status}`;

// Sends events to the Conversions API. Never throws: tracking must not break checkout.
const sendEvents = async (events, { source = "server" } = {}) => {
  const meta = await getMeta();
  const first = events[0] || {};
  if (!meta.capiEnabled || !meta.pixelId || !meta.capiAccessToken) {
    return { sent: false, reason: "Conversions API is not configured." };
  }

  const payload = { data: events };
  if (meta.testEventCode) payload.test_event_code = meta.testEventCode;

  try {
    const url = `${GRAPH}/${meta.graphApiVersion || "v23.0"}/${encodeURIComponent(meta.pixelId)}/events?access_token=${encodeURIComponent(meta.capiAccessToken)}`;
    const result = await graphFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await logEvent({
      eventName: first.event_name,
      eventId: first.event_id,
      source,
      status: result.ok ? "sent" : "error",
      httpStatus: result.status,
      detail: result.ok ? { eventsReceived: result.body && result.body.events_received, test: Boolean(meta.testEventCode) } : { error: graphError(result) },
    });
    return { sent: result.ok, status: result.status, error: result.ok ? undefined : graphError(result) };
  } catch (error) {
    await logEvent({ eventName: first.event_name, eventId: first.event_id, source, status: "error", detail: { error: error.message } });
    return { sent: false, error: error.message };
  }
};

const orderContents = (order) =>
  (order.items || []).map((item) => ({ id: item.productId, quantity: item.quantity, item_price: item.unitPrice }));

const purchaseEventId = (orderId) => `purchase_${orderId}`;

// Sends the Purchase event for an order exactly once.
const sendPurchaseForOrder = async (order, { eventSourceUrl } = {}) => {
  const meta = await getMeta();
  if (!meta.capiEnabled) return { sent: false, reason: "disabled" };

  const claim = await db.query(
    "UPDATE orders SET meta_purchase_sent_at = NOW() WHERE id = $1 AND meta_purchase_sent_at IS NULL RETURNING attribution, client_ip, created_at",
    [order.id]
  );
  if (!claim.rows[0]) return { sent: false, reason: "already sent" };

  const attribution = claim.rows[0].attribution || {};
  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: purchaseEventId(order.id),
    action_source: "website",
    event_source_url: eventSourceUrl || attribution.checkoutUrl || undefined,
    user_data: buildUserData({
      email: order.customer && order.customer.email,
      phone: order.customer && order.customer.phone,
      name: order.customer && order.customer.name,
      city: order.delivery && order.delivery.town,
      externalId: order.customerAccountId || (order.customer && normalizePhone(order.customer.phone)),
      ip: claim.rows[0].client_ip,
      userAgent: attribution.userAgent,
      fbp: attribution.fbp,
      fbc: attribution.fbc || fbcFromClickId(attribution.fbclid, new Date(claim.rows[0].created_at).getTime()),
    }),
    custom_data: {
      currency: order.currency || "KES",
      value: Number(order.total || 0),
      order_id: order.orderNumber || order.id,
      content_type: "product",
      content_ids: (order.items || []).map((item) => item.productId).filter(Boolean),
      contents: orderContents(order),
      num_items: (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    },
  };
  if (!event.event_source_url) delete event.event_source_url;

  const result = await sendEvents([event], { source: "order" });
  if (!result.sent) {
    // Release the claim so a later retry (e.g. after fixing the token) can send it.
    await db.query("UPDATE orders SET meta_purchase_sent_at = NULL WHERE id = $1", [order.id]);
  }
  return result;
};

const cleanCustomData = (input = {}) => {
  const data = {};
  if (input.value !== undefined && Number.isFinite(Number(input.value))) data.value = Math.max(0, Math.min(100000000, Number(input.value)));
  if (typeof input.currency === "string" && /^[A-Z]{3}$/.test(input.currency)) data.currency = input.currency;
  if (Array.isArray(input.content_ids)) data.content_ids = input.content_ids.slice(0, 50).map((id) => String(id).slice(0, 100));
  if (Array.isArray(input.contents)) {
    data.contents = input.contents.slice(0, 50).map((item) => ({
      id: String((item && item.id) || "").slice(0, 100),
      quantity: Math.max(1, Math.min(1000, Number((item && item.quantity) || 1))),
    }));
  }
  if (typeof input.content_name === "string") data.content_name = input.content_name.slice(0, 200);
  if (typeof input.content_type === "string") data.content_type = input.content_type === "product_group" ? "product_group" : "product";
  if (input.num_items !== undefined) data.num_items = Math.max(0, Math.min(1000, Number(input.num_items) || 0));
  if (typeof input.search_string === "string") data.search_string = input.search_string.slice(0, 200);
  if (typeof input.method === "string") data.method = input.method.slice(0, 40);
  return data;
};

// Relays an event that the browser Pixel also fired, so Meta can de-duplicate.
const relayBrowserEvent = async ({ body, ip, userAgent, cookies, customer, allowedOrigins }) => {
  const eventName = String((body && body.eventName) || "");
  const eventId = String((body && body.eventId) || "");
  if (!RELAYABLE_EVENTS.has(eventName)) throw new HttpError(400, "Unsupported event.");
  if (!/^[A-Za-z0-9_.:-]{8,80}$/.test(eventId)) throw new HttpError(400, "Invalid event id.");

  const meta = await getMeta();
  if (!meta.capiEnabled) return { accepted: false };

  let sourceUrl;
  try {
    const url = new URL(String(body.url || ""));
    if (allowedOrigins.has(url.origin.toLowerCase())) sourceUrl = url.toString().slice(0, 1000);
  } catch (_error) {
    sourceUrl = undefined;
  }

  const event = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: "website",
    event_source_url: sourceUrl,
    user_data: buildUserData({
      email: customer && meta.advancedMatching ? customer.email : undefined,
      phone: customer && meta.advancedMatching ? customer.phone : undefined,
      name: customer && meta.advancedMatching ? customer.name : undefined,
      externalId: customer ? customer.id : undefined,
      ip,
      userAgent,
      fbp: cookies._fbp,
      fbc: cookies._fbc || fbcFromClickId(body.fbclid),
    }),
    custom_data: cleanCustomData(body.customData),
  };
  if (!event.event_source_url) delete event.event_source_url;

  // Fire and forget so the browser beacon returns immediately.
  sendEvents([event], { source: "browser-relay" }).catch(() => {});
  return { accepted: true };
};

// ---- Diagnostics -------------------------------------------------------------
const testConnection = async () => {
  const meta = await getMeta();
  const checks = [];

  if (!meta.pixelId) checks.push({ name: "Pixel ID", ok: false, message: "Not set." });
  else checks.push({ name: "Pixel ID", ok: true, message: meta.pixelId });

  if (meta.pixelId && meta.capiAccessToken) {
    const result = await graphFetch(
      `${GRAPH}/${meta.graphApiVersion}/${encodeURIComponent(meta.pixelId)}?fields=name,last_fired_time&access_token=${encodeURIComponent(meta.capiAccessToken)}`
    ).catch((error) => ({ ok: false, status: 0, body: { error: { message: error.message } } }));
    checks.push({
      name: "Conversions API token",
      ok: result.ok,
      message: result.ok ? `Connected to "${result.body.name}"` + (result.body.last_fired_time ? `, last event ${result.body.last_fired_time}` : "") : graphError(result),
    });
    if (result.ok) {
      const send = await sendEvents(
        [{
          event_name: "PageView",
          event_time: Math.floor(Date.now() / 1000),
          event_id: "admin_test_" + crypto.randomUUID(),
          action_source: "website",
          user_data: buildUserData({ ip: "102.0.0.1", userAgent: "Vibecraft admin connection test" }),
        }],
        { source: "admin-test" }
      );
      checks.push({
        name: "Test event",
        ok: Boolean(send.sent),
        message: send.sent ? (meta.testEventCode ? "Sent — check Events Manager → Test events." : "Sent. Add a test event code to see it under Test events.") : send.error || send.reason,
      });
    }
  } else {
    checks.push({ name: "Conversions API token", ok: false, message: "Not set." });
  }

  if (meta.adAccountId && meta.marketingAccessToken) {
    const account = meta.adAccountId.startsWith("act_") ? meta.adAccountId : "act_" + meta.adAccountId;
    const result = await graphFetch(
      `${GRAPH}/${meta.graphApiVersion}/${account}?fields=name,currency,account_status&access_token=${encodeURIComponent(meta.marketingAccessToken)}`
    ).catch((error) => ({ ok: false, status: 0, body: { error: { message: error.message } } }));
    checks.push({ name: "Ad account", ok: result.ok, message: result.ok ? `${result.body.name} (${result.body.currency})` : graphError(result) });
  }

  return { checks };
};

const recentEvents = async (limit = 50) => {
  const result = await db.query(
    `SELECT event_name, event_id, source, status, http_status, detail, created_at
     FROM meta_event_log ORDER BY id DESC LIMIT $1`,
    [Math.min(200, Math.max(1, Number(limit) || 50))]
  );
  return result.rows.map((row) => ({
    eventName: row.event_name,
    eventId: row.event_id,
    source: row.source,
    status: row.status,
    httpStatus: row.http_status,
    detail: row.detail || {},
    createdAt: row.created_at,
  }));
};

// ---- Marketing API: ad spend ---------------------------------------------------
const fetchInsights = async ({ since, until }) => {
  const meta = await getMeta();
  if (!meta.adAccountId || !meta.marketingAccessToken) return { configured: false };
  const account = meta.adAccountId.startsWith("act_") ? meta.adAccountId : "act_" + meta.adAccountId;
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));
  const base = `${GRAPH}/${meta.graphApiVersion}/${account}/insights?time_range=${timeRange}&access_token=${encodeURIComponent(meta.marketingAccessToken)}`;

  const [totals, campaigns] = await Promise.all([
    graphFetch(`${base}&level=account&fields=spend,impressions,clicks,reach,cpc,ctr,account_currency`),
    graphFetch(`${base}&level=campaign&fields=campaign_id,campaign_name,spend,impressions,clicks&limit=50`),
  ]);
  if (!totals.ok) return { configured: true, error: graphError(totals) };

  const row = (totals.body.data && totals.body.data[0]) || {};
  return {
    configured: true,
    currency: row.account_currency || "KES",
    spend: Number(row.spend || 0),
    impressions: Number(row.impressions || 0),
    clicks: Number(row.clicks || 0),
    reach: Number(row.reach || 0),
    campaigns: campaigns.ok
      ? (campaigns.body.data || []).map((item) => ({
          id: item.campaign_id,
          name: item.campaign_name,
          spend: Number(item.spend || 0),
          impressions: Number(item.impressions || 0),
          clicks: Number(item.clicks || 0),
        }))
      : [],
  };
};

// ---- Lead Ads webhook ------------------------------------------------------------
const verifyWebhookSubscription = async (query) => {
  const meta = await getMeta();
  if (query["hub.mode"] === "subscribe" && meta.webhookVerifyToken && query["hub.verify_token"] === meta.webhookVerifyToken) {
    return String(query["hub.challenge"] || "");
  }
  throw new HttpError(403, "Webhook verification failed.");
};

const verifySignature = (rawBody, header, appSecret) => {
  if (!appSecret || !header || !rawBody) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(String(header));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const fieldValue = (fields, ...names) => {
  for (const name of names) {
    if (fields[name]) return fields[name];
  }
  return null;
};

const storeLead = async (change) => {
  const meta = await getMeta();
  const leadId = change && change.leadgen_id ? String(change.leadgen_id) : "";
  if (!leadId) return;

  const fields = {};
  let campaignName = null;
  const token = meta.pageAccessToken || meta.marketingAccessToken;
  if (token) {
    const result = await graphFetch(
      `${GRAPH}/${meta.graphApiVersion}/${encodeURIComponent(leadId)}?fields=field_data,campaign_name,ad_name,created_time&access_token=${encodeURIComponent(token)}`
    ).catch(() => ({ ok: false }));
    if (result.ok && result.body) {
      (result.body.field_data || []).forEach((item) => {
        fields[String(item.name).slice(0, 80)] = (item.values || []).join(", ").slice(0, 500);
      });
      campaignName = result.body.campaign_name || null;
    }
  }

  await db.query(
    `INSERT INTO leads (id, source, external_id, form_id, page_id, ad_id, campaign_name, name, email, phone, fields)
     VALUES ($1, 'meta_lead_ads', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
     ON CONFLICT (external_id) DO UPDATE SET fields = EXCLUDED.fields, campaign_name = COALESCE(EXCLUDED.campaign_name, leads.campaign_name)`,
    [
      crypto.randomUUID(),
      leadId,
      change.form_id ? String(change.form_id) : null,
      change.page_id ? String(change.page_id) : null,
      change.ad_id ? String(change.ad_id) : null,
      campaignName,
      fieldValue(fields, "full_name", "name", "first_name"),
      fieldValue(fields, "email", "work_email"),
      fieldValue(fields, "phone_number", "phone"),
      JSON.stringify(fields),
    ]
  );
};

const handleWebhook = async ({ rawBody, signature }) => {
  const meta = await getMeta();
  if (!meta.leadAdsEnabled) return { ignored: true };
  if (!verifySignature(rawBody, signature, meta.appSecret)) throw new HttpError(401, "Invalid signature.");

  const payload = JSON.parse(rawBody.toString("utf8"));
  const changes = [];
  (payload.entry || []).forEach((entry) => {
    (entry.changes || []).forEach((change) => {
      if (change.field === "leadgen" && change.value) changes.push(change.value);
    });
  });
  for (const change of changes) {
    await storeLead(change).catch((error) => console.error("[meta] could not store lead", error.message));
  }
  return { stored: changes.length };
};

const listLeads = async ({ limit = 100 } = {}) => {
  const result = await db.query("SELECT * FROM leads ORDER BY created_at DESC LIMIT $1", [Math.min(500, Math.max(1, Number(limit) || 100))]);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    campaignName: row.campaign_name,
    formId: row.form_id,
    fields: row.fields || {},
    status: row.status,
    createdAt: row.created_at,
  }));
};

const updateLeadStatus = async (id, status) => {
  if (!["new", "contacted", "converted", "closed"].includes(status)) throw new HttpError(400, "Invalid lead status.");
  const result = await db.query("UPDATE leads SET status = $2 WHERE id = $1 RETURNING id", [id, status]);
  if (!result.rows[0]) throw new HttpError(404, "Lead not found.");
};

module.exports = {
  RELAYABLE_EVENTS,
  buildUserData,
  fbcFromClickId,
  fetchInsights,
  handleWebhook,
  listLeads,
  normalizePhone,
  pruneEventLog,
  purchaseEventId,
  recentEvents,
  relayBrowserEvent,
  sendEvents,
  sendPurchaseForOrder,
  sha256,
  testConnection,
  updateLeadStatus,
  verifySignature,
  verifyWebhookSubscription,
};
