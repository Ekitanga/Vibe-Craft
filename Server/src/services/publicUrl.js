const integrationSettings = require("./integrationSettingsService");

// The canonical public address: the admin-configured one, else the current request's host.
const getPublicBaseUrl = async (req) => {
  const site = await integrationSettings.getConfig("site");
  if (site.publicBaseUrl) return site.publicBaseUrl.replace(/\/+$/, "");
  return req ? `${req.protocol}://${req.get("host")}` : "";
};

const absoluteUrl = (base, value) => {
  if (!value) return "";
  try {
    return new URL(value, base + "/").toString();
  } catch (_error) {
    return "";
  }
};

module.exports = { absoluteUrl, getPublicBaseUrl };
