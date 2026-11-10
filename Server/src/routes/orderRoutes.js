const express = require("express");
const orderController = require("../controllers/orderController");
const { attachCustomerIfPresent, requireCustomer } = require("../middleware/customerAuth");
const { orderLimit } = require("../middleware/abuseLimits");

const router = express.Router();

router.post("/", orderLimit, attachCustomerIfPresent, orderController.createOrder);
router.get("/mine", requireCustomer, orderController.listMyOrders);

module.exports = router;
