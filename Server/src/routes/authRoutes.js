const express = require("express");
const customerAuthController = require("../controllers/customerAuthController");
const { requireCustomer } = require("../middleware/customerAuth");

const router = express.Router();

router.post("/signup", customerAuthController.signup);
router.post("/login", customerAuthController.login);
router.post("/google", customerAuthController.googleLogin);
router.post("/logout", customerAuthController.logout);
router.get("/me", requireCustomer, customerAuthController.me);
router.patch("/me", requireCustomer, customerAuthController.updateProfile);
router.post("/change-password", requireCustomer, customerAuthController.changePassword);
router.post("/google/link", requireCustomer, customerAuthController.linkGoogle);
router.post("/google/unlink", requireCustomer, customerAuthController.unlinkGoogle);

module.exports = router;
