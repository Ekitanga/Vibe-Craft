// M-Pesa Daraja: Lipa Na M-Pesa Online (STK Push), callbacks and status queries.
// Configured in Admin → Integrations → M-Pesa. Disabled until an admin turns it on.
//
// Callback security: Daraja does not sign callbacks, so (1) the callback URL carries a
// random secret, (2) the CheckoutRequestID must match a payment we created, (3) the
// amount must cover the order, and (4) optionally the result is re-confirmed with the
// STK Query API before the order is marked paid.
const crypto = require("crypto");
const db = require("../db/postgres");
const HttpError = require("../utils/httpError");
const integrationSettings = require("./integrationSettingsService");
const { normalizePhone } = require("./metaService");

const HOSTS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};
const TIMEOUT_MS = 15000;

let tokenCache = null;

const getConfig = () => integrationSettings.getAll("mpesa");

const timestamp = (date = new Date()) => {
  // Daraja expects East Africa Time (UTC+3) as yyyyMMddHHmmss.
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return eat.toISOString().replace(/[-:T]/g, "").slice(0, 14);
};

const stkPassword = (config, ts) => Buffer.from(`${config.shortcode}${config.passkey}${ts}`).toString("base64");

const darajaFetch = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
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

const darajaError = (result) =>
  (result.body && (result.body.errorMessage || result.body.ResponseDescription || result.body.error_description)) || `HTTP ${result.status}`;

const assertConfigured = (config) => {
  const missing = ["shortcode", "consumerKey", "consumerSecret", "passkey"].filter((key) => !config[key]);
  if (missing.length) throw new HttpError(400, "M-Pesa is missing: " + missing.join(", ") + ". Complete it in Integrations.");
};

const getAccessToken = async (config) => {
  const cacheKey = `${config.environment}:${config.consumerKey}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const result = await darajaFetch(`${HOSTS[config.environment] || HOSTS.sandbox}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!result.ok || !result.body || !result.body.access_token) throw new HttpError(502, "Could not sign in to Daraja: " + darajaError(result));
  tokenCache = {
    key: cacheKey,
    token: result.body.access_token,
    expiresAt: Date.now() + (Number(result.body.expires_in || 3599) - 60) * 1000,
  };
  return tokenCache.token;
};

const callbackUrl = (config, baseUrl) => `${String(baseUrl).replace(/\/+$/, "")}/api/payments/mpesa/callback/${config.callbackToken}`;

// Starts an STK Push for an order. `baseUrl` is the public site address.
const requestPayment = async ({ orderId, phone, baseUrl }) => {
  const config = await getConfig();
  if (!config.enabled) throw new HttpError(400, "M-Pesa payments are turned off. Enable them in Integrations.");
  assertConfigured(config);
  if (!/^https:\/\//.test(String(baseUrl || "")) && config.environment === "production") {
    throw new HttpError(400, "Set the public website address (https://…) in Integrations → Website so Safaricom can reach the callback.");
  }

  const orderResult = await db.query(
    `SELECT o.id, o.total, o.status, o.payment_verified, c.phone FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = $1`,
    [orderId]
  );
  const order = orderResult.rows[0];
  if (!order) throw new HttpError(404, "Order not found.");
  if (order.payment_verified) throw new HttpError(400, "This order is already paid.");
  if (order.status === "cancelled") throw new HttpError(400, "This order is cancelled.");

  const msisdn = normalizePhone(phone || order.phone);
  if (!/^254(7|1)\d{8}$/.test(msisdn)) throw new HttpError(400, "Enter a valid Safaricom number (07… or 01…).");
  const amount = Math.max(1, Math.ceil(Number(order.total || 0)));

  const ts = timestamp();
  const orderNumber = `VC-${String(order.id).replace(/-/g, "").slice(-8).toUpperCase()}`;
  const isBuyGoods = config.transactionType === "CustomerBuyGoodsOnline";
  const token = await getAccessToken(config);
  const result = await darajaFetch(`${HOSTS[config.environment] || HOSTS.sandbox}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: config.shortcode,
      Password: stkPassword(config, ts),
      Timestamp: ts,
      TransactionType: config.transactionType,
      Amount: amount,
      PartyA: msisdn,
      PartyB: isBuyGoods && config.tillNumber ? config.tillNumber : config.shortcode,
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl(config, baseUrl),
      AccountReference: (config.accountReference || orderNumber).slice(0, 12),
      TransactionDesc: `Order ${orderNumber}`.slice(0, 13),
    }),
  });

  if (!result.ok || !result.body || String(result.body.ResponseCode) !== "0") {
    throw new HttpError(502, "M-Pesa could not send the prompt: " + darajaError(result));
  }

  const paymentId = crypto.randomUUID();
  await db.query(
    `INSERT INTO mpesa_payments (id, order_id, checkout_request_id, merchant_request_id, phone, amount)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [paymentId, order.id, result.body.CheckoutRequestID, result.body.MerchantRequestID, msisdn, amount]
  );
  return {
    paymentId,
    checkoutRequestId: result.body.CheckoutRequestID,
    message: result.body.CustomerMessage || "Payment prompt sent to the customer's phone.",
  };
};

const queryPayment = async (config, checkoutRequestId) => {
  const ts = timestamp();
  const token = await getAccessToken(config);
  const result = await darajaFetch(`${HOSTS[config.environment] || HOSTS.sandbox}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: config.shortcode, Password: stkPassword(config, ts), Timestamp: ts, CheckoutRequestID: checkoutRequestId }),
  });
  if (!result.ok || !result.body) return { known: false };
  return { known: true, resultCode: String(result.body.ResultCode), resultDesc: result.body.ResultDesc };
};

const metadataValue = (items, name) => {
  const item = (items || []).find((entry) => entry && entry.Name === name);
  return item ? item.Value : undefined;
};

// Processes a Safaricom callback. Returns the order id when a payment was confirmed.
// `markOrderPaid(orderId, receipt)` is injected by the order service to avoid a cycle.
const handleCallback = async ({ token, body, markOrderPaid }) => {
  const config = await getConfig();
  const tokenOk =
    config.callbackToken &&
    token &&
    String(token).length === String(config.callbackToken).length &&
    crypto.timingSafeEqual(Buffer.from(String(token)), Buffer.from(String(config.callbackToken)));
  if (!tokenOk) throw new HttpError(404, "Not found.");

  const callback = body && body.Body && body.Body.stkCallback;
  if (!callback || !callback.CheckoutRequestID) throw new HttpError(400, "Malformed callback.");

  const paymentResult = await db.query("SELECT * FROM mpesa_payments WHERE checkout_request_id = $1", [callback.CheckoutRequestID]);
  const payment = paymentResult.rows[0];
  if (!payment) return { ignored: true };
  if (payment.status === "paid") return { orderId: payment.order_id, duplicate: true };

  const resultCode = String(callback.ResultCode);
  const items = callback.CallbackMetadata && callback.CallbackMetadata.Item;
  const receipt = metadataValue(items, "MpesaReceiptNumber");
  const amount = Number(metadataValue(items, "Amount") || 0);

  let status = resultCode === "0" ? "paid" : resultCode === "1032" ? "cancelled" : "failed";
  let resultDesc = callback.ResultDesc || "";

  if (status === "paid" && amount < payment.amount) {
    status = "failed";
    resultDesc = `Amount ${amount} is less than the expected ${payment.amount}.`;
  }

  if (status === "paid" && config.verifyCallbacksWithQuery) {
    const check = await queryPayment(config, callback.CheckoutRequestID).catch(() => ({ known: false }));
    if (!check.known || check.resultCode !== "0") {
      status = "failed";
      resultDesc = "Safaricom did not confirm this payment when re-checked.";
    }
  }

  await db.query(
    `UPDATE mpesa_payments SET status = $2, receipt_number = $3, result_code = $4, result_desc = $5, raw_callback = $6::jsonb WHERE id = $1`,
    [payment.id, status, receipt ? String(receipt).slice(0, 30) : null, resultCode, String(resultDesc).slice(0, 300), JSON.stringify(body).slice(0, 20000)]
  );

  if (status === "paid") {
    await markOrderPaid(payment.order_id, receipt ? String(receipt) : null);
    return { orderId: payment.order_id, paid: true };
  }
  return { orderId: payment.order_id, paid: false };
};

const listPaymentsForOrder = async (orderId) => {
  const result = await db.query(
    `SELECT id, phone, amount, status, receipt_number, result_desc, created_at FROM mpesa_payments WHERE order_id = $1 ORDER BY created_at DESC`,
    [orderId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    phone: row.phone,
    amount: row.amount,
    status: row.status,
    receiptNumber: row.receipt_number,
    resultDesc: row.result_desc,
    createdAt: row.created_at,
  }));
};

const testConnection = async () => {
  const config = await getConfig();
  assertConfigured(config);
  tokenCache = null;
  await getAccessToken(config);
  return { ok: true, message: `Signed in to Daraja (${config.environment}).` };
};

module.exports = { callbackUrl, handleCallback, listPaymentsForOrder, requestPayment, testConnection, timestamp };
