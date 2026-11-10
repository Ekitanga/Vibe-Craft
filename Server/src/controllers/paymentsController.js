const asyncHandler = require("../utils/asyncHandler");
const mpesaService = require("../services/mpesaService");
const orderService = require("../services/orderService");
const auditService = require("../services/auditService");

// Safaricom posts STK Push results here. Always acknowledge with the Daraja format;
// a wrong token answers 404 so the URL cannot be probed.
const mpesaCallback = asyncHandler(async (req, res) => {
  const result = await mpesaService.handleCallback({
    token: req.params.token,
    body: req.body,
    markOrderPaid: orderService.markOrderPaid,
  });
  if (result.paid) {
    await auditService.record(null, "mpesa_payment_confirmed", "order", result.orderId);
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

module.exports = { mpesaCallback };
