const jwt = require("jsonwebtoken");
const User = require("../models/User");

const protect = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Authentication is required." });
        }
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            return res.status(503).json({ message: "Authentication is not configured." });
        }

        const token = authHeader.slice(7).trim();
        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "edward-shoe-store",
            audience: "shoe-store-api"
        });
        if (!decoded.id) return res.status(401).json({ message: "Authentication token is invalid or expired." });

        const user = await User.findById(decoded.id).select("_id role emailVerified tokenVersion");
        if (!user || !user.emailVerified || decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ message: "This account is not authorized to use the API." });
        }

        req.user = { id: String(user._id), role: user.role };
        return next();
    } catch (error) {
        if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
            return res.status(401).json({ message: "Authentication token is invalid or expired." });
        }
        console.error("Authentication middleware error:", error.message);
        return res.status(500).json({ message: "Could not verify access." });
    }
};

module.exports = protect;