const express = require("express");
const path = require("path");
const morgan = require("morgan");
const env = require("./config/env");
const healthRoutes = require("./routes/healthRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const aiRoutes = require("./routes/aiRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const promotionRoutes = require("./routes/promotionRoutes");
const marketingRoutes = require("./routes/marketingRoutes");
const webhookRoutes = require("./routes/webhookRoutes");
const marketingController = require("./controllers/marketingController");
const adminAuthService = require("./services/adminAuthService");
const pageRenderer = require("./services/pageRenderer");
const orderHooks = require("./services/orderHooks");
const asyncHandler = require("./utils/asyncHandler");
const { adminSessionCookieName } = require("./middleware/adminAuth");
const { attachCustomerIfPresent } = require("./middleware/customerAuth");
const { cors, csrfProtection, securityHeaders } = require("./middleware/security");
const { getCookie } = require("./utils/cookies");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

orderHooks.register();

const app = express();
const clientPath = path.join(__dirname, "../../Client");

// Render (and Cloudflare in front of it) terminate TLS at a proxy. Trust exactly one
// hop so req.ip is the visitor's address for rate limiting.
app.set("trust proxy", Number.isInteger(env.trustProxy) ? env.trustProxy : 1);
app.disable("x-powered-by");

// Never write secrets that travel in URLs (verification tokens, feed keys) to logs.
morgan.token("safe-url", (req) => String(req.originalUrl || req.url).replace(/([?&](?:token|key|hub\.verify_token|access_token)=)[^&]*/gi, "$1[redacted]").replace(/(\/callback\/)[^/?]+/, "$1[redacted]"));
const logFormat = env.nodeEnv === "production"
  ? ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"'
  : ":method :safe-url :status :response-time ms - :res[content-length]";
if (!env.isTest) app.use(morgan(logFormat));

app.use(securityHeaders);
app.use("/api", cors);

// Webhooks need the raw request body (signature checks), so they are mounted before
// the JSON parser.
app.use("/api", webhookRoutes);

app.use(express.json({ limit: "1mb" }));
app.use("/api", csrfProtection);

app.use("/api/health", healthRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/promotions", promotionRoutes);
app.use("/api/marketing", marketingRoutes);
app.use("/api", notFound);

// ---- Feeds, SEO and policy pages ----------------------------------------------------
app.get("/feeds/meta-catalog.xml", marketingController.catalogFeed("xml"));
app.get("/feeds/meta-catalog.csv", marketingController.catalogFeed("csv"));
app.get("/robots.txt", asyncHandler(async (req, res) => res.type("text/plain").send(await pageRenderer.robotsTxt(req))));
app.get(
  "/sitemap.xml",
  asyncHandler(async (req, res) => {
    const seo = await require("./services/integrationSettingsService").getConfig("seo");
    if (!seo.sitemapEnabled) return res.status(404).type("text/plain").send("Not found");
    return res.type("application/xml").send(await pageRenderer.sitemapXml(req));
  })
);
Object.keys(pageRenderer.POLICIES).forEach((kind) => {
  app.get("/" + kind, asyncHandler(async (req, res) => pageRenderer.renderPolicy(req, res, kind)));
});

app.use("/uploads", express.static(path.join(__dirname, "../uploads"), { dotfiles: "ignore" }));

// ---- HTML pages -----------------------------------------------------------------------
const pageFiles = {
  index: "index.html",
  login: "login.html",
  signup: "signup.html",
  account: "account.html",
  cart: "cart.html",
  product: "product.html",
  "find-your-setup": "find-your-setup.html",
  admin: "admin-dashboard.html",
  "admin-dashboard": "admin-dashboard.html",
  "admin-products": "admin-products.html",
  "admin-orders": "admin-orders.html",
  "admin-customers": "admin-customers.html",
  "admin-testimonials": "admin-testimonials.html",
  "admin-team": "admin-team.html",
  "admin-settings": "admin-settings.html",
  "admin-promotions": "admin-promotions.html",
  "admin-integrations": "admin-integrations.html",
  "admin-marketing": "admin-marketing.html",
  "admin-access": "admin-access.html",
};
const isAdminPage = (pageName) => pageName === "admin" || pageName.startsWith("admin-");

const adminPageGuard = async (req, res, next) => {
  try {
    const admin = await adminAuthService.getAdminBySessionToken(getCookie(req, adminSessionCookieName));
    if (!admin) {
      const nextPath = req.originalUrl || "/admin";
      return res.redirect("/login?next=" + encodeURIComponent(nextPath));
    }
    req.admin = admin;
    return next();
  } catch (error) {
    return next(error);
  }
};

Object.entries(pageFiles).forEach(([pageName, fileName]) => {
  const routePath = pageName === "index" ? "/" : "/" + pageName;
  if (isAdminPage(pageName)) {
    app.get(routePath, adminPageGuard, asyncHandler((req, res) => pageRenderer.renderPage(req, res, fileName, { admin: true })));
  } else {
    app.get(routePath, attachCustomerIfPresent, asyncHandler((req, res) => pageRenderer.renderPage(req, res, fileName)));
  }
});

app.get("/:page.html", (req, res, next) => {
  const pageName = req.params.page;
  if (!Object.prototype.hasOwnProperty.call(pageFiles, pageName)) return next();
  const cleanPath = pageName === "index" ? "/" : "/" + pageName;
  return res.redirect(301, cleanPath + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
});

// HTML is only ever served through the routes above (so it always gets nonces and the
// admin guard); raw .html files are never served statically.
app.use((req, res, next) => (/\.html?$/i.test(req.path) ? notFound(req, res, next) : next()));
app.use(express.static(clientPath, { index: false, dotfiles: "ignore" }));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
