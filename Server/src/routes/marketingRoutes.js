const express = require("express");
const marketingController = require("../controllers/marketingController");
const { attachCustomerIfPresent } = require("../middleware/customerAuth");
const { trackingLimit } = require("../middleware/abuseLimits");

const router = express.Router();

// Browser Pixel events mirrored to the Conversions API (same event_id → de-duplicated).
router.post("/events", trackingLimit, attachCustomerIfPresent, marketingController.relayEvent);

module.exports = router;
