const customerAuthService = require("../services/customerAuthService");
const adminAuthService = require("../services/adminAuthService");
const adminLoginPath = require("../services/adminLoginPath");
const auditService = require("../services/auditService");
const emailService = require("../services/emailService");
const loginGuard = require("../services/loginGuard");
const metaService = require("../services/metaService");
const { parseCookies } = require("../utils/cookies");
const { getPublicBaseUrl } = require("../services/publicUrl");
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const { sessionCookieOptions } = require("../utils/cookies");
const { adminSessionCookieName, getAdminSessionToken } = require("../middleware/adminAuth");
const { customerSessionCookieName, getCustomerSessionToken } = require("../middleware/customerAuth");

const isCredentialError = (error) => error && error.statusCode === 401;

const tryLogin = async (callback) => {
  try {
    return await callback();
  } catch (error) {
    if (isCredentialError(error)) return null;
    throw error;
  }
};

const sendCustomerSession = (res, session, statusCode = 200) => {
  res.cookie(customerSessionCookieName, session.token, sessionCookieOptions(session.expiresAt));
  res.status(statusCode).json({ success: true, data: { user: session.account, expiresAt: session.expiresAt } });
};

const sendVerification = async (req, account) => {
  if (!account || account.emailVerified) return { sent: false };
  const token = await customerAuthService.createEmailVerificationToken(account.id);
  const baseUrl = await getPublicBaseUrl(req);
  return emailService.sendVerificationEmail({
    to: account.email,
    name: account.name,
    link: `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`,
  });
};

// Sign-up pages never load the Pixel, so registrations are reported server-side.
const reportRegistration = (req, account, method) => {
  const cookies = parseCookies(req.headers.cookie || "");
  metaService
    .sendEvents([{
      event_name: "CompleteRegistration",
      event_time: Math.floor(Date.now() / 1000),
      event_id: `registration_${account.id}`,
      action_source: "website",
      user_data: metaService.buildUserData({
        email: account.email,
        phone: account.phone,
        name: account.name,
        externalId: account.id,
        ip: req.ip,
        userAgent: req.get("user-agent"),
        fbp: cookies._fbp,
        fbc: cookies._fbc,
      }),
      custom_data: { status: "registered", method },
    }], { source: "signup" })
    .catch(() => {});
};

const signup = asyncHandler(async (req, res) => {
  const session = await customerAuthService.signupCustomer(req.body || {});
  sendVerification(req, session.account).catch((error) => console.error("[auth] verification email failed:", error.message));
  reportRegistration(req, session.account, "email");
  sendCustomerSession(res, session, 201);
});

const googleLogin = asyncHandler(async (req, res) => {
  const { idToken } = req.body || {};
  const session = await customerAuthService.authenticateWithGoogle(idToken);
  if (session.account && Date.now() - new Date(session.account.createdAt).getTime() < 60 * 1000) {
    reportRegistration(req, session.account, "google");
  }
  sendCustomerSession(res, session, 200);
});

// The shared sign-in form serves customers and admins. Brute-force protection is
// applied once per attempt, whichever account type the email belongs to.
const login = asyncHandler(async (req, res) => {
  const payload = req.body || {};
  await loginGuard.assertAllowed({ email: payload.email, ip: req.ip });

  const customerSession = await tryLogin(() => customerAuthService.authenticateCustomer(payload));
  // Admins sign in here only when no private admin sign-in address is configured.
  const adminSession = (await adminLoginPath.get())
    ? null
    : await tryLogin(() => adminAuthService.authenticateAdmin(payload, { ip: req.ip, userAgent: req.get("user-agent") }));

  if (!customerSession && !adminSession) {
    await loginGuard.recordFailure({ email: payload.email });
    throw new HttpError(401, "Invalid email or password.");
  }
  loginGuard.recordSuccess({ email: payload.email });

  if (customerSession) {
    res.cookie(customerSessionCookieName, customerSession.token, sessionCookieOptions(customerSession.expiresAt));
  }
  if (adminSession) {
    res.cookie(adminSessionCookieName, adminSession.token, sessionCookieOptions(adminSession.expiresAt));
    await auditService.record(adminSession.admin, "admin_login", "admin", adminSession.admin.id, { ip: req.ip });
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
  res.status(200).json({ success: true, data: req.customer });
});

const listCustomers = asyncHandler(async (_req, res) => {
  const customers = await customerAuthService.listCustomerAccounts();
  res.status(200).json({ success: true, count: customers.length, data: customers });
});

const updateProfile = asyncHandler(async (req, res) => {
  const account = await customerAuthService.updateProfile(req.customer.id, req.body || {});
  res.status(200).json({ success: true, data: account });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  await loginGuard.assertAllowed({ email: req.customer.email, ip: req.ip });
  try {
    await customerAuthService.setOrChangePassword(
      req.customer.id,
      { currentPassword, newPassword },
      { keepSessionToken: getCustomerSessionToken(req) }
    );
  } catch (error) {
    if (error.statusCode === 401) await loginGuard.recordFailure({ email: req.customer.email });
    throw error;
  }
  res.status(200).json({ success: true, data: { updated: true } });
});

const linkGoogle = asyncHandler(async (req, res) => {
  const { idToken } = req.body || {};
  const account = await customerAuthService.linkGoogleAccount(req.customer.id, idToken);
  res.status(200).json({ success: true, data: account });
});

const unlinkGoogle = asyncHandler(async (req, res) => {
  const account = await customerAuthService.unlinkGoogleAccount(req.customer.id);
  res.status(200).json({ success: true, data: account });
});

// Opened from the verification email; lands the customer back on their account page.
const verifyEmail = asyncHandler(async (req, res) => {
  try {
    await customerAuthService.verifyEmailToken(req.query.token);
    res.redirect(302, "/account?emailVerified=1");
  } catch (_error) {
    res.redirect(302, "/account?emailVerified=0");
  }
});

const resendVerification = asyncHandler(async (req, res) => {
  if (req.customer.emailVerified) {
    res.status(200).json({ success: true, data: { alreadyVerified: true } });
    return;
  }
  const result = await sendVerification(req, req.customer);
  if (!result.sent) throw new HttpError(503, "Email is not set up yet. Please contact the store.");
  res.status(200).json({ success: true, data: { sent: true } });
});

const logout = asyncHandler(async (req, res) => {
  await customerAuthService.destroyCustomerSession(getCustomerSessionToken(req));
  await adminAuthService.destroyAdminSession(getAdminSessionToken(req));
  res.clearCookie(customerSessionCookieName, sessionCookieOptions());
  res.clearCookie(adminSessionCookieName, sessionCookieOptions());
  res.status(200).json({ success: true, data: { signedOut: true } });
});

module.exports = {
  changePassword,
  googleLogin,
  linkGoogle,
  listCustomers,
  login,
  logout,
  me,
  resendVerification,
  signup,
  unlinkGoogle,
  updateProfile,
  verifyEmail,
};
