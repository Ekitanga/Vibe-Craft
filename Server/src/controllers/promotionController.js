const asyncHandler = require("../utils/asyncHandler");
const promotionService = require("../services/promotionService");
const auditService = require("../services/auditService");

const validatePromotion = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await promotionService.validatePromotion(req.body && req.body.code, req.body && req.body.subtotal) });
});

const listPromotions = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await promotionService.listPromotions() });
});

const createPromotion = asyncHandler(async (req, res) => {
  const promotion = await promotionService.createPromotion(req.body || {});
  await auditService.record(req.admin, "create_promotion", "promotion", promotion.id, { code: promotion.code });
  res.status(201).json({ success: true, data: promotion });
});

const updatePromotion = asyncHandler(async (req, res) => {
  const promotion = await promotionService.updatePromotion(req.params.id, req.body || {});
  await auditService.record(req.admin, "update_promotion", "promotion", promotion.id, { active: promotion.active });
  res.json({ success: true, data: promotion });
});

const deletePromotion = asyncHandler(async (req, res) => {
  await promotionService.deletePromotion(req.params.id);
  await auditService.record(req.admin, "delete_promotion", "promotion", req.params.id);
  res.status(204).send();
});

module.exports = { createPromotion, deletePromotion, listPromotions, updatePromotion, validatePromotion };
