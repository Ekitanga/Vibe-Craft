const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

const EMAIL = "pathowner@example.com";
const PASSWORD = "Strong-Passw0rd-1";
const SLUG = "staff-entry-7k2q";

test.before(async () => {
  await h.start();
  await h.createAdmin({ email: EMAIL });
});
test.after(async () => {
  await h.integrationSettings.update("security", { values: { adminLoginPath: "" } });
  await h.stop();
});

test("without a private address, admins use /login as before", async () => {
  const page = await h.client().get("/admin");
  assert.equal(page.status, 302);
  assert.match(page.headers.get("location"), /^\/login\?next=/);
  const login = await h.client().post("/api/auth/login", { email: EMAIL, password: PASSWORD });
  assert.equal(login.status, 200);
  assert.ok(login.json.data.admin);
});

test("invalid or reserved addresses are refused by the settings form", async () => {
  await assert.rejects(h.integrationSettings.update("security", { values: { adminLoginPath: "short" } }));
  await assert.rejects(h.integrationSettings.update("security", { values: { adminLoginPath: "Has Spaces!" } }));
});

test("with a private address, the admin area is hidden and only that page signs admins in", async () => {
  await h.integrationSettings.update("security", { values: { adminLoginPath: SLUG } });

  // Admin pages do not exist for visitors.
  assert.equal((await h.client().get("/admin")).status, 404);
  assert.equal((await h.client().get("/admin-orders")).status, 404);

  // The public sign-in no longer accepts admin credentials.
  const shared = await h.client().post("/api/auth/login", { email: EMAIL, password: PASSWORD });
  assert.equal(shared.status, 401);

  // The admin API looks absent without the address.
  const bare = await h.client().post("/api/admin/auth/login", { email: EMAIL, password: PASSWORD });
  assert.equal(bare.status, 404);
  const wrong = await h.client().post("/api/admin/auth/login", { email: EMAIL, password: PASSWORD, loginPath: "/staff-entry-wrong" });
  assert.equal(wrong.status, 404);

  // The private page renders the sign-in form in admin mode, never indexed.
  const page = await h.client().get("/" + SLUG);
  assert.equal(page.status, 200);
  assert.match(page.text, /window\.VIBECRAFT_ADMIN_LOGIN=\{"loginPage":true,"path":"\/staff-entry-7k2q"\}/);
  assert.match(page.text, /noindex/);
  assert.ok(!page.text.includes("VIBECRAFT_TRACKING"), "no ad tracking on the admin sign-in");

  // Signing in from it works, and admin pages then know where to send a signed-out admin.
  const http = h.client();
  const login = await http.post("/api/admin/auth/login", { email: EMAIL, password: PASSWORD, loginPath: "/" + SLUG });
  assert.equal(login.status, 200);
  const dashboard = await http.get("/admin");
  assert.equal(dashboard.status, 200);
  assert.match(dashboard.text, /window\.VIBECRAFT_ADMIN_LOGIN=\{"path":"\/staff-entry-7k2q"\}/);

  // Customers still sign in at /login.
  assert.equal((await h.client().get("/login")).status, 200);
});
