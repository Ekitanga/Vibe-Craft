// Rate limits for public endpoints. Every number is editable in
// Admin → Integrations → Security & abuse protection.
const { rateLimit } = require("../utils/rateLimiter");
const integrationSettings = require("../services/integrationSettingsService");

const fromSecurity = (field, windowMs) => async () => {
  const config = await integrationSettings.getConfig("security");
  return { limit: Number(config[field] || 0), windowMs };
};

const MINUTE = 60 * 1000;

const signupLimit = rateLimit({
  name: "signup",
  getRule: fromSecurity("signupsPerHourPerIp", 60 * MINUTE),
  message: "Too many new accounts from this network. Please try again later.",
});

const orderLimit = rateLimit({
  name: "orders",
  getRule: fromSecurity("ordersPerHourPerIp", 60 * MINUTE),
  message: "Too many orders from this network in a short time. Please call or WhatsApp us to complete your order.",
});

const promoLimit = rateLimit({
  name: "promo",
  getRule: fromSecurity("promoChecksPer10Min", 10 * MINUTE),
  message: "Too many promotion code attempts. Please wait a few minutes.",
});

const aiLimit = rateLimit({
  name: "ai",
  getRule: fromSecurity("aiMessagesPer5Min", 5 * MINUTE),
  message: "You're sending messages too quickly. Please wait a few minutes and try again.",
});

const trackingLimit = rateLimit({
  name: "tracking",
  getRule: fromSecurity("trackingEventsPerMinute", MINUTE),
  message: "Too many events.",
});

// Resending verification emails and similar account actions.
const accountActionLimit = rateLimit({
  name: "account-action",
  getRule: async () => ({ limit: 5, windowMs: 15 * MINUTE }),
  message: "Please wait a few minutes before trying again.",
});

module.exports = { accountActionLimit, aiLimit, orderLimit, promoLimit, signupLimit, trackingLimit };
