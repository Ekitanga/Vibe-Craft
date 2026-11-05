const asyncHandler = require("../utils/asyncHandler");
const siteSettingsService = require("../services/siteSettingsService");
const auditService = require("../services/auditService");

const getSettings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await siteSettingsService.getSettings() });
});

const getPreviousSettings = asyncHandler(async (_req, res) => {
  const settings = await siteSettingsService.getPreviousSettings();
  res.json({ success: true, data: settings, hasPrevious: Boolean(settings) });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await siteSettingsService.updateSettings(req.body || {}, req.admin && req.admin.id);
  await auditService.record(req.admin, "update_settings", "site_settings", "1", { fields: Object.keys(req.body || {}) });
  res.json({ success: true, data: settings });
});

const resetPreviousSettings = asyncHandler(async (req, res) => {
  const settings = await siteSettingsService.resetPreviousSettings(req.admin && req.admin.id);
  await auditService.record(req.admin, "reset_previous_settings", "site_settings", "1");
  res.json({ success: true, data: settings });
});

module.exports = { getPreviousSettings, getSettings, resetPreviousSettings, updateSettings };
