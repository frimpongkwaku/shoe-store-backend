const Order = require("../models/Order");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const { sendOrderInvoice } = require("../utils/mailer");
const { normalizeInventory, buildVerifiedOrderItems } = require("../utils/orderValidation");

const hashTrackingToken = token => crypto.createHash("sha256").update(token).digest();

const trackingTokenMatches = (token, storedHash) => {
    if (!token || !storedHash) return false;
    const candidateHash = hashTrackingToken(token);
    const expectedHash = Buffer.from(storedHash, "hex");
    return candidateHash.length === expectedHash.length && crypto.timingSafeEqual(candidateHash, expectedHash);
};

const serializeOrder = order => ({
    id: String(order._id),
    invoice: order.invoice,
    createdAt: order.createdAt,
    customer: order.customer,
    delivery: order.delivery,
    payment: order.payment,
    note: order.note,
    items: order.items,
    total: order.total,
    status: order.status,
    channel: order.channel
});

const serializeTrackedOrder = order => ({
    invoice: order.invoice,
    createdAt: order.createdAt,
    delivery: order.delivery,
    payment: order.payment,
    items: order.items,
    total: order.total,
    status: order.status
});

const createOrder = async (req, res) => {
    try {
        const { invoice, customer, items, trackingToken } = req.body || {};
        const customerName = String(customer?.name || "").trim();
        const customerPhone = String(customer?.phone || "").trim();
        const customerEmail = String(customer?.email || "").trim().toLowerCase();
        const customerAddress = String(customer?.address || "").trim();
        if (typeof invoice !== "string" || !/^[a-z0-9_-]{1,64}$/i.test(invoice) || customerName.length < 2 || customerName.length > 80 || customerPhone.length < 7 || customerPhone.length > 25 || !Array.isArray(items) || !items.length || items.length > 30 || typeof trackingToken !== "string" || trackingToken.length < 32 || trackingToken.length > 256) {
            return res.status(400).json({ message: "Invoice, customer details, items, and a secure tracking token are required." });
        }
        if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
            return res.status(400).json({ message: "Enter a valid customer email address." });
        }
        const note = String(req.body.note || "").trim();
        if (note.length > 1000) return res.status(400).json({ message: "Order notes must be 1000 characters or fewer." });

        const existing = await Order.findOne({ invoice }).select("+trackingTokenHash");
        if (existing) {
            if (existing.trackingTokenHash) {
                if (!trackingTokenMatches(trackingToken, existing.trackingTokenHash)) {
                    return res.status(409).json({ message: "This invoice belongs to a different order." });
                }
            } else {
                const suppliedPhone = String(customer.phone).replace(/\D/g, "");
                const savedPhone = String(existing.customer.phone).replace(/\D/g, "");
                if (!suppliedPhone || suppliedPhone !== savedPhone) {
                    return res.status(409).json({ message: "This invoice belongs to a different order." });
                }
                existing.trackingTokenHash = hashTrackingToken(trackingToken).toString("hex");
                await existing.save();
            }
            return res.status(200).json({ order: serializeOrder(existing) });
        }

        if (items.some(item => !item || !mongoose.isValidObjectId(item.productId) || !String(item.size ?? "").trim())) {
            return res.status(400).json({ message: "Each order item must include a valid product and size." });
        }

        const productIds = [...new Set(items.map(item => String(item.productId)))];
        let order;
        let invoiceEmailSent = null;
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const catalogProducts = await Product.find({ _id: { $in: productIds } }).session(session).lean();
                const normalizedItems = buildVerifiedOrderItems(items, catalogProducts);
                const quantitiesByProduct = new Map();
                normalizedItems.forEach(item => {
                    const requested = quantitiesByProduct.get(item.productId) || new Map();
                    requested.set(item.size.toLowerCase(), (requested.get(item.size.toLowerCase()) || 0) + item.qty);
                    quantitiesByProduct.set(item.productId, requested);
                });

                for (const product of catalogProducts) {
                    const requested = quantitiesByProduct.get(String(product._id));
                    if (!requested) continue;
                    const inventory = normalizeInventory(product.sizes);
                    for (const [size, quantity] of requested) {
                        const stockEntry = inventory.find(entry => entry.size.toLowerCase() === size);
                        if (!stockEntry || stockEntry.stock < quantity) {
                            const error = new Error(`Not enough stock remains for ${product.name} in size ${stockEntry?.size || size}. Refresh your cart and try again.`);
                            error.status = 409;
                            throw error;
                        }
                        stockEntry.stock -= quantity;
                    }

                    const reservation = await Product.updateOne(
                        { _id: product._id, available: true, sizes: product.sizes },
                        { $set: { sizes: inventory } },
                        { session }
                    );
                    if (reservation.modifiedCount !== 1) {
                        const error = new Error("Inventory changed while placing your order. Refresh your cart and try again.");
                        error.status = 409;
                        throw error;
                    }
                }

                const total = normalizedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
                const [createdOrder] = await Order.create([{
                    invoice: String(invoice).trim(),
                    customer: { name: customerName, phone: customerPhone, email: customerEmail, address: customerAddress.slice(0, 300) },
                    delivery: String(req.body.delivery || "Not specified").slice(0, 80),
                    payment: String(req.body.payment || "Not specified").slice(0, 80),
                    note,
                    items: normalizedItems,
                    total,
                    channel: "Storefront",
                    trackingTokenHash: hashTrackingToken(trackingToken).toString("hex")
                }], { session });
                order = createdOrder;
            });
        } finally {
            await session.endSession();
        }

        if (customerEmail) {
            try {
                invoiceEmailSent = await sendOrderInvoice(order, trackingToken);
            } catch (emailError) {
                invoiceEmailSent = false;
                console.error("Order invoice email delivery failed:", emailError.message);
            }
        }
        res.status(201).json({ order: serializeOrder(order), invoiceEmailSent });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                message: error.message,
                ...(error.code ? { code: error.code } : {}),
                ...(error.productId ? { productId: error.productId } : {}),
                ...(error.productName ? { productName: error.productName } : {}),
                ...(Number.isFinite(error.currentPrice) ? { currentPrice: error.currentPrice } : {})
            });
        }
        if (error.code === 11000) {
            const order = await Order.findOne({ invoice: req.body.invoice }).select("+trackingTokenHash");
            if (order && trackingTokenMatches(req.body.trackingToken, order.trackingTokenHash)) {
                return res.status(200).json({ order: serializeOrder(order) });
            }
            return res.status(409).json({ message: "This invoice belongs to a different order." });
        }
        console.error("Create order error:", error);
        res.status(500).json({ message: "Could not save your order. Please try again." });
    }
};

const getTrackedOrder = async (req, res) => {
    try {
        const token = req.get("x-order-token") || "";
        const order = await Order.findOne({ invoice: req.params.invoice }).select("+trackingTokenHash");
        if (!order || !trackingTokenMatches(token, order.trackingTokenHash)) {
            return res.status(404).json({ message: "Order not found. Check your private tracking link." });
        }
        res.json({ order: serializeTrackedOrder(order) });
    } catch (error) {
        console.error("Track order error:", error);
        res.status(500).json({ message: "Failed to load order status." });
    }
};

const getAdminOrders = async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 }).limit(1000);
        res.json({ orders: orders.map(serializeOrder) });
    } catch (error) {
        console.error("Get admin orders error:", error);
        res.status(500).json({ message: "Failed to load orders." });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const validStatuses = ["New", "Confirmed", "Preparing", "Completed", "Cancelled"];
        if (!validStatuses.includes(req.body.status)) return res.status(400).json({ message: "Invalid order status." });
        const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ message: "Order not found." });
        res.json({ order: serializeOrder(order) });
    } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ message: "Failed to update order status." });
    }
};

module.exports = { createOrder, getTrackedOrder, getAdminOrders, updateOrderStatus };