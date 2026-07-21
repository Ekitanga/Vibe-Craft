const customerAuthService = require("../services/customerAuthService");
const HttpError = require("../utils/httpError");
const { getCookie } = require("../utils/cookies");

const customerSessionCookieName = "vibecraft_customer_session";

const getCustomerSessionToken = (req) => getCookie(req, customerSessionCookieName);

const requireCustomer = async (req, _res, next) => {
  try {
    const customer = await customerAuthService.getCustomerBySessionToken(getCustomerSessionToken(req));

    if (!customer) {
      throw new HttpError(401, "Customer sign-in required.");
    }

    req.customer = customer;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  customerSessionCookieName,
  getCustomerSessionToken,
  requireCustomer,
};
