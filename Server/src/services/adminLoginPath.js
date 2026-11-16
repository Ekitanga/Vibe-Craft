// The optional private address where admins sign in (e.g. /staff-entry-7k2q).
//
// When it is set, the public /login page signs in customers only, the admin sign-in API
// only answers requests that carry the address, and admin pages return "not found" to
// visitors without an admin session — so the admin area cannot be found by guessing.
// ADMIN_LOGIN_PATH in the environment overrides the admin setting (recovery if forgotten).
const env = require("../config/env");
const integrationSettings = require("./integrationSettingsService");

const VALID = /^[a-z0-9][a-z0-9-]{3,63}$/;
// Never shadow a real page, API or asset route.
const RESERVED = /^(admin|login|signup|account|cart|product|find-your-setup|privacy|terms|refunds|api|feeds|uploads|assets|robots|sitemap|webhooks?)(-|$)/;

const normalize = (value) => {
  const slug = String(value || "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  return VALID.test(slug) && !RESERVED.test(slug) ? slug : "";
};

// Returns the slug without a leading slash, or "" when admins use /login.
const get = async () => {
  const fromEnv = normalize(env.adminLoginPath);
  if (fromEnv) return fromEnv;
  try {
    const config = await integrationSettings.getConfig("security");
    return normalize(config.adminLoginPath);
  } catch (_error) {
    return "";
  }
};

module.exports = { get, normalize };
