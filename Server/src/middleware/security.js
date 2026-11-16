const crypto = require("crypto");
const env = require("../config/env");
const HttpError = require("../utils/httpError");
const integrationSettings = require("../services/integrationSettingsService");

const normalizeOrigin = (value) => {
  try {
    const url = new URL(String(value));
    return url.origin.toLowerCase();
  } catch (_error) {
    return "";
  }
};

const requestOrigin = (req) => normalizeOrigin(`${req.protocol}://${req.get("host")}`);

// Every origin the browser may legitimately call the API from.
const allowedOrigins = async (req) => {
  const [security, site] = await Promise.all([
    integrationSettings.getConfig("security"),
    integrationSettings.getConfig("site"),
  ]);
  const origins = new Set(
    [...env.clientOrigins, ...(security.allowedOrigins || []), site.publicBaseUrl]
      .map(normalizeOrigin)
      .filter(Boolean)
  );
  if (req) origins.add(requestOrigin(req));
  return origins;
};

// ---- Security headers & Content Security Policy --------------------------------
const BASE_SOURCES = {
  script: ["https://connect.facebook.net", "https://accounts.google.com/gsi/client"],
  style: ["https://accounts.google.com/gsi/style"],
  connect: ["https://www.facebook.com", "https://*.facebook.com", "https://connect.facebook.net", "https://accounts.google.com"],
  frame: ["https://accounts.google.com", "https://www.facebook.com", "https://*.facebook.com"],
  form: ["https://www.facebook.com"],
};

const buildCsp = (nonce, extra = []) => {
  const extras = extra.map(normalizeOrigin).filter(Boolean);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' ${[...BASE_SOURCES.script, ...extras].join(" ")}`,
    `style-src 'self' 'unsafe-inline' ${BASE_SOURCES.style.join(" ")}`,
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data: https:",
    // Meta's Pixel also reports to Conversions API Gateway hosts that Meta assigns per
    // pixel (e.g. *.on.aws, *.run.app), so outgoing HTTPS connections are allowed. The
    // nonce-locked script-src is what stops injected code from running in the first place.
    `connect-src 'self' https: ${[...BASE_SOURCES.connect, ...extras].join(" ")}`,
    `frame-src ${[...BASE_SOURCES.frame, ...extras].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    // Meta's Pixel posts larger events (AddToCart, Purchase with contents) through a
    // hidden form to facebook.com/tr; blocking that silently drops those events.
    `form-action 'self' ${BASE_SOURCES.form.join(" ")}`,
    "frame-ancestors 'none'",
  ];
  if (env.isProduction) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
};

const securityHeaders = async (req, res, next) => {
  try {
    const nonce = crypto.randomBytes(16).toString("base64");
    res.locals.cspNonce = nonce;

    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
    // Google sign-in opens a popup that must be able to message this window.
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (env.isProduction) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    const security = await integrationSettings.getConfig("security");
    const mode = security.cspMode || "enforce";
    if (mode !== "off") {
      const header = mode === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";
      res.setHeader(header, buildCsp(nonce, security.cspExtraSources || []));
    }
    next();
  } catch (error) {
    next(error);
  }
};

// ---- CORS ---------------------------------------------------------------------
const cors = async (req, res, next) => {
  try {
    const origin = req.get("origin");
    if (origin) {
      const allowed = await allowedOrigins(req);
      if (allowed.has(normalizeOrigin(origin))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
        if (req.method === "OPTIONS") {
          res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "Content-Type");
          res.setHeader("Access-Control-Max-Age", "600");
          return res.status(204).end();
        }
      }
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

// ---- CSRF: reject state-changing requests sent from other websites ------------
// Browsers always attach Origin (or at least Referer) to cross-site POSTs, so a
// request carrying a foreign origin is refused. Server-to-server callers (Meta
// webhooks, Safaricom callbacks) send neither header and are exempted by path too.
const CSRF_EXEMPT = [/^\/api\/webhooks\//, /^\/api\/payments\/mpesa\/callback\//];

const csrfProtection = async (req, _res, next) => {
  try {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (CSRF_EXEMPT.some((pattern) => pattern.test(req.path))) return next();

    const source = req.get("origin") || req.get("referer");
    if (!source) return next();

    const allowed = await allowedOrigins(req);
    if (!allowed.has(normalizeOrigin(source))) {
      return next(new HttpError(403, "This request came from a website that is not allowed to change data here."));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { allowedOrigins, buildCsp, cors, csrfProtection, normalizeOrigin, securityHeaders };
