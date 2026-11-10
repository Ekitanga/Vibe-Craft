const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");
const adminAuthService = require("../src/services/adminAuthService");
const env = require("../src/config/env");

test.before(async () => {
  await h.start();
  await h.createAdmin({ email: "owner@test.co", role: "owner" });
});
test.after(h.stop);

test("bootstrap never overwrites an existing admin's password or role", async () => {
  env.adminEmail = "owner@test.co";
  env.adminPassword = "password";
  const created = await adminAuthService.ensureBootstrapOwner({ log: () => {} });
  assert.equal(created, null);
  const owner = await h.signInAdmin("owner@test.co");
  const me = await owner.get("/api/admin/auth/me");
  assert.equal(me.json.data.role, "owner");
  env.adminEmail = "";
  env.adminPassword = "";
});

test("a weak password signs in but is locked to the change-password screen", async () => {
  await h.db.query("UPDATE admin_users SET role = 'owner' WHERE email = 'owner@test.co'");
  // Simulate a legacy account whose password is literally "password".
  const { hashPassword } = require("../src/utils/authSecurity");
  const legacy = await hashPassword("password");
  await h.db.query(
    `INSERT INTO admin_users (id, email, password_hash, password_salt, name, role) VALUES ('legacy', 'legacy@test.co', $1, $2, 'Legacy', 'admin')`,
    [legacy.hash, legacy.salt]
  );
  const http = h.client();
  const login = await http.post("/api/auth/login", { email: "legacy@test.co", password: "password" });
  assert.equal(login.status, 200);
  assert.equal(login.json.data.admin.mustChangePassword, true);

  const blocked = await http.get("/api/admin/products");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.json.code, "PASSWORD_CHANGE_REQUIRED");

  const common = await http.post("/api/admin/auth/change-password", { currentPassword: "password", newPassword: "password123" });
  assert.equal(common.status, 400);

  const changed = await http.post("/api/admin/auth/change-password", { currentPassword: "password", newPassword: "Much-Better-Pass-77" });
  assert.equal(changed.status, 200);
  assert.equal((await http.get("/api/admin/products")).status, 200);
});

test("changing a password signs out other sessions but keeps the current one", async () => {
  await h.createAdmin({ email: "multi@test.co", role: "manager" });
  const deviceA = await h.signInAdmin("multi@test.co");
  const deviceB = await h.signInAdmin("multi@test.co");
  const response = await deviceA.post("/api/admin/auth/change-password", { currentPassword: "Strong-Passw0rd-1", newPassword: "Another-Strong-Pass-2" });
  assert.equal(response.status, 200);
  assert.equal((await deviceA.get("/api/admin/auth/me")).status, 200);
  assert.equal((await deviceB.get("/api/admin/auth/me")).status, 401);
});

test("repeated wrong passwords lock the account, even for the right password", async () => {
  await h.createAdmin({ email: "target@test.co", role: "editor" });
  const http = h.client();
  let last;
  for (let i = 0; i < 9; i += 1) last = await http.post("/api/auth/login", { email: "target@test.co", password: "guess-" + i });
  assert.equal(last.status, 429);
  const real = await http.post("/api/auth/login", { email: "target@test.co", password: "Strong-Passw0rd-1" });
  assert.equal(real.status, 429);
});

test("permissions are enforced per route", async () => {
  await h.createAdmin({ email: "editor@test.co", role: "editor" });
  const editor = await h.signInAdmin("editor@test.co");
  assert.equal((await editor.get("/api/admin/products")).status, 200);
  assert.equal((await editor.get("/api/admin/customers")).status, 403);
  assert.equal((await editor.get("/api/admin/integrations")).status, 403);
  assert.equal((await editor.get("/api/admin/settings")).status, 403);
  assert.equal((await editor.patch("/api/admin/orders/x/payment", { verified: true })).status, 403);
  assert.equal((await editor.post("/api/admin/admins", { name: "Evil", email: "e@x.co", password: "Some-Strong-Pass-1", role: "owner" })).status, 403);

  // Dashboard-only roles get orders without customer details.
  await h.client().post("/api/orders", h.orderPayload({ customer: { name: "Private Person", phone: "0700000001" } }));
  const orders = await editor.get("/api/admin/orders");
  assert.equal(orders.status, 200);
  assert.ok(orders.json.data.length >= 1);
  assert.ok(orders.json.data.every((order) => order.customer.name === "Customer" && !order.customer.phone));
});

test("the old unguarded promotion routes are gone", async () => {
  const editor = await h.signInAdmin("editor@test.co");
  assert.equal((await editor.post("/api/promotions", { code: "FREE100", discountType: "percent", discountValue: 100 })).status, 404);
  assert.equal((await editor.post("/api/admin/promotions", { code: "FREE100", discountType: "percent", discountValue: 100 })).status, 403);
});

test("admins cannot escalate: rank and permission ceilings", async () => {
  await h.createAdmin({ email: "admin2@test.co", role: "admin" });
  const admin = await h.signInAdmin("admin2@test.co");

  // An admin (rank 80) may not create owners or other admins.
  const ownerInvite = await admin.post("/api/admin/admins", { name: "New Owner", email: "o2@test.co", password: "Owner-Strong-Pass-1", role: "owner" });
  assert.equal(ownerInvite.status, 403);
  const peerInvite = await admin.post("/api/admin/admins", { name: "Peer Admin", email: "a3@test.co", password: "Admin-Strong-Pass-1", role: "admin" });
  assert.equal(peerInvite.status, 403);
  const managerInvite = await admin.post("/api/admin/admins", { name: "Shop Manager", email: "m2@test.co", password: "Shop-Strong-Pass-1", role: "manager" });
  assert.equal(managerInvite.status, 201);

  // Admins lack roles.manage, so they cannot edit role definitions.
  assert.equal((await admin.patch("/api/admin/roles/editor", { permissions: ["customers.view"] })).status, 403);

  // An admin cannot touch the owner account.
  const owners = (await admin.get("/api/admin/admins")).json.data.filter((item) => item.role === "owner");
  assert.equal((await admin.patch("/api/admin/admins/" + owners[0].id, { isActive: false })).status, 403);
});

test("owners manage roles; the owner role and last owner are protected", async () => {
  const owner = await h.signInAdmin("owner@test.co");
  const created = await owner.post("/api/admin/roles", { name: "Support Desk", rank: 30, permissions: ["orders.view", "customers.view"] });
  assert.equal(created.status, 201);
  assert.deepEqual(created.json.data.permissions.sort(), ["customers.view", "orders.view"]);

  assert.equal((await owner.patch("/api/admin/roles/owner", { permissions: [] })).status, 400);
  assert.equal((await owner.del("/api/admin/roles/editor")).status, 400);

  const me = (await owner.get("/api/admin/auth/me")).json.data;
  assert.equal((await owner.patch("/api/admin/admins/" + me.id, { role: "editor" })).status, 400);
  assert.equal((await owner.del("/api/admin/admins/" + me.id)).status, 400);

  // Assign the custom role and check it takes effect.
  const invited = await owner.post("/api/admin/admins", { name: "Desk Agent", email: "desk@test.co", password: "Queue-Handler-555", role: "support-desk" });
  assert.equal(invited.status, 201);
  const desk = await h.signInAdmin("desk@test.co", "Queue-Handler-555");
  assert.equal((await desk.get("/api/admin/customers")).status, 200);
  assert.equal((await desk.get("/api/admin/products")).status, 403);

  // Disabling an admin ends their sessions immediately.
  assert.equal((await owner.patch("/api/admin/admins/" + invited.json.data.id, { isActive: false })).status, 200);
  assert.equal((await desk.get("/api/admin/customers")).status, 401);
});
