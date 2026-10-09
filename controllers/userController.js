const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { sendVerificationEmail, sendPasswordResetCode } = require("../utils/mailer");
const dummyPasswordHash = bcrypt.hashSync(crypto.randomBytes(32).toString("hex"), 12);

const hashChallenge = value => crypto.createHash("sha256").update(value).digest("hex");
const normalizeEmail = value => String(value || "").trim().toLowerCase();
const publicUser = user => ({
    id: String(user._id),
    name: user.name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    emailVerified: user.emailVerified
});

async function issueVerificationEmail(user) {
    const token = crypto.randomBytes(32).toString("hex");
    user.emailVerificationTokenHash = hashChallenge(token);
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();
    await sendVerificationEmail(user, token);
}

const createUser = async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");
        if (name.length < 2 || name.length > 80 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ message: "Enter a valid name and email address." });
        }
        if (password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({ message: "Password must be at least 10 characters and no longer than 72 UTF-8 bytes." });
        }
        if (await User.exists({ email })) {
            return res.status(409).json({ message: "An account with that email already exists. Sign in or request a verification email." });
        }

        const user = await User.create({
            name,
            email,
            password: await bcrypt.hash(password, 12),
            emailVerified: false
        });
        try {
            await issueVerificationEmail(user);
            return res.status(201).json({ message: "Account created. Check your email for a verification link." });
        } catch (mailError) {
            console.error("Verification email delivery failed:", mailError.message);
            return res.status(201).json({
                message: "Account created, but the verification email could not be sent. Request another email to continue.",
                verificationSent: false
            });
        }
    } catch (error) {
        if (error.code === 11000) return res.status(409).json({ message: "An account with that email already exists." });
        console.error("Registration error:", error.message);
        return res.status(500).json({ message: "Registration could not be completed." });
    }
};

const loginUser = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");
        if (!email || !password) return res.status(400).json({ message: "Email and password are required." });

        const user = await User.findOne({ email });
        const passwordWithinLimit = Buffer.byteLength(password, "utf8") <= 72;
        const passwordMatch = await bcrypt.compare(passwordWithinLimit ? password : "invalid-password", user?.password || dummyPasswordHash);
        if (!passwordMatch) {
            return res.status(401).json({
                code: "INVALID_CREDENTIALS",
                message: "Email or password is incorrect. Try again or reset your password."
            });
        }
        if (!user.emailVerified) {
            return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Verify your email before signing in." });
        }
        if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
            console.error("JWT_SECRET is missing or shorter than 32 characters.");
            return res.status(503).json({ message: "Sign-in is temporarily unavailable." });
        }

        const token = jwt.sign(
            { id: String(user._id), tokenVersion: user.tokenVersion || 0 },
            process.env.JWT_SECRET,
            { expiresIn: "2h", issuer: "edward-shoe-store", audience: "shoe-store-api" }
        );
        return res.json({ message: "Sign-in successful.", token, user: publicUser(user) });
    } catch (error) {
        console.error("Sign-in error:", error.message);
        return res.status(500).json({ message: "Sign-in could not be completed." });
    }
};

const verifyEmail = async (req, res) => {
    try {
        const token = String(req.body.token || "");
        if (!/^[a-f0-9]{64}$/i.test(token)) {
            return res.status(400).json({ message: "This verification link is invalid or expired." });
        }
        const user = await User.findOne({
            emailVerificationTokenHash: hashChallenge(token),
            emailVerificationExpires: { $gt: new Date() }
        }).select("+emailVerificationTokenHash +emailVerificationExpires");
        if (!user) return res.status(400).json({ message: "This verification link is invalid or expired." });

        user.emailVerified = true;
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpires = undefined;
        await user.save();
        return res.json({ message: "Email verified. You can now sign in." });
    } catch (error) {
        console.error("Email verification error:", error.message);
        return res.status(500).json({ message: "Email verification could not be completed." });
    }
};

const resendVerificationEmail = async (req, res) => {
    const response = { message: "If an unverified account matches that email, a verification link will be sent." };
    try {
        const user = await User.findOne({ email: normalizeEmail(req.body.email), emailVerified: { $ne: true } });
        if (user) await issueVerificationEmail(user);
    } catch (error) {
        console.error("Verification resend error:", error.message);
    }
    return res.json(response);
};

const requestPasswordReset = async (req, res) => {
    const response = { message: "If an account matches that email, a reset code will be sent." };
    try {
        const user = await User.findOne({ email: normalizeEmail(req.body.email), emailVerified: true });
        if (user) {
            const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
            user.passwordResetCodeHash = hashChallenge(code);
            user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000);
            await user.save();
            try {
                await sendPasswordResetCode(user, code);
            } catch (mailError) {
                user.passwordResetCodeHash = undefined;
                user.passwordResetExpires = undefined;
                await user.save();
                console.error("Password reset email delivery failed:", mailError.message);
            }
        }
    } catch (error) {
        console.error("Password reset request error:", error.message);
    }
    return res.json(response);
};

const resetPassword = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const code = String(req.body.code || "");
        const password = String(req.body.password || "");
        if (!/^[0-9]{6}$/.test(code) || password.length < 10 || Buffer.byteLength(password, "utf8") > 72) {
            return res.status(400).json({ message: "Enter the six-digit code and a password of at least 10 characters." });
        }

        const user = await User.findOne({
            email,
            passwordResetCodeHash: hashChallenge(code),
            passwordResetExpires: { $gt: new Date() },
            emailVerified: true
        }).select("+passwordResetCodeHash +passwordResetExpires");
        if (!user) return res.status(400).json({ message: "That reset code is invalid or expired. Request a new one." });

        user.password = await bcrypt.hash(password, 12);
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        user.passwordResetCodeHash = undefined;
        user.passwordResetExpires = undefined;
        await user.save();
        return res.json({ message: "Password updated. You can now sign in." });
    } catch (error) {
        console.error("Password reset error:", error.message);
        return res.status(500).json({ message: "Password could not be updated." });
    }
};

module.exports = {
    createUser,
    loginUser,
    verifyEmail,
    resendVerificationEmail,
    requestPasswordReset,
    resetPassword
};