const { rateLimit } = require('express-rate-limit');

// IP-based login flood guard (anti-flood layer).
// Purpose : Stop high-volume spraying / credential stuffing from a single IP
//           before it ever reaches the controller or the database.
// Scope   : Applied at the route middleware level (POST /api/auth/login only).
// Window  : 15 minutes, fixed — resets automatically after the window passes.
//           No escalation; a fresh window starts once the old one expires.
// Limit   : 25 attempts per IP per window.
// Key     : req.ip  (app.js already sets `trust proxy 1`, so this resolves
//           correctly behind Render / nginx reverse proxies).
const loginIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 25,                    // 20-30 range → using 25 as the midpoint
  standardHeaders: true,      // Emit RateLimit-* headers (RFC 6585)
  legacyHeaders: false,
  message: {
    message:
      'Too many login attempts from this IP address. Please try again in 15 minutes.',
  },
});

module.exports = { loginIpRateLimiter };
