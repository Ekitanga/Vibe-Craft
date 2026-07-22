const customerAuthService = require("../services/customerAuthService");
const adminAuthService = require("../services/adminAuthService");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { adminSessionCookieName, getAdminSessionToken } = require("../middleware/adminAuth");
const { customerSessionCookieName, getCustomerSessionToken } = require("../middleware/customerAuth");

const cookieOptions = (expiresAt) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.nodeEnv === "production",
  path: "/",
  expires: expiresAt ? new Date(expiresAt) : undefined,
});

const isCredentialError = (error) => error && error.statusCode === 401;

const tryLogin = async (callback) => {
  try {
    return await callback();
  } catch (error) {
    if (isCredentialError(error)) {
      return null;
    }

    throw error;
  }
};

const sendCustomerSession = (res, session, statusCode = 200) => {
  res.cookie(customerSessionCookieName, session.token, cookieOptions(session.expiresAt));
  res.status(statusCode).json({
    success: true,
    data: {
      user: session.account,
      expiresAt: session.expiresAt,
    },
  });
};

const signup = asyncHandler(async (req, res) => {
  const session = await customerAuthService.signupCustomer(req.body || {});

  sendCustomerSession(res, session, 201);
});

const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body || {};
  const session = await customerAuthService.authenticateWithGoogle(idToken);

  sendCustomerSession(res, session, 200);
});

const login = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  const customerSession = await tryLogin(() => customerAuthService.authenticateCustomer(payload));
  const adminSession = await tryLogin(() => adminAuthService.authenticateAdmin(payload));

  if (!customerSession && !adminSession) {
    throw new HttpError(401, "Invalid email or password.");
  }

  if (customerSession) {
    res.cookie(customerSessionCookieName, customerSession.token, cookieOptions(customerSession.expiresAt));
  }

  if (adminSession) {
    res.cookie(adminSessionCookieName, adminSession.token, cookieOptions(adminSession.expiresAt));
  }

  res.status(200).json({
    success: true,
    data: {
      user: customerSession ? customerSession.account : null,
      admin: adminSession ? adminSession.admin : null,
      expiresAt: customerSession ? customerSession.expiresAt : adminSession.expiresAt,
      customerExpiresAt: customerSession ? customerSession.expiresAt : null,
      adminExpiresAt: adminSession ? adminSession.expiresAt : null,
    },
  });
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.customer,
  });
});

const updateProfile = asyncHandler(async (req, res) => {
  const account = await customerAuthService.updateProfile(req.customer.id, req.body || {});

  res.status(200).json({
    success: true,
    data: account,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await customerAuthService.setOrChangePassword(req.customer.id, { currentPassword, newPassword });

  res.status(200).json({
    success: true,
    data: { updated: true },
  });
});

const linkGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.body || {};
  const account = await customerAuthService.linkGoogleAccount(req.customer.id, idToken);

  res.status(200).json({
    success: true,
    data: account,
  });
});

const unlinkGoogle = asyncHandler(async (req, res) => {
  const account = await customerAuthService.unlinkGoogleAccount(req.customer.id);

  res.status(200).json({
    success: true,
    data: account,
  });
});

const logout = asyncHandler(async (req, res) => {
  await customerAuthService.destroyCustomerSession(getCustomerSessionToken(req));
  await adminAuthService.destroyAdminSession(getAdminSessionToken(req));

  res.clearCookie(customerSessionCookieName, cookieOptions());
  res.clearCookie(adminSessionCookieName, cookieOptions());
  res.status(200).json({
    success: true,
    data: { signedOut: true },
  });
});

module.exports = {
  changePassword,
  googleLogin,
  linkGoogle,
  login,
  logout,
  me,
  signup,
  unlinkGoogle,
  updateProfile,
};
