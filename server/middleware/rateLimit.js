const { rateLimit: expressRateLimit } = require('express-rate-limit');

/**
 * Standardized Rate Limiter
 * Replaces custom in-memory bucket with battle-tested express-rate-limit.
 * Usage: rateLimit({ windowMs: 60_000, max: 10 })
 */
function rateLimit({ windowMs, max, message }) {
  return expressRateLimit({
    windowMs,
    max,
    message: message || 'Too many requests, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip,
  });
}

module.exports = rateLimit;

