const express = require("express");
const orderController = require("../controllers/orderController");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

router.post("/", requireCustomer, orderController.createOrder);
router.get("/mine", requireCustomer, orderController.listMyOrders);

module.exports = router;
