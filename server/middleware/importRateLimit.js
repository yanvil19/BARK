const { rateLimit } = require('express-rate-limit');

const HOURLY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

const HOURLY_MAX = parseInt(process.env.IMPORT_USER_HOURLY_LIMIT || '5', 10);
const DAILY_MAX = parseInt(process.env.IMPORT_USER_DAILY_LIMIT || '20', 10);

// In-memory sliding window store for user upload timestamps: userId -> [timestamp, ...]
const userUploadTimestamps = new Map();

function cleanOldTimestamps(userId, now = Date.now()) {
    const timestamps = userUploadTimestamps.get(userId) || [];
    const valid = timestamps.filter(t => now - t < DAILY_WINDOW_MS);
    if (valid.length === 0) {
        userUploadTimestamps.delete(userId);
        return [];
    }
    userUploadTimestamps.set(userId, valid);
    return valid;
}

function getUserImportLimits(userId) {
    if (!userId) {
        return {
            hourly: { used: 0, max: HOURLY_MAX, remaining: HOURLY_MAX, resetAt: null, resetInSeconds: 0 },
            daily: { used: 0, max: DAILY_MAX, remaining: DAILY_MAX, resetAt: null, resetInSeconds: 0 },
            isLimitReached: false,
            earliestResetAt: null,
        };
    }

    const now = Date.now();
    const timestamps = cleanOldTimestamps(userId, now);

    const hourlyTimestamps = timestamps.filter(t => now - t < HOURLY_WINDOW_MS);
    const dailyTimestamps = timestamps;

    const hourlyUsed = hourlyTimestamps.length;
    const dailyUsed = dailyTimestamps.length;

    const hourlyRemaining = Math.max(0, HOURLY_MAX - hourlyUsed);
    const dailyRemaining = Math.max(0, DAILY_MAX - dailyUsed);

    // Hourly reset time is based on the oldest timestamp within the current 1-hour window
    let hourlyResetAt = null;
    let hourlyResetInSeconds = 0;
    if (hourlyTimestamps.length > 0) {
        const oldestHourly = Math.min(...hourlyTimestamps);
        const resetTime = oldestHourly + HOURLY_WINDOW_MS;
        hourlyResetAt = new Date(resetTime).toISOString();
        hourlyResetInSeconds = Math.max(0, Math.ceil((resetTime - now) / 1000));
    }

    // Daily reset time is based on the oldest timestamp within the 24-hour window
    let dailyResetAt = null;
    let dailyResetInSeconds = 0;
    if (dailyTimestamps.length > 0) {
        const oldestDaily = Math.min(...dailyTimestamps);
        const resetTime = oldestDaily + DAILY_WINDOW_MS;
        dailyResetAt = new Date(resetTime).toISOString();
        dailyResetInSeconds = Math.max(0, Math.ceil((resetTime - now) / 1000));
    }

    const isHourlyReached = hourlyRemaining <= 0;
    const isDailyReached = dailyRemaining <= 0;
    const isLimitReached = isHourlyReached || isDailyReached;

    let earliestResetAt = null;
    if (isHourlyReached && isDailyReached) {
        earliestResetAt = hourlyResetInSeconds <= dailyResetInSeconds ? hourlyResetAt : dailyResetAt;
    } else if (isHourlyReached) {
        earliestResetAt = hourlyResetAt;
    } else if (isDailyReached) {
        earliestResetAt = dailyResetAt;
    }

    return {
        hourly: {
            used: hourlyUsed,
            max: HOURLY_MAX,
            remaining: hourlyRemaining,
            resetAt: hourlyResetAt,
            resetInSeconds: hourlyResetInSeconds,
        },
        daily: {
            used: dailyUsed,
            max: DAILY_MAX,
            remaining: dailyRemaining,
            resetAt: dailyResetAt,
            resetInSeconds: dailyResetInSeconds,
        },
        isLimitReached,
        earliestResetAt,
    };
}

function recordUserImport(userId) {
    if (!userId) return;
    const now = Date.now();
    const timestamps = cleanOldTimestamps(userId, now);
    timestamps.push(now);
    userUploadTimestamps.set(userId, timestamps);
}

// User limit middleware
const userImportLimiter = (req, res, next) => {
    const userId = req.user?._id?.toString();
    if (!userId) return next();

    const limits = getUserImportLimits(userId);
    if (limits.isLimitReached) {
        const resetDate = limits.earliestResetAt ? new Date(limits.earliestResetAt) : null;
        const timeStr = resetDate ? resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon';
        return res.status(429).json({
            error: `Upload limit reached. You can upload again at ${timeStr}.`,
            limits,
        });
    }
    next();
};

// Global daily limit: 200 Gemini calls per day
const geminiDailyLimiter = rateLimit({
    keyGenerator: () => 'global_gemini_calls',
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: parseInt(process.env.GEMINI_RPD_LIMIT || '200', 10),
    message: 'The import service has reached its daily limit. Please try again tomorrow.',
    standardHeaders: false,
    legacyHeaders: false,
});

// Global per-minute limit: 8 Gemini calls per minute
const geminiMinuteLimiter = rateLimit({
    keyGenerator: () => 'global_gemini_calls',
    windowMs: 60 * 1000, // 1 minute
    max: parseInt(process.env.GEMINI_RPM_LIMIT || '8', 10),
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
            error: 'You already have an import processing. Please wait for it to finish.'
        });
    }
    next();
};

const markImportStart = (userId) => activeImports.set(userId, true);
const markImportEnd = (userId) => activeImports.delete(userId);

module.exports = {
    userImportLimiter,
    getUserImportLimits,
    recordUserImport,
    geminiDailyLimiter,
    geminiMinuteLimiter,
    concurrentImportLimiter,
    markImportStart,
    markImportEnd,
};
