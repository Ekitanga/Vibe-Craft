const express = require("express");
const customerAuthController = require("../controllers/customerAuthController");
const uploadController = require("../controllers/uploadController");
const { requireCustomer } = require("../middleware/customerAuth");
const { uploadAvatar } = require("../middleware/upload");
const { accountActionLimit, signupLimit } = require("../middleware/abuseLimits");

const router = express.Router();

router.post("/signup", signupLimit, customerAuthController.signup);
router.post("/login", customerAuthController.login);
router.post("/google", signupLimit, customerAuthController.googleLogin);
router.post("/logout", customerAuthController.logout);
router.get("/verify-email", customerAuthController.verifyEmail);
router.get("/me", requireCustomer, customerAuthController.me);
router.patch("/me", requireCustomer, customerAuthController.updateProfile);
router.post("/me/avatar", requireCustomer, accountActionLimit, uploadAvatar, uploadController.uploadAvatar);
router.post("/me/resend-verification", requireCustomer, accountActionLimit, customerAuthController.resendVerification);
router.post("/change-password", requireCustomer, customerAuthController.changePassword);
router.post("/google/link", requireCustomer, customerAuthController.linkGoogle);
router.post("/google/unlink", requireCustomer, customerAuthController.unlinkGoogle);

module.exports = router;
