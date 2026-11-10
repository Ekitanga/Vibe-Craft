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
const accessController = require("../controllers/accessController");
const integrationsController = require("../controllers/integrationsController");
const marketingController = require("../controllers/marketingController");
const { requireAdmin, requirePermission: can } = require("../middleware/adminAuth");
const { uploadImages, uploadVideo } = require("../middleware/upload");

const router = express.Router();

// ---- Session ------------------------------------------------------------------
router.post("/auth/login", adminAuthController.login);
router.post("/auth/logout", adminAuthController.logout);

// Everything below requires a signed-in, active admin. Each route then checks the
// specific permission; roles and their permissions are edited in Access control.
router.use(requireAdmin);

router.get("/auth/me", adminAuthController.me);
router.post("/auth/change-password", adminAuthController.changePassword);

// ---- Catalogue ------------------------------------------------------------------
router.get("/products", can("products.manage", "dashboard.view"), productController.listProducts);
router.post("/products", can("products.manage"), productController.createProduct);
router.patch("/products/:id", can("products.manage"), productController.updateProduct);
router.delete("/products/:id", can("products.manage"), productController.deleteProduct);

router.post("/uploads", can("products.manage", "testimonials.manage"), uploadImages, uploadController.uploadImages);
router.post("/uploads/video", can("testimonials.manage", "products.manage"), uploadVideo, uploadController.uploadTestimonialVideo);
router.post("/uploads/product-video", can("products.manage"), uploadVideo, uploadController.uploadProductVideo);

router.get("/testimonials", can("testimonials.manage"), testimonialController.listAllTestimonials);
router.post("/testimonials", can("testimonials.manage"), testimonialController.createTestimonial);
router.patch("/testimonials/:id", can("testimonials.manage"), testimonialController.updateTestimonial);
router.delete("/testimonials/:id", can("testimonials.manage"), testimonialController.deleteTestimonial);

router.get("/promotions", can("promotions.manage"), promotionController.listPromotions);
router.post("/promotions", can("promotions.manage"), promotionController.createPromotion);
router.patch("/promotions/:id", can("promotions.manage"), promotionController.updatePromotion);
router.delete("/promotions/:id", can("promotions.manage"), promotionController.deletePromotion);

// ---- Orders & payments ---------------------------------------------------------------
// dashboard.view alone receives orders with customer details redacted.
router.get("/orders", can("orders.view", "dashboard.view"), orderController.listOrders);
router.patch("/orders/:id/status", can("orders.manage"), orderController.updateOrderStatus);
router.patch("/orders/:id/payment", can("payments.verify"), orderController.updatePaymentVerification);
router.post("/orders/:id/mpesa-request", can("payments.verify"), orderController.requestMpesaPayment);
router.get("/orders/:id/payments", can("orders.view"), orderController.listOrderPayments);

router.get("/customers", can("customers.view"), customerAuthController.listCustomers);

// ---- Store settings ------------------------------------------------------------------
router.get("/settings", can("settings.manage"), siteSettingsController.getSettings);
router.get("/settings/previous", can("settings.manage"), siteSettingsController.getPreviousSettings);
router.patch("/settings", can("settings.manage"), siteSettingsController.updateSettings);
router.post("/settings/reset-previous", can("settings.manage"), siteSettingsController.resetPreviousSettings);

// ---- Integrations, security & marketing --------------------------------------------
router.get("/integrations", can("integrations.manage"), integrationsController.listIntegrations);
router.patch("/integrations/:key", can("integrations.manage"), integrationsController.updateIntegration);
router.post("/integrations/:key/test", can("integrations.manage"), integrationsController.testIntegration);

router.get("/marketing/overview", can("marketing.view"), marketingController.overview);
router.get("/marketing/events", can("marketing.view"), marketingController.listEvents);
router.get("/marketing/leads", can("marketing.view"), marketingController.listLeads);
router.patch("/marketing/leads/:id", can("marketing.view"), marketingController.updateLead);

// ---- Team & access -------------------------------------------------------------------
router.get("/admins", can("team.view", "team.manage"), adminAuthController.listAdmins);
router.post("/admins", can("team.manage"), adminAuthController.inviteAdmin);
router.patch("/admins/:id", can("team.manage"), adminAuthController.updateAdmin);
router.delete("/admins/:id", can("team.manage"), adminAuthController.deleteAdmin);
router.post("/admins/:id/reset-password", can("team.manage"), adminAuthController.resetAdminPassword);
router.post("/admins/:id/revoke-sessions", can("team.manage"), adminAuthController.revokeAdminSessions);

router.get("/roles", can("team.view", "team.manage", "roles.manage"), accessController.listRoles);
router.post("/roles", can("roles.manage"), accessController.createRole);
router.patch("/roles/:key", can("roles.manage"), accessController.updateRole);
router.delete("/roles/:key", can("roles.manage"), accessController.deleteRole);

router.get("/audit-logs", can("audit.view"), auditController.listRecent);

module.exports = router;
