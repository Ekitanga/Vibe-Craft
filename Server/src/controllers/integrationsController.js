// Admin → Integrations: read/update every integration and security setting, and
// run connection tests.
const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const integrationSettings = require("../services/integrationSettingsService");
const auditService = require("../services/auditService");
const metaService = require("../services/metaService");
const mpesaService = require("../services/mpesaService");
const emailService = require("../services/emailService");
const secretBox = require("../utils/secretBox");

const listIntegrations = asyncHandler(async (_req, res) => {
  res.json({
    success: true,
    data: {
      sections: await integrationSettings.adminViewAll(),
      encryption: {
        source: secretBox.keySource(),
        message:
          secretBox.keySource() === "env"
            ? "Secrets are encrypted with the server's SETTINGS_ENCRYPTION_KEY."
            : "Secrets are encrypted with a key stored in the database. For stronger protection, set SETTINGS_ENCRYPTION_KEY on the server.",
      },
    },
  });
});

const updateIntegration = asyncHandler(async (req, res) => {
  const result = await integrationSettings.update(req.params.key, req.body || {}, req.admin.id);
  // Secret values are never written to the audit log — only which fields changed.
  await auditService.record(req.admin, "update_integration", "integration", req.params.key, { fields: result.changed.join(", ") || "none" });
  res.json({ success: true, data: await integrationSettings.adminView(req.params.key) });
});

const testIntegration = asyncHandler(async (req, res) => {
  const key = req.params.key;
  let data;
  if (key === "meta") data = await metaService.testConnection();
  else if (key === "mpesa") data = await mpesaService.testConnection();
  else if (key === "email") {
    const to = String((req.body && req.body.to) || req.admin.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new HttpError(400, "Enter a valid email address for the test.");
    data = await emailService.sendTestEmail(to);
  } else throw new HttpError(400, "This section has no connection test.");
  await auditService.record(req.admin, "test_integration", "integration", key);
  res.json({ success: true, data });
});

module.exports = { listIntegrations, testIntegration, updateIntegration };
