const asyncHandler = require("../utils/asyncHandler");
const orderService = require("../services/orderService");

const listOrders = asyncHandler(async (_req, res) => {
  const orders = await orderService.listOrders();

  res.json({
    success: true,
    count: orders.length,
    data: orders,
  });
});

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.body);

  res.status(201).json({
    success: true,
    data: order,
  });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateOrderStatus(req.params.id, req.body.status);

  res.json({
    success: true,
    data: order,
  });
});

module.exports = {
  listOrders,
  createOrder,
  updateOrderStatus,
};
