const { rateLimit } = require('express-rate-limit');

// Per-user hourly limit: 10 imports per hour
const importHourlyLimiter = rateLimit({
    keyGenerator: (req) => req.user?._id?.toString() || ipKeyGenerator(req.ip),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: parseInt(process.env.IMPORT_USER_HOURLY_LIMIT || '15'),
    message: 'You have reached your hourly import limit. Please try again later.',
    standardHeaders: false,
    legacyHeaders: false,
    skip: (req) => !req.user,
});

// Global daily limit: 200 Gemini calls per day
const geminiDailyLimiter = rateLimit({
    keyGenerator: () => 'global_gemini_calls',
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: parseInt(process.env.GEMINI_RPD_LIMIT || '200'),
    message: 'The import service has reached its daily limit. Please try again tomorrow.',
    standardHeaders: false,
    legacyHeaders: false,
});

// Global per-minute limit: 8 Gemini calls per minute
const geminiMinuteLimiter = rateLimit({
    keyGenerator: () => 'global_gemini_calls',
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.GEMINI_RPM_LIMIT || '8'),
    message: 'Rate limited - please try again in a moment.',
    standardHeaders: false,
    legacyHeaders: false,
});

// Concurrent import limiter: max 1 active import per user (in-memory)
const activeImports = new Map();

const concurrentImportLimiter = (req, res, next) => {
    const userId = req.user?._id?.toString();
    if (!userId) return next();

    if (activeImports.get(userId)) {
        return res.status(429).json({
            message: 'You already have an import processing. Please wait for it to finish.'
        });
    }
    next();
};

const markImportStart = (userId) => activeImports.set(userId, true);
const markImportEnd = (userId) => activeImports.delete(userId);

module.exports = {
    importHourlyLimiter,
    geminiDailyLimiter,
    geminiMinuteLimiter,
    concurrentImportLimiter,
    markImportStart,
    markImportEnd,
};