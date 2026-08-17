const express = require("express");
const orderController = require("../controllers/orderController");
const { attachCustomerIfPresent, requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

router.post("/", attachCustomerIfPresent, orderController.createOrder);
router.get("/mine", requireCustomer, orderController.listMyOrders);

module.exports = router;
