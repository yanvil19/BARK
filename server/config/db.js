const mongoose = require('mongoose');
const dns = require('node:dns');

const connectDB = async () => {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
        throw new Error('MONGO_URI is not set (check server/.env)');
    }

    if (mongoUri.startsWith('mongodb+srv://')) {
        const servers = process.env.MONGO_DNS_SERVERS;
        if (servers) {
            dns.setServers(
                servers
                    .split(/[,\s]+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
            );
        }

        try {
            const u = new URL(mongoUri);
            const srvName = `_mongodb._tcp.${u.hostname}`;
            await dns.promises.resolveSrv(srvName);
        } catch (error) {
            const details = error && error.message ? error.message : String(error);
            throw new Error(
                `MongoDB SRV lookup failed (mongodb+srv). DNS servers used by Node: ${dns
                    .getServers()
                    .join(', ') || '(none)'}. Details: ${details}`
            );
        }
    }

    try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
        console.log(`MongoDB connected: ${mongoose.connection.host}`);
    } catch (error) {
        const details = error && error.message ? error.message : String(error);
        throw new Error(`MongoDB connection failed: ${details}`);
    }
};

module.exports = connectDB;
