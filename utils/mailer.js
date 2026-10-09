const nodemailer = require("nodemailer");

let transporter;

function getTransporter() {
    if (transporter) return transporter;

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = Number(process.env.SMTP_PORT || 587);

    if (!host || !user || !pass || !process.env.SMTP_FROM) {
        throw new Error("Email delivery is not configured.");
    }

    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
    });

    return transporter;
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
}[character]));

async function sendVerificationEmail(user, token) {
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5500").replace(/\/$/, "");
    const verifyUrl = `${baseUrl}/verify-email.html?token=${encodeURIComponent(token)}`;
    const name = escapeHtml(user.name);

    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Verify your Edward Shoe Store email",
        text: `Hello ${user.name}, verify your email address: ${verifyUrl}\nThis link expires in 24 hours.`,
        html: `<p>Hello ${name},</p><p>Confirm your email address to activate your store account.</p><p><a href="${verifyUrl}">Verify email address</a></p><p>This link expires in 24 hours.</p>`
    });
}

async function sendPasswordResetCode(user, code) {
    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: user.email,
        subject: "Your Edward Shoe Store password reset code",
        text: `Your password reset code is ${code}. It expires in 15 minutes. If you did not request this, ignore this email.`,
        html: `<p>Your password reset code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 15 minutes. If you did not request this, ignore this email.</p>`
    });
}

function renderOrderInvoice(order, trackingToken = "") {
    const customerName = String(order.customer?.name || "Customer");
    const invoice = String(order.invoice || "");
    const items = (order.items || []).map(item => {
        const quantity = Number(item.qty || 0);
        const price = Number(item.price || 0);
        return {
            name: String(item.name || "Store item"),
            details: [item.color, item.size && item.size !== "N/A" ? `Size ${item.size}` : ""].filter(Boolean).join(" · "),
            quantity,
            price,
            lineTotal: quantity * price
        };
    });
    const total = Number(order.total || 0);
    const date = new Date(order.createdAt || Date.now());
    const formattedDate = Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" });
    const money = amount => `GH₵ ${amount.toFixed(2)}`;
    const safeName = escapeHtml(customerName);
    const safeInvoice = escapeHtml(invoice);
    const baseUrl = (process.env.FRONTEND_URL || "http://localhost:5500").replace(/\/$/, "");
    const trackUrl = trackingToken
        ? `${baseUrl}/orders.html?orderId=${encodeURIComponent(invoice)}#token=${encodeURIComponent(trackingToken)}`
        : "";
    const itemRows = items.map(item => `<tr>
        <td style="padding:16px 14px;border-bottom:1px solid #e8ede8;color:#20392b;font-size:14px;font-weight:700;">
            ${escapeHtml(item.name)}${item.details ? `<div style="padding-top:5px;color:#78847b;font-size:12px;font-weight:400;">${escapeHtml(item.details)}</div>` : ""}
        </td>
        <td style="padding:16px 8px;border-bottom:1px solid #e8ede8;color:#526057;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:16px 14px;border-bottom:1px solid #e8ede8;color:#20392b;font-size:13px;text-align:right;white-space:nowrap;">${money(item.lineTotal)}</td>
    </tr>`).join("");
    const textItems = items.map(item => `${item.name}${item.details ? ` (${item.details})` : ""} x ${item.quantity}: ${money(item.lineTotal)}`).join("\n");
    return {
        subject: `Your Edward Shoe Store invoice ${invoice}`,
        text: `Hello ${customerName},\n\nThank you for your order. Your invoice ${invoice} is confirmed.\nOrder date: ${formattedDate}\n\n${textItems}\n\nTotal: ${money(total)}\nDelivery: ${order.delivery || "Not specified"}\nPayment: ${order.payment || "Not specified"}${trackUrl ? `\n\nTrack your order securely: ${trackUrl}` : ""}\n\nVisit ${baseUrl} to explore the collection.`,
        html: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Order invoice ${safeInvoice}</title></head>
<body style="margin:0;padding:0;background:#f1f4f0;font-family:Arial,Helvetica,sans-serif;color:#1d2b21;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Edward Shoe Store order ${safeInvoice} is confirmed.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f4f0;padding:32px 12px;">
        <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e1e8e0;">
                <tr><td style="padding:26px 32px;background:#183d2b;color:#fffefa;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:1px;">EDWARD <span style="color:#f4d38e;">SHOE STORE</span></div>
                    <div style="margin-top:22px;color:#f4d38e;font-size:11px;font-weight:700;">ORDER CONFIRMED</div>
                    <h1 style="margin:7px 0 0;color:#ffffff;font-size:26px;line-height:1.25;">Your invoice is ready</h1>
                </td></tr>
                <tr><td style="padding:28px 32px 16px;">
                    <p style="margin:0 0 8px;color:#283b2e;font-size:16px;font-weight:700;">Hello ${safeName},</p>
                    <p style="margin:0;color:#68766c;font-size:14px;line-height:1.65;">Thank you for choosing our handcrafted footwear. We’ve received your order and included the invoice details below.</p>
                </td></tr>
                <tr><td style="padding:8px 32px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7f3;border:1px solid #e5ebe3;">
                        <tr>
                            <td style="padding:13px 15px;"><div style="color:#7a867c;font-size:10px;font-weight:700;">INVOICE</div><div style="padding-top:4px;color:#20392b;font-size:14px;font-weight:700;">${safeInvoice}</div></td>
                            <td align="right" style="padding:13px 15px;"><div style="color:#7a867c;font-size:10px;font-weight:700;">ORDER DATE</div><div style="padding-top:4px;color:#20392b;font-size:14px;font-weight:700;">${escapeHtml(formattedDate)}</div></td>
                        </tr>
                    </table>
                </td></tr>
                <tr><td style="padding:0 32px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <thead><tr style="background:#183d2b;color:#ffffff;">
                            <th align="left" style="padding:11px 14px;font-size:10px;">ITEM</th>
                            <th align="center" style="padding:11px 8px;font-size:10px;">QTY</th>
                            <th align="right" style="padding:11px 14px;font-size:10px;">AMOUNT</th>
                        </tr></thead>
                        <tbody>${itemRows}</tbody>
                    </table>
                </td></tr>
                <tr><td style="padding:18px 32px 8px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr><td style="padding:5px 0;color:#718076;font-size:13px;">Delivery</td><td align="right" style="padding:5px 0;color:#263a2d;font-size:13px;font-weight:700;">${escapeHtml(order.delivery || "Not specified")}</td></tr>
                        <tr><td style="padding:5px 0;color:#718076;font-size:13px;">Payment</td><td align="right" style="padding:5px 0;color:#263a2d;font-size:13px;font-weight:700;">${escapeHtml(order.payment || "Not specified")}</td></tr>
                        <tr><td style="padding:15px 0 5px;border-top:1px solid #e5ebe3;color:#20392b;font-size:15px;font-weight:700;">Order total</td><td align="right" style="padding:15px 0 5px;border-top:1px solid #e5ebe3;color:#183d2b;font-size:20px;font-weight:700;">${money(total)}</td></tr>
                    </table>
                </td></tr>
                <tr><td align="center" style="padding:18px 32px 30px;">
                    ${trackUrl ? `<a href="${escapeHtml(trackUrl)}" style="display:inline-block;padding:13px 20px;background:#183d2b;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none;">Track your order</a>` : ""}
                    <p style="margin:12px 0 0;"><a href="${escapeHtml(baseUrl)}" style="color:#28583c;font-size:12px;font-weight:700;text-decoration:none;">Visit the store</a></p>
                    <p style="margin:20px 0 0;color:#78847b;font-size:12px;line-height:1.6;">Need help with your order? Reply to this email and our team will be happy to assist.</p>
                </td></tr>
                <tr><td align="center" style="padding:16px 24px;background:#f5f7f3;color:#7a867c;font-size:11px;">Edward Shoe Store · Handcrafted with care</td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`
    };
}

async function sendOrderInvoice(order, trackingToken) {
    if (!order.customer?.email) return false;
    const invoice = renderOrderInvoice(order, trackingToken);
    await getTransporter().sendMail({
        from: process.env.SMTP_FROM,
        to: order.customer.email,
        subject: invoice.subject,
        text: invoice.text,
        html: invoice.html
    });
    return true;
}

module.exports = { sendVerificationEmail, sendPasswordResetCode, renderOrderInvoice, sendOrderInvoice };