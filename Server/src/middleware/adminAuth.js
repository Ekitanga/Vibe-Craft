const adminAuthService = require("../services/adminAuthService");
const HttpError = require("../utils/httpError");
const { getCookie } = require("../utils/cookies");

const adminSessionCookieName = "vibecraft_admin_session";

const getAdminSessionToken = (req) => getCookie(req, adminSessionCookieName);

// Routes an admin may still use while forced to change a weak password.
const PASSWORD_CHANGE_ALLOWED = new Set(["/auth/me", "/auth/change-password", "/auth/logout"]);

const requireAdmin = async (req, _res, next) => {
  try {
    const admin = await adminAuthService.getAdminBySessionToken(getAdminSessionToken(req));

    if (!admin) {
      throw new HttpError(401, "Admin sign-in required.");
    }

    if (admin.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.path)) {
      const error = new HttpError(403, "Please change your password before continuing.");
      error.code = "PASSWORD_CHANGE_REQUIRED";
      throw error;
    }

    req.admin = admin;
    next();
  } catch (error) {
    next(error);
  }
};

// Passes when the admin holds ANY of the listed permissions.
const requirePermission = (...permissions) => (req, _res, next) => {
  const held = (req.admin && req.admin.permissions) || [];
  if (!permissions.some((permission) => held.includes(permission))) {
    return next(new HttpError(403, "You do not have permission to perform this action."));
  }
  return next();
};

module.exports = {
  adminSessionCookieName,
  getAdminSessionToken,
  requireAdmin,
  requirePermission,
};
