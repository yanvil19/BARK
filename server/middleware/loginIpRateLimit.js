const { ipKeyGenerator } = require('express-rate-limit');

// IP-based login flood guard (anti-spraying layer) for POST /api/auth/login.
//
// A computer lab, or a whole campus, usually reaches the server from one public
// IP address, so this has to tell a room full of students signing in apart from
// one attacker trying passwords against many accounts. Two checks per IP:
//
//   Failed logins  Wrong passwords and unknown emails, counted over a fixed
//                  15-minute window that starts with the first counted event.
//                  An IP may fail BASE_FAILED_LIMIT times, plus once more for
//                  every different account that signed in successfully from it
//                  in the same window. A lab where 180 students got in can absorb
//                  230 typos, while an attacker with no working password still
//                  stops at 50. Counting different accounts rather than sign-ins
//                  means signing in to one account over and over earns nothing.
//                  The login controller reports outcomes with
//                  recordFailedLogin(req) and recordSuccessfulLogin(req, userId).
//
//   In progress    Login requests still being handled. A failure is only known
//                  after the slow password check, so this stops a burst of
//                  guesses from all getting through before any of them is
//                  counted. Each request frees its place as soon as its response
//                  is sent, whatever the outcome.
//
// Guessing one account's password is handled separately by the per-account
// lockout inside loginUser. Counts live in this process's memory and reset when
// the server restarts. req.ip resolves to the client's address because app.js
// sets `trust proxy 1`.

const WINDOW_MS = 15 * 60 * 1000;
const BASE_FAILED_LIMIT = 50;
// Room for a few hundred people signing in at the same moment from one network
const IN_PROGRESS_LIMIT = 300;
const BUSY_RETRY_AFTER_SECONDS = 10;

// key -> { resetAt, failures, accounts: Set of ids of users who signed in }
const windows = new Map();
// key -> number of login requests from that IP still being handled
const inProgress = new Map();

function currentWindow(key, now) {
  const entry = windows.get(key);
  if (entry && entry.resetAt <= now) {
    windows.delete(key);
    return null;
  }
  return entry || null;
}

function openWindow(key, now = Date.now()) {
  let entry = currentWindow(key, now);
  if (!entry) {
    entry = { resetAt: now + WINDOW_MS, failures: 0, accounts: new Set() };
    windows.set(key, entry);
  }
  return entry;
}

function failedAllowance(entry) {
  return BASE_FAILED_LIMIT + entry.accounts.size;
}

// Drop expired windows now and then so the map can't grow without bound
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) if (entry.resetAt <= now) windows.delete(key);
}, WINDOW_MS);
sweep.unref();

function clientKey(req) {
  return ipKeyGenerator(req.ip || '');
}

function sendTooMany(res, retryAfterSeconds, message) {
  res.setHeader('Retry-After', String(retryAfterSeconds));
  return res.status(429).json({ message, retryAfterSeconds });
}

// Counts the request as in progress until its response is sent or the client goes away
function trackInProgress(key, res) {
  inProgress.set(key, (inProgress.get(key) || 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const left = (inProgress.get(key) || 0) - 1;
    if (left > 0) inProgress.set(key, left);
    else inProgress.delete(key);
  };
  res.once('finish', release);
  res.once('close', release);
}

function loginIpRateLimiter(req, res, next) {
  const key = clientKey(req);
  const now = Date.now();

  const entry = currentWindow(key, now);
  if (entry && entry.failures >= failedAllowance(entry)) {
    const seconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const minutes = Math.ceil(seconds / 60);
    return sendTooMany(
      res,
      seconds,
      `Too many failed login attempts from this network. Please try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
    );
  }

  if ((inProgress.get(key) || 0) >= IN_PROGRESS_LIMIT) {
    return sendTooMany(
      res,
      BUSY_RETRY_AFTER_SECONDS,
      'Too many people are signing in from this network right now. Please try again in a few seconds.'
    );
  }

  trackInProgress(key, res);
  return next();
}

// Called by loginUser after a wrong password or an unknown email
function recordFailedLogin(req) {
  openWindow(clientKey(req)).failures += 1;
}

// Called by loginUser after a correct password; each different account raises the failure allowance by one
function recordSuccessfulLogin(req, userId) {
  if (!userId) return;
  openWindow(clientKey(req)).accounts.add(String(userId));
}

function resetLoginRateLimitForTests() {
  windows.clear();
  inProgress.clear();
}

module.exports = {
  BASE_FAILED_LIMIT,
  IN_PROGRESS_LIMIT,
  loginIpRateLimiter,
  recordFailedLogin,
  recordSuccessfulLogin,
  resetLoginRateLimitForTests,
};
