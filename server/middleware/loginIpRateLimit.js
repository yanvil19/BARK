const { ipKeyGenerator } = require('express-rate-limit');

// IP-based login flood guard (anti-spraying layer) for POST /api/auth/login.
//
// Students on the same campus network usually share one public IP address, so
// successful logins never use up the allowance. Two limits per IP, each over a
// fixed 15-minute window that starts with the first counted attempt:
//
//   FAILED_LIMIT        wrong passwords (including unknown emails). The login
//                       controller reports these with recordFailedLogin(req).
//   UNSUCCESSFUL_LIMIT  attempts that haven't succeeded: still being checked,
//                       failed, or rejected for any other reason. A failure is
//                       only known after the slow password check, so this stops
//                       a burst of attempts from all getting through before any
//                       failure is counted. recordSuccessfulLogin(req) takes a
//                       successful attempt back off.
//
// Guessing one account's password is handled separately by the per-account
// lockout inside loginUser. Counts live in this process's memory, like the
// default express-rate-limit store, and reset when the server restarts.
// req.ip resolves to the client's address because app.js sets `trust proxy 1`.

const WINDOW_MS = 15 * 60 * 1000;
const FAILED_LIMIT = 50;
// Room for a few hundred people signing in at the same moment from one network
const UNSUCCESSFUL_LIMIT = 300;
const BUSY_RETRY_AFTER_SECONDS = 10;

function createWindowCounter() {
  const entries = new Map(); // key -> { count, resetAt }

  function current(key, now) {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= now) {
      entries.delete(key);
      return null;
    }
    return entry || null;
  }

  // Drop expired windows now and then so the map can't grow without bound
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of entries) if (entry.resetAt <= now) entries.delete(key);
  }, WINDOW_MS);
  sweep.unref();

  return {
    get: (key, now = Date.now()) => current(key, now),
    add(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry) entry.count += 1;
      else entries.set(key, { count: 1, resetAt: now + WINDOW_MS });
    },
    remove(key, now = Date.now()) {
      const entry = current(key, now);
      if (entry && entry.count > 0) entry.count -= 1;
    },
    clear: () => entries.clear(),
  };
}

const failed = createWindowCounter();
const unsuccessful = createWindowCounter();

function clientKey(req) {
  return ipKeyGenerator(req.ip || '');
}

function sendTooMany(res, retryAfterSeconds, message) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({ message, retryAfterSeconds });
}

function loginIpRateLimiter(req, res, next) {
  const key = clientKey(req);
  const now = Date.now();

  const failures = failed.get(key, now);
  if (failures && failures.count >= FAILED_LIMIT) {
    const seconds = Math.max(1, Math.ceil((failures.resetAt - now) / 1000));
    const minutes = Math.ceil(seconds / 60);
    return sendTooMany(
      res,
      seconds,
      `Too many failed login attempts from this network. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
    );
  }

  const pending = unsuccessful.get(key, now);
  if (pending && pending.count >= UNSUCCESSFUL_LIMIT) {
    return sendTooMany(
      res,
      BUSY_RETRY_AFTER_SECONDS,
      'Too many people are signing in from this network right now. Please try again in a few seconds.'
    );
  }

  unsuccessful.add(key, now);
  return next();
}

// Called by loginUser after a wrong password or an unknown email
function recordFailedLogin(req) {
  failed.add(clientKey(req));
}

// Called by loginUser after a correct password, so successful logins don't use up the allowance
function recordSuccessfulLogin(req) {
  unsuccessful.remove(clientKey(req));
}

function resetLoginRateLimitForTests() {
  failed.clear();
  unsuccessful.clear();
}

module.exports = {
  FAILED_LIMIT,
  UNSUCCESSFUL_LIMIT,
  loginIpRateLimiter,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLoginRateLimitForTests,
};
