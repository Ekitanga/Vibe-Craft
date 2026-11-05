const asyncHandler = require("../utils/asyncHandler");
const auditService = require("../services/auditService");

const listRecent = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await auditService.listRecent(req.query.limit) });
});

module.exports = { listRecent };
