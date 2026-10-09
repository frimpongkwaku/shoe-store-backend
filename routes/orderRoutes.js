const express = require("express");
const { rateLimit } = require("express-rate-limit");
const protect = require("../middleware/authMiddleware");
const adminOnly = require("../middleware/adminMiddleware");
const { createOrder, getTrackedOrder, getAdminOrders, updateOrderStatus } = require("../controllers/orderController");
const { listCustomerMessages, createCustomerMessage, listAdminMessages, createAdminMessage, markAdminMessagesRead } = require("../controllers/orderMessageController");

const router = express.Router();

const privateOrderLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 40,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: { message: "Too many order requests. Please try again later." }
});

router.post("/", privateOrderLimiter, createOrder);
router.get("/track/:invoice", privateOrderLimiter, getTrackedOrder);
router.get("/admin", protect, adminOnly, getAdminOrders);
router.patch("/admin/:id/status", protect, adminOnly, updateOrderStatus);
router.get("/admin/messages", protect, adminOnly, listAdminMessages);
router.get("/admin/:invoice/messages", protect, adminOnly, listAdminMessages);
router.post("/admin/:invoice/messages", protect, adminOnly, createAdminMessage);
router.patch("/admin/:invoice/messages/read", protect, adminOnly, markAdminMessagesRead);
router.get("/:invoice/messages", privateOrderLimiter, listCustomerMessages);
router.post("/:invoice/messages", privateOrderLimiter, createCustomerMessage);

module.exports = router;