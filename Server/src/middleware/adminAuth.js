const adminAuthService = require("../services/adminAuthService");
const HttpError = require("../utils/httpError");
const { getCookie } = require("../utils/cookies");

const adminSessionCookieName = "vibecraft_admin_session";

const getAdminSessionToken = (req) => getCookie(req, adminSessionCookieName);

const requireAdmin = async (req, _res, next) => {
  try {
    const admin = await adminAuthService.getAdminBySessionToken(getAdminSessionToken(req));

    if (!admin) {
      throw new HttpError(401, "Admin sign-in required.");
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  adminSessionCookieName,
  getAdminSessionToken,
  requireAdmin,
};
