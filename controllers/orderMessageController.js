const crypto = require("node:crypto");
const Order = require("../models/Order");
const OrderMessage = require("../models/OrderMessage");

const hasValidTrackingToken = (provided, stored) => {
    if (!provided || !stored) return false;
    const candidate = crypto.createHash("sha256").update(provided).digest();
    const expected = Buffer.from(stored, "hex");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

const getCustomerOrder = async (req, res) => {
    const token = req.get("x-order-token") || "";
    const order = await Order.findOne({ invoice: req.params.invoice }).select("+trackingTokenHash");
    if (!order || !hasValidTrackingToken(token, order.trackingTokenHash)) {
        res.status(404).json({ message: "Order not found. Check your private tracking link." });
        return null;
    }
    return order;
};

const listCustomerMessages = async (req, res) => {
    try {
        const order = await getCustomerOrder(req, res);
        if (!order) return;
        const messages = await OrderMessage.find({ order: order._id }).sort({ createdAt: 1 }).limit(500);
        res.json({ messages });
    } catch (error) {
        console.error("Load customer order messages error:", error);
        res.status(500).json({ message: "Could not load order messages." });
    }
};

const createCustomerMessage = async (req, res) => {
    try {
        const order = await getCustomerOrder(req, res);
        if (!order) return;
        const text = String(req.body.text || "").trim();
        if (!text || text.length > 2000) return res.status(400).json({ message: "Enter a message of up to 2000 characters." });
        const message = await OrderMessage.create({
            order: order._id,
            invoice: order.invoice,
            sender: "customer",
            senderName: order.customer.name,
            text
        });
        res.status(201).json({ message });
    } catch (error) {
        console.error("Send customer order message error:", error);
        res.status(500).json({ message: "Could not send your message." });
    }
};

const listAdminMessages = async (req, res) => {
    try {
        const messages = await OrderMessage.find().sort({ createdAt: 1 }).limit(5000);
        res.json({ messages });
    } catch (error) {
        console.error("Load admin messages error:", error);
        res.status(500).json({ message: "Could not load order messages." });
    }
};

const createAdminMessage = async (req, res) => {
    try {
        const order = await Order.findOne({ invoice: req.params.invoice });
        if (!order) return res.status(404).json({ message: "Order not found." });
        const text = String(req.body.text || "").trim();
        if (!text || text.length > 2000) return res.status(400).json({ message: "Enter a message of up to 2000 characters." });
        const message = await OrderMessage.create({
            order: order._id,
            invoice: order.invoice,
            sender: "admin",
            senderName: "Helemays Support",
            text,
            read: true
        });
        res.status(201).json({ message });
    } catch (error) {
        console.error("Send admin order message error:", error);
        res.status(500).json({ message: "Could not send the reply." });
    }
};

const markAdminMessagesRead = async (req, res) => {
    try {
        await OrderMessage.updateMany({ invoice: req.params.invoice, sender: "customer", read: false }, { $set: { read: true } });
        res.json({ message: "Messages marked as read." });
    } catch (error) {
        console.error("Mark order messages read error:", error);
        res.status(500).json({ message: "Could not update message status." });
    }
};

module.exports = { listCustomerMessages, createCustomerMessage, listAdminMessages, createAdminMessage, markAdminMessagesRead };