const HttpError = require("../utils/httpError");

const notFound = (req, _res, next) => {
  next(new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

module.exports = notFound;
