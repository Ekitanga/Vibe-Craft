const env = require("../config/env");

// Errors we raise on purpose (HttpError) carry a safe message for the user. Anything
// else (database errors, bugs) is logged in full and replaced with a generic message,
// so table names, SQL and stack traces never reach the browser in production.
const errorHandler = (error, req, res, _next) => {
  let statusCode = Number(error.statusCode || error.status) || 500;

  // Malformed JSON bodies and oversized payloads from express.json().
  if (error.type === "entity.parse.failed") statusCode = 400;
  if (error.type === "entity.too.large") statusCode = 413;

  const expected = error.name === "HttpError" || statusCode < 500;

  if (!expected) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error);
  }

  if (res.headersSent) return;

  let message = expected ? error.message : "Something went wrong on our side. Please try again.";
  if (error.type === "entity.parse.failed") message = "The request body is not valid JSON.";
  if (error.type === "entity.too.large") message = "The request is too large.";

  res.status(statusCode).json({
    success: false,
    message: message || "Something went wrong",
    code: error.code && expected && typeof error.code === "string" && /^[A-Z_]+$/.test(error.code) ? error.code : undefined,
    details: expected ? error.details : undefined,
    stack: env.nodeEnv === "development" && !expected ? error.stack : undefined,
  });
};

module.exports = errorHandler;
