const asyncHandler = require("../utils/asyncHandler");
const HttpError = require("../utils/httpError");
const orderService = require("../services/orderService");
const auditService = require("../services/auditService");
const mpesaService = require("../services/mpesaService");
const metaService = require("../services/metaService");
const { getPublicBaseUrl } = require("../services/publicUrl");
const { parseCookies } = require("../utils/cookies");

// Roles that can see the dashboard but not customer data get revenue figures only.
const redactOrder = (order) => ({
  ...order,
  customer: { id: order.customer.id, name: "Customer" },
  delivery: { county: order.delivery.county },
  mpesaCode: order.mpesaCode ? "••••" : null,
  notes: "",
  attribution: null,
  inquiryAnswers: [],
});

const listOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listOrders();
  const canSeeCustomers = req.admin.permissions.includes("orders.view");
  const data = canSeeCustomers ? orders : orders.map(redactOrder);
  res.json({ success: true, count: data.length, data });
});

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.body || {}, {
    customerAccountId: req.customer ? req.customer.id : null,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    cookies: parseCookies(req.headers.cookie || ""),
    baseUrl: await getPublicBaseUrl(req),
  });

  res.status(201).json({
    success: true,
    data: {
      ...orderService.publicOrder(order),
      // Lets the browser Pixel fire Purchase with the same event_id the server uses.
      tracking: { purchaseEventId: metaService.purchaseEventId(order.id) },
    },
  });
});

const listMyOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listOrdersForAccount({
    accountId: req.customer.id,
    email: req.customer.email,
    emailVerified: req.customer.emailVerified,
  });
  res.json({ success: true, count: orders.length, data: orders });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const order = await orderService.updateOrderStatus(req.params.id, body.status, { reason: body.reason ? String(body.reason).slice(0, 300) : `Cancelled by ${req.admin.name || req.admin.email}` });
  await auditService.record(req.admin, "update_order_status", "order", order.id, { status: order.status });
  res.json({ success: true, data: order });
});

const updatePaymentVerification = asyncHandler(async (req, res) => {
  const order = await orderService.updatePaymentVerification(req.params.id, (req.body || {}).verified);
  await auditService.record(req.admin, "update_payment_verification", "order", order.id, { verified: order.paymentVerified });
  res.json({ success: true, data: order });
});

const requestMpesaPayment = asyncHandler(async (req, res) => {
  const phone = (req.body || {}).phone;
  if (phone !== undefined && typeof phone !== "string") throw new HttpError(400, "Phone must be text.");
  const result = await mpesaService.requestPayment({ orderId: req.params.id, phone, baseUrl: await getPublicBaseUrl(req) });
  await auditService.record(req.admin, "request_mpesa_payment", "order", req.params.id, { checkoutRequestId: result.checkoutRequestId });
  res.json({ success: true, data: result });
});

const listOrderPayments = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await mpesaService.listPaymentsForOrder(req.params.id) });
});

module.exports = {
  createOrder,
  listMyOrders,
  listOrderPayments,
  listOrders,
  requestMpesaPayment,
  updateOrderStatus,
  updatePaymentVerification,
};
