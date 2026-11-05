const express = require("express");
const path = require("path");
const cors = require("cors");
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
const adminAuthService = require("./services/adminAuthService");
const { adminSessionCookieName } = require("./middleware/adminAuth");
const { getCookie } = require("./utils/cookies");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

const app = express();
const clientPath = path.join(__dirname, "../../Client");

// Render terminates the public connection at a proxy. Trust that proxy so
// req.ip contains the visitor's address for the AI rate limiter.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

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

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

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
};
const adminPageNames = new Set([
  "admin",
  "admin-dashboard",
  "admin-products",
  "admin-orders",
  "admin-customers",
  "admin-testimonials",
  "admin-team",
  "admin-settings",
  "admin-promotions",
]);

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
  const handler = (req, res) => res.sendFile(path.join(clientPath, fileName));
  if (adminPageNames.has(pageName)) app.get("/" + pageName, adminPageGuard, handler);
  else if (pageName !== "index") app.get("/" + pageName, handler);
});

app.get("/:page.html", (req, res, next) => {
  const pageName = req.params.page;
  if (!Object.prototype.hasOwnProperty.call(pageFiles, pageName)) return next();
  const cleanPath = pageName === "index" ? "/" : "/" + pageName;
  return res.redirect(301, cleanPath + (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""));
});

app.use(express.static(clientPath));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
