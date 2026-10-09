const mongoose = require("mongoose");

const orderMessageSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    invoice: { type: String, required: true, index: true },
    sender: { type: String, enum: ["customer", "admin"], required: true },
    senderName: { type: String, required: true, trim: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("OrderMessage", orderMessageSchema);