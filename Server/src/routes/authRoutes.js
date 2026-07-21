const express = require("express");
const customerAuthController = require("../controllers/customerAuthController");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

router.post("/signup", customerAuthController.signup);
router.post("/login", customerAuthController.login);
router.post("/google", customerAuthController.googleLogin);
router.post("/logout", customerAuthController.logout);
router.get("/me", requireCustomer, customerAuthController.me);

module.exports = router;
