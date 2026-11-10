const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const orderService = require("../src/services/orderService");

test.before(h.start);
test.after(h.stop);

const stockOf = async (id) => (await h.db.query("SELECT stock FROM products WHERE id = $1", [id])).rows[0].stock;

test("pickup orders are not charged a delivery fee", async () => {
  const response = await h.client().post("/api/orders", h.orderPayload({ fulfillment: "pickup", customer: { name: "Pick Up", phone: "0711111111" } }));
  assert.equal(response.status, 201);
  assert.equal(response.json.data.deliveryFee, 0);
  assert.equal(response.json.data.fulfillment, "pickup");
  assert.equal(response.json.data.total, 10000);
  assert.match(response.json.data.tracking.purchaseEventId, /^purchase_/);
  assert.equal(response.json.data.attribution, undefined, "internal attribution is not exposed to customers");
});

test("legacy pickup marker in notes is still honoured", async () => {
  const response = await h.client().post("/api/orders", h.orderPayload({ notes: "Pickup requested at Vibecraft location.", customer: { name: "Old Client", phone: "0711111112" } }));
  assert.equal(response.status, 201);
  assert.equal(response.json.data.deliveryFee, 0);
});

test("invalid quantities and oversized fields are rejected", async () => {
  const http = h.client();
  for (const quantity of [0, -1, 1.5, "abc"]) {
    const response = await http.post("/api/orders", h.orderPayload({ items: [{ productId: "p1", quantity }], customer: { name: "Q", phone: "0711111113" } }));
    assert.equal(response.status, 400, `quantity ${quantity}`);
  }
  const long = await http.post("/api/orders", h.orderPayload({ notes: "x".repeat(5000), customer: { name: "Long", phone: "0711111114" } }));
  assert.equal(long.status, 400);
  const badProduct = await http.post("/api/orders", h.orderPayload({ items: [{ productId: { $ne: 1 } }], customer: { name: "Obj", phone: "0711111115" } }));
  assert.equal(badProduct.status, 400);
});

test("one phone number cannot hold more than the allowed unconfirmed orders", async () => {
  await h.integrationSettings.update("security", { values: { maxPendingOrdersPerPhone: 2, ordersPerHourPerIp: 0 } });
  const http = h.client();
  const payload = h.orderPayload({ customer: { name: "Spammer", phone: "+254 799 000 001" }, items: [{ productId: "p2", quantity: 1 }] });
  assert.equal((await http.post("/api/orders", payload)).status, 201);
  assert.equal((await http.post("/api/orders", { ...payload, customer: { name: "Spammer", phone: "0799000001" } })).status, 201);
  const third = await http.post("/api/orders", payload);
  assert.equal(third.status, 429);
  assert.equal(await stockOf("p2"), 0);
});

test("stale unpaid orders expire, returning stock and promo uses", async () => {
  await h.db.query(`INSERT INTO promotions (id, code, discount_type, discount_value, usage_limit) VALUES ('promo1', 'LAUNCH', 'fixed', 500, 1)`);
  await h.integrationSettings.update("security", { values: { maxPendingOrdersPerPhone: 0, pendingOrderExpiryHours: 24 } });
  const http = h.client();
  const before = await stockOf("p1");
  const order = await http.post("/api/orders", h.orderPayload({ promotionCode: "launch", customer: { name: "Promo User", phone: "0722000001" } }));
  assert.equal(order.status, 201);
  assert.equal(order.json.data.discountAmount, 500);
  // The single-use code is now used up.
  const second = await http.post("/api/orders", h.orderPayload({ promotionCode: "LAUNCH", customer: { name: "Second", phone: "0722000002" } }));
  assert.equal(second.status, 400);

  await h.db.query("UPDATE orders SET created_at = NOW() - INTERVAL '25 hours' WHERE id = $1", [order.json.data.id]);
  const result = await orderService.expireStalePendingOrders();
  assert.ok(result.expired >= 1);
  const expired = await orderService.getOrderById(order.json.data.id);
  assert.equal(expired.status, "cancelled");
  assert.match(expired.cancelReason, /Automatically cancelled/);
  assert.equal(await stockOf("p1"), before);
  const promo = (await h.db.query("SELECT used_count FROM promotions WHERE code = 'LAUNCH'")).rows[0];
  assert.equal(promo.used_count, 0, "the promo use was released");
});

test("paid or confirmed orders never expire", async () => {
  const http = h.client();
  const paid = await http.post("/api/orders", h.orderPayload({ customer: { name: "Payer", phone: "0733000001" } }));
  const confirmed = await http.post("/api/orders", h.orderPayload({ customer: { name: "Confirmed", phone: "0733000002" } }));
  await h.db.query("UPDATE orders SET payment_verified = TRUE WHERE id = $1", [paid.json.data.id]);
  await h.db.query("UPDATE orders SET status = 'confirmed' WHERE id = $1", [confirmed.json.data.id]);
  await h.db.query("UPDATE orders SET created_at = NOW() - INTERVAL '100 hours' WHERE id IN ($1, $2)", [paid.json.data.id, confirmed.json.data.id]);
  await orderService.expireStalePendingOrders();
  assert.equal((await orderService.getOrderById(paid.json.data.id)).status, "pending");
  assert.equal((await orderService.getOrderById(confirmed.json.data.id)).status, "confirmed");
});

test("guest orders only appear in an account after its email is verified", async () => {
  const guest = h.client();
  await guest.post("/api/orders", h.orderPayload({ customer: { name: "Victim", phone: "0744000001", email: "victim@example.com" } }));

  const attacker = h.client();
  const signup = await attacker.post("/api/auth/signup", { name: "Attacker", email: "victim@example.com", password: "Attacker-Pass-123" });
  assert.equal(signup.status, 201);
  assert.equal(signup.json.data.user.emailVerified, false);
  const mine = await attacker.get("/api/orders/mine");
  assert.equal(mine.status, 200);
  assert.equal(mine.json.data.length, 0, "unverified accounts cannot read guest orders");

  await h.db.query("UPDATE customer_accounts SET email_verified = TRUE WHERE email = 'victim@example.com'");
  const verified = await attacker.get("/api/orders/mine");
  assert.equal(verified.json.data.length, 1);
});

test("email verification links work once", async () => {
  const customerAuthService = require("../src/services/customerAuthService");
  const http = h.client();
  const signup = await http.post("/api/auth/signup", { name: "Verify Me", email: "verify@example.com", password: "Confirm-Inbox-123" });
  const token = await customerAuthService.createEmailVerificationToken(signup.json.data.user.id);
  const first = await http.get("/api/auth/verify-email?token=" + encodeURIComponent(token));
  assert.equal(first.status, 302);
  assert.equal(first.headers.get("location"), "/account?emailVerified=1");
  const reuse = await http.get("/api/auth/verify-email?token=" + encodeURIComponent(token));
  assert.equal(reuse.headers.get("location"), "/account?emailVerified=0");
  assert.equal((await http.get("/api/auth/me")).json.data.emailVerified, true);
});

test("Google sign-in takes over an unverified account and evicts the squatter", async () => {
  const { OAuth2Client } = require("google-auth-library");
  const original = OAuth2Client.prototype.verifyIdToken;
  OAuth2Client.prototype.verifyIdToken = async () => ({
    getPayload: () => ({ sub: "google-sub-1", email: "owner.real@example.com", email_verified: true, name: "Real Owner" }),
  });
  try {
    const squatter = h.client();
    await squatter.post("/api/auth/signup", { name: "Squatter", email: "owner.real@example.com", password: "Squatter-Pass-123" });
    assert.equal((await squatter.get("/api/auth/me")).status, 200);

    const owner = h.client();
    const google = await owner.post("/api/auth/google", { idToken: "fake-token" });
    assert.equal(google.status, 200);
    assert.equal(google.json.data.user.emailVerified, true);
    assert.equal(google.json.data.user.hasPassword, false, "the squatter's password was removed");

    assert.equal((await squatter.get("/api/auth/me")).status, 401, "the squatter's session was revoked");
    const relogin = await h.client().post("/api/auth/login", { email: "owner.real@example.com", password: "Squatter-Pass-123" });
    assert.equal(relogin.status, 401);
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
  }
});

test("cancelling releases stock and promo; reactivating reserves them again", async () => {
  await h.db.query(`INSERT INTO promotions (id, code, discount_type, discount_value) VALUES ('promo2', 'AGAIN', 'percent', 10)`);
  await h.createAdmin({ email: "ops@test.co", role: "manager" });
  const ops = await h.signInAdmin("ops@test.co");
  const before = await stockOf("p1");
  const order = await h.client().post("/api/orders", h.orderPayload({ promotionCode: "AGAIN", customer: { name: "Cancel Me", phone: "0755000001" } }));
  assert.equal(await stockOf("p1"), before - 1);

  assert.equal((await ops.patch(`/api/admin/orders/${order.json.data.id}/status`, { status: "cancelled" })).status, 200);
  assert.equal(await stockOf("p1"), before);
  assert.equal((await h.db.query("SELECT used_count FROM promotions WHERE code = 'AGAIN'")).rows[0].used_count, 0);

  assert.equal((await ops.patch(`/api/admin/orders/${order.json.data.id}/status`, { status: "confirmed" })).status, 200);
  assert.equal(await stockOf("p1"), before - 1);
  assert.equal((await h.db.query("SELECT used_count FROM promotions WHERE code = 'AGAIN'")).rows[0].used_count, 1);
});
