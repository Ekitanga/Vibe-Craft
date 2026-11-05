const express = require("express");
const promotionController = require("../controllers/promotionController");
const { requireAdmin } = require("../middleware/adminAuth");

const router = express.Router();

router.post("/validate", promotionController.validatePromotion);
router.get("/", requireAdmin, promotionController.listPromotions);
router.post("/", requireAdmin, promotionController.createPromotion);
router.patch("/:id", requireAdmin, promotionController.updatePromotion);
router.delete("/:id", requireAdmin, promotionController.deletePromotion);

module.exports = router;
