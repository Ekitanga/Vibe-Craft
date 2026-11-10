const express = require("express");
const promotionController = require("../controllers/promotionController");
const { promoLimit } = require("../middleware/abuseLimits");

const router = express.Router();

// Public: checkout checks a code. Management lives under /api/admin/promotions with
// permission checks (the unrestricted duplicates that used to be here were removed).
router.post("/validate", promoLimit, promotionController.validatePromotion);

module.exports = router;
