// Brute-force protection for every password sign-in path (shared login, admin login,
// password change). Limits come from Admin → Integrations → Security.
const limiter = require("../utils/rateLimiter");
const integrationSettings = require("./integrationSettingsService");
const { normalizeEmail } = require("../utils/authSecurity");

const rules = async () => {
  const config = await integrationSettings.getConfig("security");
  const windowMs = Number(config.loginWindowMinutes || 15) * 60 * 1000;
  return {
    perAccount: { limit: Number(config.loginAttempts || 0), windowMs },
    perIp: { limit: Number(config.loginAttemptsPerIp || 0), windowMs },
  };
};

const accountKey = (email) => "login-fail:" + normalizeEmail(email);
const ipKey = (ip) => "login-ip:" + (ip || "unknown");

const minutesLeft = (resetAt) => Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));

// Call before checking a password. Throws 429 when the account or IP is locked out.
const assertAllowed = async ({ email, ip }) => {
  const { perAccount, perIp } = await rules();

  if (perIp.limit > 0) {
    const result = limiter.hit(ipKey(ip), perIp);
    if (!result.allowed) {
      throw limiter.tooMany(`Too many sign-in attempts from this network. Try again in ${minutesLeft(result.resetAt)} minute(s).`, result.resetAt);
    }
  }

  if (perAccount.limit > 0 && email && limiter.peek(accountKey(email)) >= perAccount.limit) {
    throw limiter.tooMany("Too many failed sign-in attempts for this account. Please wait 15 minutes and try again.", Date.now() + perAccount.windowMs);
  }
};

const recordFailure = async ({ email }) => {
  const { perAccount } = await rules();
  if (perAccount.limit > 0 && email) limiter.hit(accountKey(email), perAccount);
};

const recordSuccess = ({ email }) => {
  if (email) limiter.reset(accountKey(email));
};

module.exports = { assertAllowed, recordFailure, recordSuccess };
