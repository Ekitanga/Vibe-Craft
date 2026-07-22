const express = require("express");
const adminAuthController = require("../controllers/adminAuthController");
const customerAuthController = require("../controllers/customerAuthController");
const productController = require("../controllers/productController");
const orderController = require("../controllers/orderController");
const uploadController = require("../controllers/uploadController");
const { requireAdmin } = require("../middleware/adminAuth");
const { uploadImages } = require("../middleware/upload");

const router = express.Router();

router.post("/auth/login", adminAuthController.login);
router.post("/auth/logout", adminAuthController.logout);
router.get("/auth/me", requireAdmin, adminAuthController.me);
router.post("/auth/change-password", requireAdmin, adminAuthController.changePassword);

router.use(requireAdmin);

router.get("/products", productController.listProducts);
router.post("/products", productController.createProduct);
router.patch("/products/:id", productController.updateProduct);
router.delete("/products/:id", productController.deleteProduct);

router.post("/uploads", uploadImages, uploadController.uploadImages);

router.get("/orders", orderController.listOrders);
router.patch("/orders/:id/status", orderController.updateOrderStatus);

router.get("/admins", adminAuthController.listAdmins);
router.post("/admins", adminAuthController.inviteAdmin);

router.get("/customers", customerAuthController.listCustomers);

module.exports = router;
