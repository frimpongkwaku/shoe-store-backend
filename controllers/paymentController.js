const crypto = require("node:crypto");
const mongoose = require("mongoose");
const Order = require("../models/Order");
const PaymentAttempt = require("../models/PaymentAttempt");
const Product = require("../models/Product");
const { createOrder } = require("./orderController");
const { buildVerifiedOrderItems } = require("../utils/orderValidation");
const { toPesewas, transactionMatches } = require("../utils/paystack");

const hashTrackingToken = token => crypto.createHash("sha256").update(token).digest();

const trackingTokenMatches = (token, storedHash) => {
    if (!token || !storedHash) return false;
    const candidateHash = hashTrackingToken(token);
    const expectedHash = Buffer.from(storedHash, "hex");
    return candidateHash.length === expectedHash.length && crypto.timingSafeEqual(candidateHash, expectedHash);
};

const requestPaystack = async (path, body) => {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
        const error = new Error("Online payments are not configured. Please choose pay on delivery.");
        error.status = 503;
        throw error;
    }

    const response = await fetch(`https://api.paystack.co${path}`, {
        method: body ? "POST" : "GET",
        headers: {
            Authorization: `Bearer ${secretKey}`,
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== true) {
        const error = new Error(result.message || "Paystack could not process the payment request.");
        error.status = response.status >= 400 && response.status < 500 ? 422 : 502;
        throw error;
    }
    return result.data;
};

const payloadHash = payload => crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const initializePaystack = async (req, res) => {
    let attempt;
    try {
        if (!process.env.PAYSTACK_SECRET_KEY) {
            return res.status(503).json({ message: "Online payments are not configured. Please choose pay on delivery." });
        }

        const body = req.body || {};
        const invoice = String(body.invoice || "").trim();
        const customer = {
            name: String(body.customer?.name || "").trim(),
            phone: String(body.customer?.phone || "").trim(),
            email: String(body.customer?.email || "").trim().toLowerCase(),
            address: String(body.customer?.address || "").trim().slice(0, 300)
        };
        const delivery = String(body.delivery || "Pickup").trim().slice(0, 80);
        const note = String(body.note || "").trim();
        const trackingToken = body.trackingToken;
        const items = body.items;

        if (
            !/^[a-z0-9_-]{1,64}$/i.test(invoice) ||
            customer.name.length < 2 || customer.name.length > 80 ||
            customer.phone.length < 7 || customer.phone.length > 25 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email) ||
            typeof trackingToken !== "string" || trackingToken.length < 32 || trackingToken.length > 256 ||
            !Array.isArray(items) || items.length < 1 || items.length > 30 ||
            note.length > 1000
        ) {
            return res.status(400).json({ message: "Enter valid customer details and order items before paying." });
        }

        const existingAttempt = await PaymentAttempt.findOne({ invoice });
        if (existingAttempt) {
            if (
                !trackingTokenMatches(trackingToken, existingAttempt.trackingTokenHash) ||
                existingAttempt.customer.email !== customer.email
            ) {
                return res.status(409).json({ message: "This checkout invoice belongs to another customer." });
            }
            if (existingAttempt.status === "Paid") {
                return res.json({
                    reference: existingAttempt.reference,
                    alreadyPaid: true
                });
            }
        }

        const existingOrder = await Order.findOne({ invoice });
        if (existingOrder) {
            if (
                existingOrder.payment === "Paystack" &&
                existingAttempt?.reference === existingOrder.paymentReference
            ) {
                return res.json({ reference: existingAttempt.reference, alreadyPaid: true });
            }
            return res.status(409).json({ message: "An order already exists with this invoice. Restart checkout before paying." });
        }

        if (items.some(item => !item || !mongoose.isValidObjectId(item.productId) || !String(item.size ?? "").trim())) {
            return res.status(400).json({ message: "Each order item must include a valid product and size." });
        }

        const productIds = [...new Set(items.map(item => String(item.productId)))];
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const verifiedItems = buildVerifiedOrderItems(items, products);
        const total = verifiedItems.reduce((sum, item) => sum + item.price * item.qty, 0);
        const intent = {
            invoice,
            customer,
            delivery,
            note,
            items: verifiedItems,
            total
        };
        const fingerprint = payloadHash(intent);

        if (existingAttempt?.status === "Pending") {
            if (existingAttempt.payloadHash !== fingerprint) {
                return res.status(409).json({ message: "Your checkout changed. Restart checkout to create a new payment." });
            }
            if (existingAttempt.accessCode && existingAttempt.expiresAt > new Date()) {
                return res.json({
                    accessCode: existingAttempt.accessCode,
                    reference: existingAttempt.reference,
                    amount: existingAttempt.total
                });
            }
        }

        const reference = `HELEMAYS_${crypto.randomBytes(18).toString("hex")}`;
        if (existingAttempt) {
            existingAttempt.reference = reference;
            existingAttempt.accessCode = "";
            existingAttempt.customer = customer;
            existingAttempt.delivery = delivery;
            existingAttempt.note = note;
            existingAttempt.items = verifiedItems;
            existingAttempt.total = total;
            existingAttempt.payloadHash = fingerprint;
            existingAttempt.status = "Pending";
            existingAttempt.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
            attempt = await existingAttempt.save();
        } else {
            attempt = await PaymentAttempt.create({
                ...intent,
                reference,
                accessCode: "",
                trackingTokenHash: hashTrackingToken(trackingToken).toString("hex"),
                payloadHash: fingerprint,
                status: "Pending",
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
        }

        const paystackTransaction = await requestPaystack("/transaction/initialize", {
            email: customer.email,
            amount: toPesewas(total),
            currency: "GHS",
            reference,
            metadata: {
                invoice,
                customer_name: customer.name
            }
        });
        if (!paystackTransaction.access_code || paystackTransaction.reference !== reference) {
            throw new Error("Paystack returned an invalid transaction initialization response.");
        }

        attempt.accessCode = paystackTransaction.access_code;
        await attempt.save();
        return res.status(201).json({
            accessCode: attempt.accessCode,
            reference: attempt.reference,
            amount: attempt.total
        });
    } catch (error) {
        if (attempt) {
            attempt.status = "Failed";
            await attempt.save().catch(saveError => {
                console.error("Failed to mark Paystack initialization as failed:", saveError.message);
            });
        }
        if (error.status) {
            return res.status(error.status).json({
                message: error.message,
                ...(error.code ? { code: error.code } : {}),
                ...(error.productId ? { productId: error.productId } : {}),
                ...(Number.isFinite(error.currentPrice) ? { currentPrice: error.currentPrice } : {})
            });
        }
        if (error.code === 11000) {
            return res.status(409).json({ message: "Payment is already being prepared. Please try again." });
        }
        console.error("Paystack initialization error:", error);
        return res.status(502).json({ message: error.message || "Could not start your Paystack payment." });
    }
};

const verifyPaystack = async (req, res) => {
    try {
        const reference = String(req.body?.reference || "").trim();
        const trackingToken = req.body?.trackingToken;
        if (!/^HELEMAYS_[a-f0-9]{36}$/i.test(reference) || typeof trackingToken !== "string") {
            return res.status(400).json({ message: "A valid payment reference is required." });
        }

        const attempt = await PaymentAttempt.findOne({ reference });
        if (!attempt || !trackingTokenMatches(trackingToken, attempt.trackingTokenHash)) {
            return res.status(404).json({ message: "Payment attempt not found." });
        }

        if (attempt.status === "RefundPending" || attempt.status === "Refunded") {
            return res.status(409).json({
                message: attempt.status === "Refunded"
                    ? "This payment was refunded because the order could not be completed."
                    : "This payment needs store assistance. Contact support and provide your payment reference.",
                reference
            });
        }

        if (attempt.status === "Paid") {
            const order = await Order.findOne({ invoice: attempt.invoice });
            if (!order) {
                return res.status(409).json({ message: "Payment was received, but the order is still being finalized. Contact the store with your payment reference." });
            }
            return res.json({ order, invoiceEmailSent: null });
        }

        const transaction = await requestPaystack(`/transaction/verify/${encodeURIComponent(reference)}`);
        const expected = {
            reference,
            amount: toPesewas(attempt.total),
            email: attempt.customer.email
        };
        if (!transactionMatches(transaction, expected)) {
            return res.status(402).json({ message: "Paystack has not confirmed this payment. Try again or select pay on delivery." });
        }

        let orderResponse;
        let responseStatus = 200;
        const response = {
            status(status) {
                responseStatus = status;
                return this;
            },
            json(body) {
                orderResponse = body;
                return this;
            }
        };
        await createOrder({
            paymentVerified: true,
            body: {
                invoice: attempt.invoice,
                customer: attempt.customer,
                delivery: attempt.delivery,
                payment: "Paystack",
                paymentReference: reference,
                note: attempt.note,
                items: attempt.items.map(item => ({
                    productId: item.productId,
                    expectedPrice: item.price,
                    qty: item.qty,
                    size: item.size,
                    color: item.color
                })),
                trackingToken
            }
        }, response);

        if (responseStatus < 200 || responseStatus >= 300 || !orderResponse?.order) {
            try {
                await requestPaystack("/refund", { transaction: reference });
                attempt.status = "Refunded";
                await attempt.save();
                return res.status(409).json({
                    message: "Payment was received, but the order could not be completed. A refund has been requested.",
                    reference
                });
            } catch (refundError) {
                attempt.status = "RefundPending";
                await attempt.save();
                console.error("Paystack payment could not be matched to an order and automatic refund failed:", {
                    reference,
                    orderError: orderResponse?.message,
                    refundError: refundError.message
                });
                return res.status(502).json({
                    message: "Payment was received, but the order needs store assistance. Contact support and provide your payment reference.",
                    reference
                });
            }
        }

        attempt.status = "Paid";
        await attempt.save();
        return res.status(201).json(orderResponse);
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error("Paystack verification error:", error);
        return res.status(502).json({ message: "Could not verify the Paystack payment. Keep the payment reference and retry." });
    }
};

module.exports = { initializePaystack, verifyPaystack };
