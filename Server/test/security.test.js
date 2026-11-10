const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers");

test.before(h.start);
test.after(h.stop);

test("pages carry security headers and a nonce on every script", async () => {
  const home = await h.client().get("/");
  assert.equal(home.status, 200);
  assert.equal(home.headers.get("x-content-type-options"), "nosniff");
  assert.equal(home.headers.get("x-frame-options"), "DENY");
  assert.equal(home.headers.get("x-powered-by"), null);
  const csp = home.headers.get("content-security-policy");
  const nonce = csp.match(/'nonce-([^']+)'/)[1];
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
  const scripts = home.text.match(/<script[^>]*>/g);
  assert.ok(scripts.length > 3);
  assert.ok(scripts.every((tag) => tag.includes(`nonce="${nonce}"`)));
  assert.ok(!home.text.includes("fbq('init'"), "no hard-coded Pixel");
});

test("CSP mode can be switched from the admin settings", async () => {
  await h.integrationSettings.update("security", { values: { cspMode: "report-only" } });
  const page = await h.client().get("/");
  assert.ok(page.headers.get("content-security-policy-report-only"));
  assert.equal(page.headers.get("content-security-policy"), null);
  await h.integrationSettings.update("security", { values: { cspMode: "enforce" } });
});

test("tracking config comes from settings, with excluded pages", async () => {
  const home = await h.client().get("/");
  assert.match(home.text, /window\.VIBECRAFT_TRACKING=\{"pixelId":"27209025962115778"/);
  const login = await h.client().get("/login");
  assert.match(login.text, /"pixelId":null/);
  await h.integrationSettings.update("meta", { values: { pixelEnabled: false } });
  assert.match((await h.client().get("/")).text, /"pixelId":null/);
  await h.integrationSettings.update("meta", { values: { pixelEnabled: true, domainVerificationCode: "abc123verify" } });
  assert.match((await h.client().get("/")).text, /facebook-domain-verification" content="abc123verify"/);
});

test("injected JSON cannot break out of its script tag", async () => {
  await h.integrationSettings.update("consent", { values: { message: "</script><script>alert(1)</script>" } });
  const home = await h.client().get("/");
  assert.ok(!home.text.includes("</script><script>alert(1)"));
  assert.ok(home.text.includes("\\u003c/script\\u003e"));
});

test("cross-site requests that change data are refused", async () => {
  const http = h.client();
  const evil = await http.post("/api/auth/login", { email: "a@b.co", password: "x" }, { Origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  const evilReferer = await http.post("/api/orders", h.orderPayload(), { Referer: "https://evil.example/page" });
  assert.equal(evilReferer.status, 403);
  const same = await http.post("/api/auth/login", { email: "a@b.co", password: "x" }, { Origin: "http://localhost:5173" });
  assert.equal(same.status, 401);
  const cors = await http.get("/api/settings", { Origin: "https://evil.example" });
  assert.equal(cors.headers.get("access-control-allow-origin"), null);
});

test("errors never leak internals", async () => {
  const http = h.client();
  const badJson = await http.post("/api/orders", "{not json", { "Content-Type": "application/json" });
  assert.equal(badJson.status, 400);
  assert.ok(!badJson.text.includes("stack"));
  const unknown = await http.get("/api/nope");
  assert.equal(unknown.status, 404);
});

test("raw HTML files and admin pages are protected", async () => {
  const http = h.client();
  const adminPage = await http.get("/admin-integrations");
  assert.equal(adminPage.status, 302);
  assert.match(adminPage.headers.get("location"), /^\/login\?next=/);
  assert.equal((await http.get("/admin-integrations.html")).status, 301);
  assert.equal((await http.get("/Admin-Team.HTML")).status, 404);
});

test("policy pages, robots and sitemap are published", async () => {
  const http = h.client();
  const privacy = await http.get("/privacy");
  assert.equal(privacy.status, 200);
  assert.match(privacy.text, /Data Protection Act/);
  await h.integrationSettings.update("legal", { values: { privacyPolicy: "# Custom\nOur <b>own</b> policy." } });
  const custom = await http.get("/privacy");
  assert.match(custom.text, /<h2>Custom<\/h2>/);
  assert.match(custom.text, /&lt;b&gt;own&lt;\/b&gt;/);
  assert.match((await http.get("/robots.txt")).text, /Disallow: \/admin/);
  assert.match((await http.get("/sitemap.xml")).text, /product\?id=p1/);
});

test("the promo code endpoint is rate limited", async () => {
  await h.integrationSettings.update("security", { values: { promoChecksPer10Min: 3 } });
  const http = h.client();
  let last;
  for (let i = 0; i < 4; i += 1) last = await http.post("/api/promotions/validate", { code: "GUESS" + i, subtotal: 1000 });
  assert.equal(last.status, 429);
});
