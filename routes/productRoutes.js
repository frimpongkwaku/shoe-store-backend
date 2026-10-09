const express = require("express");

const router = express.Router();

const {
    createProduct,
    getProducts,
    getAdminProducts,
    getProduct,
    updateProduct,
    deleteProduct
} = require("../controllers/productController");

const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");


// ==========================
// PUBLIC PRODUCT ROUTES
// ==========================

// Get all available products
router.get("/", getProducts);

// Get all products, including inactive products, for administrators
router.get("/admin", protect, adminOnly, getAdminProducts);

// Get one product
router.get("/:id", getProduct);


// ==========================
// ADMIN PRODUCT ROUTES
// ==========================

// Create product
router.post(
    "/",
    protect,
    adminOnly,
    createProduct
);

// Update product
router.put(
    "/:id",
    protect,
    adminOnly,
    updateProduct
);

// Deactivate product
router.delete(
    "/:id",
    protect,
    adminOnly,
    deleteProduct
);


module.exports = router;

