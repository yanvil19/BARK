const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const adminCatalogRoutes = require('./routes/adminCatalogRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.get('/health', async (req, res) => {
    const readyState = mongoose.connection.readyState; // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting

    if (readyState !== 1) {
        return res.status(503).json({ ok: false, db: { readyState } });
    }

    try {
        await mongoose.connection.db.admin().ping();
        return res.json({ ok: true, db: { readyState, ping: 'ok' } });
    } catch (err) {
        return res.status(500).json({ ok: false, db: { readyState, ping: 'failed' } });
    }
});

module.exports = app;
