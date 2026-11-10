const env = require("../config/env");

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(";").reduce((cookies, item) => {
    const separatorIndex = item.indexOf("=");

    if (separatorIndex === -1) {
      return cookies;
    }

    const name = item.slice(0, separatorIndex).trim();
    const value = item.slice(separatorIndex + 1).trim();

    if (!name || Object.prototype.hasOwnProperty.call(cookies, name)) {
      return cookies;
    }

    try {
      cookies[name] = decodeURIComponent(value);
    } catch (_error) {
      cookies[name] = value;
    }

    return cookies;
  }, {});
};

const getCookie = (req, name) => parseCookies(req.headers.cookie || "")[name];

// HTTP-only, SameSite=Lax session cookies; Secure in production.
const sessionCookieOptions = (expiresAt) => ({
  httpOnly: true,
  sameSite: "lax",
  secure: env.isProduction,
  path: "/",
  expires: expiresAt ? new Date(expiresAt) : undefined,
});

module.exports = {
  getCookie,
  parseCookies,
  sessionCookieOptions,
};
