require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const connectDB = require("./config/db");

const userRoutes = require("./routes/userRoutes");
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");

const app = express();

const PORT = process.env.PORT || 5000;

const allowedOrigins = new Set([
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    ...(process.env.NODE_ENV === "production" ? [] : ["null"]),
    ...(process.env.CORS_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean)
]);

// Middleware
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) return callback(null, true);
        return callback(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Order-Token"],
    maxAge: 600
}));
app.use(express.json({ limit: "6mb" }));
app.use("/api", rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests. Please try again later." }
}));

// User routes
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);

// Home route
app.get("/", (req, res) => {
    res.send("Shoe Store Backend is running!");
});

app.get("/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? "ok" : "unavailable",
        database: databaseReady ? "connected" : "disconnected"
    });
});

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
        return res.status(400).json({ message: "Request body must contain valid JSON." });
    }
    if (error.message === "Origin is not allowed by CORS.") {
        return res.status(403).json({ message: "This website is not allowed to access the API." });
    }
    console.error("Unhandled request error:", error.message);
    return res.status(500).json({ message: "The request could not be completed." });
});

async function startServer() {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}

startServer().catch(error => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
});