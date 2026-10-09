const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        username: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        phone: {
            type: String,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        emailVerified: {
            type: Boolean,
            default: false
        },

        tokenVersion: {
            type: Number,
            default: 0
        },

        emailVerificationTokenHash: {
            type: String,
            select: false
        },

        emailVerificationExpires: {
            type: Date,
            select: false
        },

        passwordResetCodeHash: {
            type: String,
            select: false
        },

        passwordResetExpires: {
            type: Date,
            select: false
        },

        role: {
            type: String,
            enum: ["customer", "admin"],
            default: "customer"
        }
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

module.exports = User;