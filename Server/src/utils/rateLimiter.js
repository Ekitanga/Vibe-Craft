// Small fixed-window rate limiter kept in memory. Vibecraft runs as a single
// instance on Render, so in-memory counters are accurate; if it is ever scaled out,
// swap the store for Redis/Postgres without changing callers.
const HttpError = require("./httpError");

const buckets = new Map();

const hit = (key, { limit, windowMs }) => {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
};

const peek = (key) => {
  const entry = buckets.get(key);
  if (!entry || Date.now() >= entry.resetAt) return 0;
  return entry.count;
};

const reset = (key) => buckets.delete(key);

const resetAll = () => buckets.clear();

// Expired buckets are swept periodically so memory stays flat.
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now >= entry.resetAt) buckets.delete(key);
  }
}, 60 * 1000);
sweeper.unref();

const tooMany = (message, resetAt) => {
  const error = new HttpError(429, message || "Too many requests. Please wait a little and try again.");
  error.retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  return error;
};

// Express middleware factory. `getRule` returns { limit, windowMs } (possibly from admin
// security settings) and `keyFn` decides what is being limited (IP by default).
const rateLimit = ({ name, getRule, keyFn, message }) => async (req, res, next) => {
  try {
    const rule = await getRule(req);
    if (!rule || !rule.limit || rule.limit <= 0) return next();
    const key = `${name}:${keyFn ? keyFn(req) : req.ip || "unknown"}`;
    const result = hit(key, rule);
    res.setHeader("RateLimit-Limit", String(rule.limit));
    res.setHeader("RateLimit-Remaining", String(result.remaining));
    if (!result.allowed) {
      const error = tooMany(message, result.resetAt);
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      return next(error);
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = { hit, peek, rateLimit, reset, resetAll, tooMany };
