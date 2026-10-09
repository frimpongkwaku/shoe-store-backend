const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
    invoice: { type: String, required: true, unique: true, trim: true, index: true },
    customer: {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        email: { type: String, trim: true, default: "" },
        address: { type: String, trim: true, default: "" }
    },
    delivery: { type: String, default: "Not specified" },
    payment: { type: String, default: "Not specified" },
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
    status: { type: String, enum: ["New", "Confirmed", "Preparing", "Completed", "Cancelled"], default: "New" },
    channel: { type: String, default: "WhatsApp" },
    trackingTokenHash: { type: String, select: false }
}, { timestamps: true });

module.exports = mongoose.model("Order", orderSchema);