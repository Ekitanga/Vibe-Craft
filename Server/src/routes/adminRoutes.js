const express = require("express");
const adminAuthController = require("../controllers/adminAuthController");
const customerAuthController = require("../controllers/customerAuthController");
const productController = require("../controllers/productController");
const orderController = require("../controllers/orderController");
const uploadController = require("../controllers/uploadController");
const testimonialController = require("../controllers/testimonialController");
const siteSettingsController = require("../controllers/siteSettingsController");
const promotionController = require("../controllers/promotionController");
const auditController = require("../controllers/auditController");
const { requireAdmin, requireRole } = require("../middleware/adminAuth");
const { uploadImages, uploadVideo } = require("../middleware/upload");

const router = express.Router();

router.post("/auth/login", adminAuthController.login);
router.post("/auth/logout", adminAuthController.logout);
router.get("/auth/me", requireAdmin, adminAuthController.me);
router.post("/auth/change-password", requireAdmin, adminAuthController.changePassword);
router.get("/settings", requireAdmin, requireRole("owner", "admin", "manager"), siteSettingsController.getSettings);
router.get("/settings/previous", requireAdmin, requireRole("owner", "admin", "manager"), siteSettingsController.getPreviousSettings);
router.patch("/settings", requireAdmin, requireRole("owner", "admin", "manager"), siteSettingsController.updateSettings);
router.post("/settings/reset-previous", requireAdmin, requireRole("owner", "admin", "manager"), siteSettingsController.resetPreviousSettings);
router.get("/promotions", requireAdmin, requireRole("owner", "admin", "manager"), promotionController.listPromotions);
router.post("/promotions", requireAdmin, requireRole("owner", "admin", "manager"), promotionController.createPromotion);
router.patch("/promotions/:id", requireAdmin, requireRole("owner", "admin", "manager"), promotionController.updatePromotion);
router.delete("/promotions/:id", requireAdmin, requireRole("owner", "admin", "manager"), promotionController.deletePromotion);
router.get("/audit-logs", requireAdmin, requireRole("owner", "admin"), auditController.listRecent);

router.use(requireAdmin);

router.get("/products", productController.listProducts);
router.post("/products", productController.createProduct);
router.patch("/products/:id", productController.updateProduct);
router.delete("/products/:id", productController.deleteProduct);

router.post("/uploads", uploadImages, uploadController.uploadImages);
router.post("/uploads/video", uploadVideo, uploadController.uploadTestimonialVideo);
router.post("/uploads/product-video", uploadVideo, uploadController.uploadProductVideo);

router.get("/testimonials", testimonialController.listAllTestimonials);
router.post("/testimonials", testimonialController.createTestimonial);
router.patch("/testimonials/:id", testimonialController.updateTestimonial);
router.delete("/testimonials/:id", testimonialController.deleteTestimonial);

router.get("/orders", orderController.listOrders);
router.patch("/orders/:id/status", orderController.updateOrderStatus);
router.patch("/orders/:id/payment", orderController.updatePaymentVerification);

router.get("/admins", requireRole("owner", "admin"), adminAuthController.listAdmins);
router.post("/admins", requireRole("owner", "admin"), adminAuthController.inviteAdmin);

router.get("/customers", customerAuthController.listCustomers);

module.exports = router;
