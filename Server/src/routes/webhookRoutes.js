const express = require("express");
const marketingController = require("../controllers/marketingController");
const paymentsController = require("../controllers/paymentsController");

const router = express.Router();

// Meta Lead Ads. The raw body is kept so the X-Hub-Signature-256 HMAC can be checked.
router.get("/webhooks/meta", marketingController.verifyWebhook);
router.post("/webhooks/meta", express.raw({ type: "application/json", limit: "1mb" }), marketingController.receiveWebhook);

// Safaricom Daraja STK Push results.
router.post("/payments/mpesa/callback/:token", express.json({ limit: "100kb" }), paymentsController.mpesaCallback);

module.exports = router;
