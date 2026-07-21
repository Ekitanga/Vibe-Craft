const env = require("../config/env");

const errorHandler = (error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message: error.message || "Something went wrong",
    details: error.details,
    stack: env.nodeEnv === "development" ? error.stack : undefined,
  });
};

module.exports = errorHandler;
