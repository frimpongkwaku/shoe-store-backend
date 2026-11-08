const express = require("express");
const { rateLimit } = require("express-rate-limit");
const { initializePaystack, verifyPaystack } = require("../controllers/paymentController");

const router = express.Router();
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many payment requests. Please wait and try again." }
});

router.post("/paystack/initialize", paymentLimiter, initializePaystack);
router.post("/paystack/verify", paymentLimiter, verifyPaystack);

module.exports = router;
