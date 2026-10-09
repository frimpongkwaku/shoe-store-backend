const express = require("express");
const { rateLimit } = require("express-rate-limit");
const adminOnly = require("../middleware/adminMiddleware");
const router = express.Router();

const {
    createUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    requestPasswordReset,
    resetPassword
} = require("../controllers/userController");

const protect = require("../middleware/authMiddleware");

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 12,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many authentication attempts. Please try again later." }
});

// Registration
router.post("/", authLimiter, createUser);

// Login
router.post("/login", authLimiter, loginUser);
router.post("/verify-email", authLimiter, verifyEmail);
router.post("/resend-verification", authLimiter, resendVerificationEmail);
router.post("/forgot-password", authLimiter, requestPasswordReset);
router.post("/reset-password", authLimiter, resetPassword);

// Protected test route
router.get("/protected", protect, (req, res) => {
    res.json({
        message: "You accessed a protected route!",
        user: req.user
    });
});
router.get("/admin-test", protect, adminOnly, (req, res) => {
    res.json({
        message: "Welcome to the admin area!",
        user: req.user
    });
});

module.exports = router;