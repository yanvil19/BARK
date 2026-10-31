const { rateLimit, MemoryStore } = require('express-rate-limit');

// Limits for POST /api/auth/forgot-password.
//
// Students in a lab share one public IP address, so the main limit is per email
// address: each person can ask for a reset code a few times without using up
// anyone else's allowance. The per-IP cap is only there to stop one machine from
// mailing codes to hundreds of addresses. Both run over a 15-minute window and
// count every request, registered email or not, so the responses reveal nothing
// about which emails exist. Counts live in this process's memory, like the
// login limits.

const WINDOW_MS = 15 * 60 * 1000;
const PER_EMAIL_LIMIT = 3;
const PER_IP_LIMIT = 50;

const ipStore = new MemoryStore();
const emailStore = new MemoryStore();

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

const forgotPasswordIpLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: PER_IP_LIMIT,
  store: ipStore,
  message: { message: 'Too many requests from this network. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordEmailLimiter = rateLimit({
  windowMs: WINDOW_MS,
  limit: PER_EMAIL_LIMIT,
  store: emailStore,
  keyGenerator: (req) => normalizeEmail(req.body?.email),
  // Malformed emails get the generic reply without any work, so only the IP cap applies to them
  skip: (req) => !isValidEmail(req.body?.email),
  message: { message: 'Too many reset requests for this email. Please wait a few minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function resetForgotPasswordLimitsForTests() {
  ipStore.resetAll();
  emailStore.resetAll();
}

module.exports = {
  PER_EMAIL_LIMIT,
  PER_IP_LIMIT,
  forgotPasswordIpLimiter,
  forgotPasswordEmailLimiter,
  resetForgotPasswordLimitsForTests,
};
