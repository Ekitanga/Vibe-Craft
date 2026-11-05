const asyncHandler = require("../utils/asyncHandler");
const orderService = require("../services/orderService");
const auditService = require("../services/auditService");

const listOrders = asyncHandler(async (_req, res) => {
  const orders = await orderService.listOrders();

  res.json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.body, req.customer ? req.customer.id : null);

  res.status(201).json({
    success: true,
    data: order,
  });
});

const listMyOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.listOrdersForAccount({
    accountId: req.customer.id,
    email: req.customer.email,
  });

  res.json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.id, req.body.status);
  await auditService.record(req.admin, "update_order_status", "order", order.id, { status: order.status });

  res.json({
    success: true,
    data: order,
  });
});

const updatePaymentVerification = asyncHandler(async (req, res) => {
  const order = await orderService.updatePaymentVerification(req.params.id, req.body.verified);
  await auditService.record(req.admin, "update_payment_verification", "order", order.id, { verified: order.paymentVerified });

  res.json({
    success: true,
    data: order,
  });
});

module.exports = {
  listOrders,
  listMyOrders,
  createOrder,
  updateOrderStatus,
  updatePaymentVerification,
};
