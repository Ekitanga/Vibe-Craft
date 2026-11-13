const adminAuthService = require("../services/adminAuthService");
const adminLoginPath = require("../services/adminLoginPath");
const HttpError = require("../utils/httpError");
const auditService = require("../services/auditService");
const loginGuard = require("../services/loginGuard");
const asyncHandler = require("../utils/asyncHandler");
const { sessionCookieOptions } = require("../utils/cookies");
const { adminSessionCookieName, getAdminSessionToken } = require("../middleware/adminAuth");

const requestContext = (req) => ({ ip: req.ip, userAgent: req.get("user-agent") });

const login = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  // With a private sign-in address, this endpoint looks like it does not exist unless the
  // request comes from that page.
  const slug = await adminLoginPath.get();
  if (slug && adminLoginPath.normalize(payload.loginPath) !== slug) {
    throw new HttpError(404, `Route not found: ${req.method} ${req.originalUrl}`);
  }
  await loginGuard.assertAllowed({ email: payload.email, ip: req.ip });
  let session;
  try {
    session = await adminAuthService.authenticateAdmin(payload, requestContext(req));
  } catch (error) {
    if (error.statusCode === 401) await loginGuard.recordFailure({ email: payload.email });
    throw error;
  }
  loginGuard.recordSuccess({ email: payload.email });
  await auditService.record(session.admin, "admin_login", "admin", session.admin.id, { ip: req.ip });

  res.cookie(adminSessionCookieName, session.token, sessionCookieOptions(session.expiresAt));
  res.status(200).json({ success: true, data: { admin: session.admin, expiresAt: session.expiresAt } });
});

const me = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, data: req.admin });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await loginGuard.assertAllowed({ email: req.admin.email, ip: req.ip });
  try {
    await adminAuthService.changeAdminPassword(req.admin.id, { currentPassword, newPassword }, { keepSessionToken: getAdminSessionToken(req) });
  } catch (error) {
    if (error.statusCode === 401) await loginGuard.recordFailure({ email: req.admin.email });
    throw error;
  }
  await auditService.record(req.admin, "change_password", "admin", req.admin.id);
  res.status(200).json({ success: true, data: { updated: true } });
});

const listAdmins = asyncHandler(async (_req, res) => {
  res.status(200).json({ success: true, data: await adminAuthService.listAdminUsers() });
});

const inviteAdmin = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.inviteAdminUser(req.admin, req.body || {});
  await auditService.record(req.admin, "invite_admin", "admin", admin.id, { role: admin.role, email: admin.email });
  res.status(201).json({ success: true, data: admin });
});

const updateAdmin = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.updateAdminUser(req.admin, req.params.id, req.body || {});
  await auditService.record(req.admin, "update_admin", "admin", admin.id, {
    email: admin.email,
    role: admin.role,
    active: admin.isActive,
  });
  res.status(200).json({ success: true, data: admin });
});

const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.deleteAdminUser(req.admin, req.params.id);
  await auditService.record(req.admin, "remove_admin", "admin", admin.id, { email: admin.email, role: admin.role });
  res.status(204).send();
});

const resetAdminPassword = asyncHandler(async (req, res) => {
  const admin = await adminAuthService.resetAdminPassword(req.admin, req.params.id, (req.body || {}).newPassword);
  await auditService.record(req.admin, "reset_admin_password", "admin", admin.id, { email: admin.email });
  res.status(200).json({ success: true, data: { updated: true } });
});

const revokeAdminSessions = asyncHandler(async (req, res) => {
  const result = await adminAuthService.revokeAdminSessions(req.admin, req.params.id);
  await auditService.record(req.admin, "revoke_admin_sessions", "admin", result.target.id, { email: result.target.email, revoked: result.revoked });
  if (result.target.id === req.admin.id) res.clearCookie(adminSessionCookieName, sessionCookieOptions());
  res.status(200).json({ success: true, data: { revoked: result.revoked } });
});

const logout = asyncHandler(async (req, res) => {
  await adminAuthService.destroyAdminSession(getAdminSessionToken(req));
  res.clearCookie(adminSessionCookieName, sessionCookieOptions());
  res.status(200).json({ success: true, data: { signedOut: true } });
});

module.exports = {
  changePassword,
  deleteAdmin,
  inviteAdmin,
  listAdmins,
  login,
  logout,
  me,
  resetAdminPassword,
  revokeAdminSessions,
  updateAdmin,
};
