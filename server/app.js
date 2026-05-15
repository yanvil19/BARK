const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const adminCatalogRoutes = require('./routes/adminCatalogRoutes');
const statsRoutes = require('./routes/statsRoutes');
const tagRoutes = require('./routes/tagRoutes');
const questionRoutes = require('./routes/questionRoutes');
const mockBoardExamRoutes = require('./routes/mockBoardExamRoutes');
const importRoutes = require('./routes/importRoutes');
const studentExamRoutes = require('./routes/studentExamRoutes');
const mockExamResultRoutes = require('./routes/mockExamResultRoutes');

const app = express();

// Set security HTTP headers
app.use(helmet());

// Global Rate Limiting: 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

app.use(cors());
app.use(express.json({ limit: '10kb' })); // Body limit to prevent large payload attacks

// Serve uploaded files (question images, etc.)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/mock-board-exams', mockBoardExamRoutes);
app.use('/api/import', importRoutes);
app.use('/api/student-exams', studentExamRoutes);
app.use('/api/mock-exam-results', mockExamResultRoutes);

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
