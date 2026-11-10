// Shared test harness: a real PostgreSQL test database, the real Express app on an
// ephemeral port, a cookie-aware HTTP client, and a fetch mock for external APIs
// (Meta Graph API, Safaricom Daraja). Requires TEST_DATABASE_URL.
process.env.NODE_ENV = "test";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "test-google-client.apps.googleusercontent.com";
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL (a disposable database — it is wiped by the tests).");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.PGSSL = "false";
process.env.CLIENT_ORIGIN = "http://localhost:5173";

const realFetch = globalThis.fetch;
const externalCalls = [];
let externalHandler = null;

// External hosts are answered by the test's handler; local requests go through.
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (/^https:\/\/(graph\.facebook\.com|sandbox\.safaricom\.co\.ke|api\.safaricom\.co\.ke)/.test(target)) {
    const call = { url: target, options, body: options.body ? safeJson(options.body) : null };
    externalCalls.push(call);
    const reply = externalHandler ? await externalHandler(call) : { status: 200, body: {} };
    return new Response(JSON.stringify(reply.body || {}), { status: reply.status || 200, headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, options);
};

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

const db = require("../src/db/postgres");
const { runMigrations } = require("../src/db/migrate");
const integrationSettings = require("../src/services/integrationSettingsService");
const rbac = require("../src/services/rbacService");
const limiter = require("../src/utils/rateLimiter");
const secretBox = require("../src/utils/secretBox");
const adminAuthService = require("../src/services/adminAuthService");

let server = null;
let baseUrl = "";

const resetDatabase = async () => {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await runMigrations({ log: () => {} });
  await db.query(`INSERT INTO categories (id, name) VALUES ('projectors', 'Projectors'), ('screens', 'Screens')`);
  await db.query(
    `INSERT INTO products (id, slug, name, category_id, price, currency, stock, description)
     VALUES ('p1', 'p1', 'Cinema Pro', 'projectors', 10000, 'KES', 100, 'Bright & sharp <projector>'),
            ('p2', 'p2', 'Mini Beam', 'projectors', 2500, 'KES', 2, 'Small one')`
  );
  await db.query(`INSERT INTO product_images (id, product_id, url, sort_order) VALUES ('i1', 'p1', 'https://res.cloudinary.com/demo/image/upload/p1.jpg', 0)`);
  integrationSettings.clearCache();
  // Per-IP order limits would make tests depend on each other; they are tested on their own.
  await integrationSettings.update("security", { values: { ordersPerHourPerIp: 0, maxPendingOrdersPerPhone: 0 } });
  rbac.clearCache();
  secretBox.resetCache();
  limiter.resetAll();
  externalCalls.length = 0;
  externalHandler = null;
};

const start = async () => {
  if (server) return baseUrl;
  await resetDatabase();
  const app = require("../src/app");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
};

const stop = async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  await db.pool.end();
};

// Minimal cookie-jar client.
const client = () => {
  const jar = {};
  const request = async (method, path, body, headers = {}) => {
    const response = await realFetch(baseUrl + path, {
      method,
      redirect: "manual",
      headers: {
        ...(body !== undefined && typeof body !== "string" ? { "Content-Type": "application/json" } : {}),
        Cookie: Object.entries(jar).map(([key, value]) => `${key}=${value}`).join("; "),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    (response.headers.getSetCookie ? response.headers.getSetCookie() : []).forEach((cookie) => {
      const [pair] = cookie.split(";");
      const index = pair.indexOf("=");
      const key = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value || /Expires=Thu, 01 Jan 1970/i.test(cookie)) delete jar[key];
      else jar[key] = value;
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text, json: safeJson(text) };
  };
  return {
    jar,
    get: (path, headers) => request("GET", path, undefined, headers),
    post: (path, body, headers) => request("POST", path, body === undefined ? {} : body, headers),
    patch: (path, body, headers) => request("PATCH", path, body, headers),
    del: (path, headers) => request("DELETE", path, undefined, headers),
  };
};

const createAdmin = async ({ email, password = "Strong-Passw0rd-1", role = "owner", name = "Test Admin" }) =>
  adminAuthService.createAdminUser({ email, password, name, role });

const signInAdmin = async (email, password = "Strong-Passw0rd-1") => {
  const http = client();
  const response = await http.post("/api/admin/auth/login", { email, password });
  if (response.status !== 200) throw new Error("admin login failed: " + response.text);
  return http;
};

const orderPayload = (overrides = {}) => ({
  customer: { name: "Jane Buyer", phone: "0712345678", email: "jane@example.com" },
  delivery: { county: "Nairobi", town: "CBD", address: "Moi Avenue" },
  items: [{ productId: "p1", quantity: 1 }],
  ...overrides,
});

module.exports = {
  client,
  createAdmin,
  db,
  externalCalls,
  integrationSettings,
  orderPayload,
  resetDatabase,
  setExternalHandler: (handler) => {
    externalHandler = handler;
  },
  signInAdmin,
  start,
  stop,
};
