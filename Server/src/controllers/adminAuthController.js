const adminAuthService = require("../services/adminAuthService");
const env = require("../config/env");
const asyncHandler = require("../utils/asyncHandler");
const { adminSessionCookieName, getAdminSessionToken } = require("../middleware/adminAuth");

const cookieOptions = (expiresAt) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.nodeEnv === "production",
  path: "/",
  expires: expiresAt ? new Date(expiresAt) : undefined,
});

const login = asyncHandler(async (req, res) => {
  const session = await adminAuthService.authenticateAdmin(req.body || {});

  res.cookie(adminSessionCookieName, session.token, cookieOptions(session.expiresAt));
  res.status(200).json({
    success: true,
    data: {
      admin: session.admin,
      expiresAt: session.expiresAt,
    },
  });
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: req.admin,
  });
});

const listAdmins = asyncHandler(async (_req, res) => {
  const admins = await adminAuthService.listAdminUsers();

  res.status(200).json({
    success: true,
    data: admins,
  });
});

const inviteAdmin = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.inviteAdminUser(req.body || {});

  res.status(201).json({
    success: true,
    data: admin,
  });
});

const logout = asyncHandler(async (req, res) => {
  await adminAuthService.destroyAdminSession(getAdminSessionToken(req));

  res.clearCookie(adminSessionCookieName, cookieOptions());
  res.status(200).json({
    success: true,
    data: { signedOut: true },
  });
});

module.exports = {
  inviteAdmin,
  listAdmins,
  login,
  logout,
  me,
};
