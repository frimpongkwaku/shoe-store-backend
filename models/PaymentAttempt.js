const mongoose = require("mongoose");

const paymentAttemptSchema = new mongoose.Schema({
    invoice: { type: String, required: true, unique: true, trim: true, index: true },
    reference: { type: String, required: true, unique: true, trim: true, index: true },
    accessCode: { type: String, trim: true, default: "" },
    customer: {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        email: { type: String, required: true, trim: true },
        address: { type: String, trim: true, default: "" }
    },
    delivery: { type: String, required: true, trim: true },
    note: { type: String, default: "" },
    items: [{
        productId: String,
        name: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        qty: { type: Number, required: true, min: 1 },
        size: String,
        color: String
    }],
    total: { type: Number, required: true, min: 0 },
    trackingTokenHash: { type: String, required: true },
    payloadHash: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Paid", "Failed", "RefundPending", "Refunded"], default: "Pending" },
    expiresAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model("PaymentAttempt", paymentAttemptSchema);
