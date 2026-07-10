const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const adminCatalogRoutes = require('./routes/adminCatalogRoutes');
const adminSettingsRoutes = require('./routes/adminSettingsRoutes');
const statsRoutes = require('./routes/statsRoutes');
const tagRoutes = require('./routes/tagRoutes');
const questionRoutes = require('./routes/questionRoutes');
const mockBoardExamRoutes = require('./routes/mockBoardExamRoutes');
const importRoutes = require('./routes/importRoutes');
const studentExamRoutes = require('./routes/studentExamRoutes');
const alumniExamRoutes = require('./routes/alumniExamRoutes');
const mockExamResultRoutes = require('./routes/mockExamResultRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const sseRoutes = require('./routes/sseRoutes');

const app = express();

app.set('trust proxy', 1);

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = [process.env.CLIENT_URL, 'http://localhost:5173'].filter(Boolean);

        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);

        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    optionsSuccessStatus: 200,
}));
app.use(cookieParser());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/admin/catalog', adminCatalogRoutes);
app.use('/api/admin/settings', adminSettingsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/mock-board-exams', mockBoardExamRoutes);
app.use('/api/import', importRoutes);
app.use('/api/student-exams', studentExamRoutes);
app.use('/api/alumni-exams', alumniExamRoutes);
app.use('/api/mock-exam-results', mockExamResultRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/sse', sseRoutes);

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
