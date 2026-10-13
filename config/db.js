const mongoose = require("mongoose");
const dns = require("node:dns/promises");

async function resolveTxtOverHttps(hostname) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=TXT`, {
        headers: { Accept: "application/dns-json" }
    });
    if (!response.ok) throw new Error(`DNS-over-HTTPS TXT lookup failed (${response.status}).`);
    const result = await response.json();
    return (result.Answer || []).map(answer => {
        try {
            return JSON.parse(answer.data);
        } catch {
            return answer.data.replace(/^"|"$/g, "");
        }
    });
}

async function resolveMongoSrvUri(uri) {
    const match = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/?]+)(\/[^?]*)?(?:\?(.*))?$/);
    if (!match) throw new Error("The MongoDB Atlas connection string is invalid.");

    const [, credentials, hostname, database = "/", query = ""] = match;
    const records = await dns.resolveSrv(`_mongodb._tcp.${hostname}`);
    let txtRecords;
    try {
        txtRecords = (await dns.resolveTxt(hostname)).map(parts => parts.join(""));
    } catch {
        txtRecords = await resolveTxtOverHttps(hostname);
    }

    const options = new URLSearchParams(txtRecords.join("&"));
    new URLSearchParams(query).forEach((value, key) => options.set(key, value));
    if (!options.has("tls") && !options.has("ssl")) options.set("tls", "true");

    const hosts = records.map(record => `${record.name.replace(/\.$/, "")}:${record.port}`).join(",");
    return `mongodb://${credentials}@${hosts}${database}?${options.toString()}`;
}

const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error("MONGO_URI is not configured.");
        const connectionString = uri?.startsWith("mongodb+srv://")
            ? await resolveMongoSrvUri(uri)
            : uri;
        await mongoose.connect(connectionString);

        console.log("MongoDB connected successfully");
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        throw error;
    }
};

module.exports = connectDB;