// Limits for the AI question import. The counts and the lock live in MongoDB
// (services/importStateService.js), so they hold across restarts and server
// instances.
const {
    getUserImportLimits,
    getGeminiLimitError,
    acquireImportLock,
    releaseImportLock,
} = require('../services/importStateService');

// Per-user hourly (IMPORT_USER_HOURLY_LIMIT, default 8) and daily
// (IMPORT_USER_DAILY_LIMIT, default 20) import limit
const userImportLimiter = async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) return next();

    try {
        const limits = await getUserImportLimits(userId);
        if (limits.isLimitReached) {
            const resetDate = limits.earliestResetAt ? new Date(limits.earliestResetAt) : null;
            const timeStr = resetDate ? resetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon';
            return res.status(429).json({
                error: `Upload limit reached. You can upload again at ${timeStr}.`,
                limits,
            });
        }
        return next();
    } catch (err) {
        return next(err);
    }
};

// Turns a request away early when no Gemini request can be sent right now
// (GEMINI_RPM_LIMIT per minute, default 8; GEMINI_RPD_LIMIT per day, default 200).
// Every request to Gemini, retries included, is also counted when it is sent
// (reserveGeminiCall in geminiService), so the limits are never exceeded.
const geminiLimiter = async (req, res, next) => {
    try {
        const message = await getGeminiLimitError();
        if (message) return res.status(429).json({ error: message });
        return next();
    } catch (err) {
        return next(err);
    }
};

// One import at a time per user. The lock is released when the response ends.
const concurrentImportLimiter = async (req, res, next) => {
    const userId = req.user?._id;
    if (!userId) return next();

    try {
        const lockId = await acquireImportLock(userId);
        if (!lockId) {
            return res.status(429).json({
                error: 'You already have an import processing. Please wait for it to finish.'
            });
        }

        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            releaseImportLock(userId, lockId).catch((err) => console.error('Failed to release import lock:', err));
        };
        res.on('finish', release);
        res.on('close', release);
        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = {
    userImportLimiter,
    geminiLimiter,
    concurrentImportLimiter,
};
