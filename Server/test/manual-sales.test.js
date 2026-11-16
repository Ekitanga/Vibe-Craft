const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const metaService = require("../src/services/metaService");
const marketingService = require("../src/services/marketingService");

test.before(async () => {
  await h.start();
  await h.createAdmin({ email: "owner@test.co", role: "owner" });
  await h.createAdmin({ email: "manager@test.co", role: "manager" });
  await h.createAdmin({ email: "editor@test.co", role: "editor" });
  await h.integrationSettings.update("meta", { values: { capiEnabled: true, pixelId: "123456789012", capiAccessToken: "EAAG-token" } });
});
test.after(h.stop);

const settle = () => new Promise((resolve) => setTimeout(resolve, 200));
const stockOf = async (id) => (await h.db.query("SELECT stock FROM products WHERE id = $1", [id])).rows[0].stock;

const sale = (overrides = {}) => ({
  channel: "whatsapp",
  customer: { name: "Wanjiru Kamau", phone: "0722 111 222" },
  items: [{ productId: "p1", quantity: 2 }],
  fulfillment: "pickup",
  ...overrides,
});

test("a recorded WhatsApp sale updates stock and reaches Meta as an offline Purchase", async () => {
  h.externalCalls.length = 0;
  h.setExternalHandler(() => ({ body: { events_received: 1 } }));
  const manager = await h.signInAdmin("manager@test.co");
  const before = await stockOf("p1");

  const response = await manager.post("/api/admin/orders/manual", sale({ paid: true, mpesaCode: "SKL1234567", fromMetaAd: true, campaign: "dec-sale" }));
  assert.equal(response.status, 201, response.text);
  const order = response.json.data;
  assert.equal(order.channel, "whatsapp");
  assert.equal(order.status, "confirmed");
  assert.equal(order.paymentVerified, true);
  assert.equal(order.total, 20000);
  assert.equal(order.deliveryFee, 0);
  assert.equal(await stockOf("p1"), before - 2);

  await settle();
  const purchases = h.externalCalls.filter((call) => call.url.includes("/events")).map((call) => call.body.data[0]);
  assert.equal(purchases.length, 1, "exactly one Purchase");
  assert.equal(purchases[0].action_source, "chat");
  assert.equal(purchases[0].event_source_url, undefined);
  assert.deepEqual(purchases[0].user_data.ph, [metaService.sha256("254722111222")]);
  assert.equal(purchases[0].custom_data.value, 20000);
});

test("recorded sales are attributed correctly in marketing reports", async () => {
  const manager = await h.signInAdmin("manager@test.co");
  await manager.post("/api/admin/orders/manual", sale({ channel: "phone", customer: { name: "Otieno", phone: "0733 000 111" }, items: [{ productId: "p1", quantity: 1 }] }));
  const report = await marketingService.report({});
  const byChannel = Object.fromEntries(report.channels.map((entry) => [entry.key, entry]));
  assert.ok(byChannel["Meta ads"], "the ad-driven WhatsApp sale counts as Meta ads");
  assert.ok(byChannel["Phone sales"], "plain phone sales get their own channel");
  assert.ok(report.campaigns.some((entry) => entry.key.includes("dec-sale")));
});

test("delivery sales accept a custom fee and skip the website-only checks", async () => {
  await h.integrationSettings.update("security", { values: { maxPendingOrdersPerPhone: 1 } });
  const manager = await h.signInAdmin("manager@test.co");
  const first = await manager.post("/api/admin/orders/manual", sale({
    status: "pending",
    fulfillment: "delivery",
    delivery: { county: "Turkana", town: "Lodwar", address: "Main St" },
    deliveryFee: 3500,
    customer: { name: "Far Away", phone: "0744 555 666" },
    items: [{ productId: "p1", quantity: 1 }],
  }));
  assert.equal(first.status, 201, first.text);
  assert.equal(first.json.data.deliveryFee, 3500);
  assert.equal(first.json.data.total, 13500);
  // The per-phone cap for anonymous checkouts does not block staff.
  const second = await manager.post("/api/admin/orders/manual", sale({ status: "pending", customer: { name: "Far Away", phone: "0744 555 666" }, items: [{ productId: "p1", quantity: 1 }] }));
  assert.equal(second.status, 201);
  await h.integrationSettings.update("security", { values: { maxPendingOrdersPerPhone: 0 } });
});

test("permissions: editors cannot record sales; marking paid needs payment rights", async () => {
  const editor = await h.signInAdmin("editor@test.co");
  assert.equal((await editor.post("/api/admin/orders/manual", sale())).status, 403);

  const owner = await h.signInAdmin("owner@test.co");
  await owner.post("/api/admin/roles", { name: "Sales Desk", rank: 30, permissions: ["orders.view", "orders.manage"] });
  await owner.post("/api/admin/admins", { name: "Desk Person", email: "salesdesk@test.co", password: "Counter-Staff-901", role: "sales-desk" });
  const desk = await h.signInAdmin("salesdesk@test.co", "Counter-Staff-901");
  const count = async () => (await h.db.query("SELECT COUNT(*)::int AS n FROM orders")).rows[0].n;
  const before = await count();
  const paid = await desk.post("/api/admin/orders/manual", sale({ paid: true }));
  assert.equal(paid.status, 403);
  assert.equal(await count(), before, "no order is left behind when the request is refused");
  assert.equal((await desk.post("/api/admin/orders/manual", sale())).status, 201);
});

test("bad input is rejected", async () => {
  const manager = await h.signInAdmin("manager@test.co");
  assert.equal((await manager.post("/api/admin/orders/manual", sale({ channel: "website" }))).status, 400);
  assert.equal((await manager.post("/api/admin/orders/manual", sale({ items: [] }))).status, 400);
  assert.equal((await manager.post("/api/admin/orders/manual", sale({ status: "cancelled" }))).status, 400);
  assert.equal((await manager.post("/api/admin/orders/manual", sale({ fulfillment: "delivery", deliveryFee: -5 }))).status, 400);
});

test("ad spend in another currency is converted to KES before ROAS is calculated", async () => {
  const usdInsights = (call) => {
    if (/level=account/.test(call.url)) return { body: { data: [{ spend: "10.00", impressions: "1000", clicks: "20", account_currency: "USD" }] } };
    if (/level=campaign/.test(call.url)) return { body: { data: [{ campaign_id: "1", campaign_name: "Launch", spend: "10.00", impressions: "1000", clicks: "20" }] } };
    return { body: {} };
  };
  h.setExternalHandler(usdInsights);
  await h.integrationSettings.update("meta", { values: { adAccountId: "act_123456789", marketingAccessToken: "EAAG-ads", adSpendExchangeRate: "" } });

  let result = await marketingService.report({});
  assert.equal(result.meta.insights.needsExchangeRate, true);
  assert.equal(result.meta.roas, null, "no ROAS when USD spend cannot be converted");

  await assert.rejects(h.integrationSettings.update("meta", { values: { adSpendExchangeRate: "12x5" } }));
  await h.integrationSettings.update("meta", { values: { adSpendExchangeRate: "130" } });
  result = await marketingService.report({});
  assert.equal(result.meta.spend, 1300, "USD 10 at 130 = KES 1,300");
  assert.equal(result.meta.insights.accountSpend, 10);
  assert.equal(result.meta.insights.campaigns[0].spend, 1300);
  assert.equal(result.meta.insights.accountCurrency, "USD");
  await h.integrationSettings.update("meta", { values: { adAccountId: "", adSpendExchangeRate: "" } });
});
