const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const h = require("./helpers");
const metaService = require("../src/services/metaService");
const catalogFeedService = require("../src/services/catalogFeedService");

test.before(async () => {
  await h.start();
  await h.createAdmin({ email: "owner@test.co", role: "owner" });
});
test.after(h.stop);

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

test("phone numbers are normalised and hashed the way Meta expects", () => {
  assert.equal(metaService.normalizePhone("0712 345 678"), "254712345678");
  assert.equal(metaService.normalizePhone("+254712345678"), "254712345678");
  assert.equal(metaService.normalizePhone("712345678"), "254712345678");
  const data = metaService.buildUserData({ email: " Jane@Example.com ", phone: "0712345678", name: "Jane Wanjiru Doe" });
  assert.deepEqual(data.em, [metaService.sha256("jane@example.com")]);
  assert.deepEqual(data.ph, [metaService.sha256("254712345678")]);
  assert.deepEqual(data.fn, [metaService.sha256("jane")]);
  assert.deepEqual(data.ln, [metaService.sha256("doe")]);
});

test("integration secrets are encrypted at rest and never returned", async () => {
  const owner = await h.signInAdmin("owner@test.co");
  const saved = await owner.patch("/api/admin/integrations/meta", {
    values: { capiEnabled: true, pixelId: "123456789012", capiAccessToken: "EAAG-super-secret-token-value" },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.data.values.capiAccessToken.set, true);
  assert.ok(!saved.text.includes("super-secret"));
  const row = (await h.db.query("SELECT secrets FROM integration_settings WHERE key = 'meta'")).rows[0];
  assert.ok(row.secrets.startsWith("v1:"));
  assert.ok(!row.secrets.includes("super-secret"));
  const audit = await owner.get("/api/admin/audit-logs");
  assert.ok(!audit.text.includes("super-secret"));
  // Blank secret keeps the stored value.
  await owner.patch("/api/admin/integrations/meta", { values: { capiAccessToken: "" } });
  assert.equal((await h.integrationSettings.getSecrets("meta")).capiAccessToken, "EAAG-super-secret-token-value");
});

test("a placed order sends exactly one Conversions API Purchase with hashed data", async () => {
  h.externalCalls.length = 0;
  h.setExternalHandler(() => ({ status: 200, body: { events_received: 1 } }));
  const http = h.client();
  const response = await http.post(
    "/api/orders",
    h.orderPayload({ attribution: { last: { utm_source: "facebook", utm_campaign: "november", fbclid: "IwAR0abcdefghijklmnop", at: new Date().toISOString() } } }),
    { Cookie: "_fbp=fb.1.1700000000000.123456789", "User-Agent": "TestAgent/1.0" }
  );
  assert.equal(response.status, 201);
  await settle();

  const calls = h.externalCalls.filter((call) => call.url.includes("/123456789012/events"));
  assert.equal(calls.length, 1);
  const event = calls[0].body.data[0];
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, response.json.data.tracking.purchaseEventId);
  assert.equal(event.custom_data.value, response.json.data.total);
  assert.deepEqual(event.custom_data.content_ids, ["p1"]);
  assert.deepEqual(event.user_data.ph, [metaService.sha256("254712345678")]);
  assert.equal(event.user_data.fbp, "fb.1.1700000000000.123456789");
  assert.match(event.user_data.fbc, /^fb\.1\.\d+\.IwAR0abcdefghijklmnop$/);
  assert.ok(!JSON.stringify(event).includes("jane@example.com"), "no raw email leaves the server");

  // Verifying the payment later does not send a duplicate Purchase.
  await h.createAdmin({ email: "payments@test.co", role: "manager" });
  const ops = await h.signInAdmin("payments@test.co");
  await ops.patch(`/api/admin/orders/${response.json.data.id}/payment`, { verified: true });
  await settle();
  assert.equal(h.externalCalls.filter((call) => call.url.includes("/events")).length, 1);
});

test("browser events relay only allow-listed names, never Purchase", async () => {
  const http = h.client();
  const bad = await http.post("/api/marketing/events", { eventName: "Purchase", eventId: "purchase_fake_123" });
  assert.equal(bad.status, 400);
  h.externalCalls.length = 0;
  const good = await http.post("/api/marketing/events", { eventName: "AddToCart", eventId: "AddToCart_abcdef12", customData: { value: 10000, currency: "KES", content_ids: ["p1"] } });
  assert.equal(good.status, 202);
  await settle();
  assert.equal(h.externalCalls[0].body.data[0].event_id, "AddToCart_abcdef12");
});

test("Lead Ads webhook verifies the subscription and the signature", async () => {
  const owner = await h.signInAdmin("owner@test.co");
  await owner.patch("/api/admin/integrations/meta", { values: { leadAdsEnabled: true, appSecret: "app-secret-xyz", marketingAccessToken: "EAAG-marketing" } });
  const { webhookVerifyToken } = await h.integrationSettings.getSecrets("meta");

  const http = h.client();
  const verify = await http.get(`/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(webhookVerifyToken)}&hub.challenge=4242`);
  assert.equal(verify.status, 200);
  assert.equal(verify.text, "4242");
  assert.equal((await http.get("/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1")).status, 403);

  const body = JSON.stringify({ entry: [{ changes: [{ field: "leadgen", value: { leadgen_id: "L1", form_id: "F1", page_id: "P1" } }] }] });
  const forged = await http.post("/api/webhooks/meta", body, { "Content-Type": "application/json", "X-Hub-Signature-256": "sha256=deadbeef" });
  assert.equal(forged.status, 401);

  h.setExternalHandler((call) =>
    call.url.includes("/L1?")
      ? { body: { field_data: [{ name: "full_name", values: ["Lead Person"] }, { name: "phone_number", values: ["0700111222"] }], campaign_name: "Leads Nov" } }
      : { body: {} }
  );
  const signature = "sha256=" + crypto.createHmac("sha256", "app-secret-xyz").update(body).digest("hex");
  const real = await http.post("/api/webhooks/meta", body, { "Content-Type": "application/json", "X-Hub-Signature-256": signature });
  assert.equal(real.status, 200);
  const leads = await owner.get("/api/admin/marketing/leads");
  assert.equal(leads.json.data[0].name, "Lead Person");
  assert.equal(leads.json.data[0].campaignName, "Leads Nov");
});

test("M-Pesa: STK push, forged callbacks rejected, real callback marks the order paid", async () => {
  const owner = await h.signInAdmin("owner@test.co");
  await owner.patch("/api/admin/integrations/site", { values: { publicBaseUrl: "https://shop.example.com" } });
  await owner.patch("/api/admin/integrations/mpesa", {
    values: { enabled: true, environment: "sandbox", shortcode: "174379", consumerKey: "ck", consumerSecret: "cs", passkey: "pk" },
  });
  let queryResult = "0";
  h.setExternalHandler((call) => {
    if (call.url.includes("/oauth/")) return { body: { access_token: "tok", expires_in: "3599" } };
    if (call.url.includes("/stkpush/v1/processrequest")) return { body: { ResponseCode: "0", CheckoutRequestID: "ws_CO_1", MerchantRequestID: "m1", CustomerMessage: "Success" } };
    if (call.url.includes("/stkpushquery/")) return { body: { ResultCode: queryResult, ResultDesc: "ok" } };
    return { body: {} };
  });

  const order = (await h.client().post("/api/orders", h.orderPayload({ customer: { name: "M Pesa", phone: "0712000999" } }))).json.data;
  const prompt = await owner.post(`/api/admin/orders/${order.id}/mpesa-request`, {});
  assert.equal(prompt.status, 200, prompt.text);
  const stk = h.externalCalls.find((call) => call.url.includes("processrequest")).body;
  assert.equal(stk.Amount, order.total);
  assert.equal(stk.PhoneNumber, "254712000999");
  const { callbackToken } = await h.integrationSettings.getSecrets("mpesa");
  assert.equal(stk.CallBackURL, `https://shop.example.com/api/payments/mpesa/callback/${callbackToken}`);

  const callback = (amount, resultCode = 0) => ({
    Body: { stkCallback: { MerchantRequestID: "m1", CheckoutRequestID: "ws_CO_1", ResultCode: resultCode, ResultDesc: "done",
      CallbackMetadata: { Item: [{ Name: "Amount", Value: amount }, { Name: "MpesaReceiptNumber", Value: "SKL123ABC9" }] } } },
  });
  const http = h.client();
  assert.equal((await http.post("/api/payments/mpesa/callback/not-the-token", callback(order.total))).status, 404);

  // Underpayment is not accepted.
  await http.post(`/api/payments/mpesa/callback/${callbackToken}`, callback(1));
  let current = (await owner.get("/api/admin/orders")).json.data.find((item) => item.id === order.id);
  assert.equal(current.paymentVerified, false);

  // Reset the attempt and send a correct callback.
  await h.db.query("UPDATE mpesa_payments SET status = 'pending' WHERE checkout_request_id = 'ws_CO_1'");
  const ok = await http.post(`/api/payments/mpesa/callback/${callbackToken}`, callback(order.total));
  assert.equal(ok.status, 200);
  assert.equal(ok.json.ResultCode, 0);
  current = (await owner.get("/api/admin/orders")).json.data.find((item) => item.id === order.id);
  assert.equal(current.paymentVerified, true);
  assert.equal(current.status, "confirmed");
  assert.equal(current.mpesaCode, "SKL123ABC9", "the M-Pesa receipt is recorded on the order");
});

test("catalog feed escapes content and matches Pixel content IDs", async () => {
  const xml = await h.client().get("/feeds/meta-catalog.xml");
  assert.equal(xml.status, 200);
  assert.match(xml.text, /<g:id>p1<\/g:id>/);
  assert.match(xml.text, /Bright &amp; sharp &lt;projector&gt;/);
  assert.match(xml.text, /<g:price>10000\.00 KES<\/g:price>/);
  assert.ok(!xml.text.includes("<g:id>p2</g:id>"), "products without images are skipped");
  assert.equal(catalogFeedService.xmlEscape("a\u0001b"), "ab");

  const owner = await h.signInAdmin("owner@test.co");
  await owner.patch("/api/admin/integrations/meta", { values: { catalogFeedToken: "feedkey" } });
  assert.equal((await h.client().get("/feeds/meta-catalog.xml")).status, 404);
  assert.equal((await h.client().get("/feeds/meta-catalog.xml?key=feedkey")).status, 200);
});
