const HttpError = require("../utils/httpError");

const WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;

const hits = new Map();

const aiRateLimit = (req, _res, next) => {
  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(key, { windowStart: now, count: 1 });
    next();
    return;
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    next(new HttpError(429, "You're sending messages too quickly. Please wait a few minutes and try again."));
    return;
  }

  entry.count += 1;
  next();
};

module.exports = { aiRateLimit };
