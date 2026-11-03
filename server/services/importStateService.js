// State of the AI question import, kept in MongoDB rather than server memory so
// it survives restarts and is shared by every server instance:
//   - import sessions: the file text between the count and extract steps
//   - per-user import limits (hourly and daily)
//   - global Gemini limits (per minute and per day), counted per request sent
//   - a per-user lock, so a user runs one import at a time

const crypto = require('crypto');
const ImportSession = require('../models/ImportSession');
const ImportUsage = require('../models/ImportUsage');
const ImportLock = require('../models/ImportLock');
const { encryptText, decryptText } = require('./encryptionService');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SESSION_TTL_MS = 10 * MINUTE_MS;
const LOCK_TTL_MS = 5 * MINUTE_MS;

// Limits are read when used, so a changed environment value applies right away
function readLimit(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const userHourlyMax = () => readLimit('IMPORT_USER_HOURLY_LIMIT', 8);
const userDailyMax = () => readLimit('IMPORT_USER_DAILY_LIMIT', 20);
const geminiMinuteMax = () => readLimit('GEMINI_RPM_LIMIT', 8);
const geminiDailyMax = () => readLimit('GEMINI_RPD_LIMIT', 200);

// ── Import sessions ─────────────────────────────────────────────────────────

async function saveImportSession({ userId, text, questionCount }) {
  const token = crypto.randomBytes(24).toString('hex');
  await ImportSession.create({
    token,
    user: userId,
    text: encryptText(text),
    questionCount,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

// Returns { text, questionCount } for the user's unexpired session, or null
async function getImportSession(token, userId) {
  if (typeof token !== 'string' || !token) return null;
  const session = await ImportSession.findOne({
    token,
    user: userId,
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!session) return null;
  return { text: decryptText(session.text), questionCount: session.questionCount };
}

async function deleteImportSession(token) {
  if (typeof token !== 'string' || !token) return;
  await ImportSession.deleteOne({ token });
}

// ── Per-user import limits ──────────────────────────────────────────────────

function windowLimits(timestamps, max, windowMs, now) {
  const used = timestamps.length;
  let resetAt = null;
  let resetInSeconds = 0;
  if (used > 0) {
    const resetTime = Math.min(...timestamps) + windowMs;
    resetAt = new Date(resetTime).toISOString();
    resetInSeconds = Math.max(0, Math.ceil((resetTime - now) / 1000));
  }
  return { used, max, remaining: Math.max(0, max - used), resetAt, resetInSeconds };
}

async function getUserImportLimits(userId) {
  const hourlyMax = userHourlyMax();
  const dailyMax = userDailyMax();

  if (!userId) {
    return {
      hourly: { used: 0, max: hourlyMax, remaining: hourlyMax, resetAt: null, resetInSeconds: 0 },
      daily: { used: 0, max: dailyMax, remaining: dailyMax, resetAt: null, resetInSeconds: 0 },
      isLimitReached: false,
      earliestResetAt: null,
    };
  }

  const now = Date.now();
  const events = await ImportUsage.find({
    kind: 'import',
    user: userId,
    createdAt: { $gt: new Date(now - DAY_MS) },
  }).select('createdAt').lean();

  const daily = events.map((e) => new Date(e.createdAt).getTime());
  const hourly = daily.filter((t) => now - t < HOUR_MS);

  const hourlyLimits = windowLimits(hourly, hourlyMax, HOUR_MS, now);
  const dailyLimits = windowLimits(daily, dailyMax, DAY_MS, now);
  const isHourlyReached = hourlyLimits.remaining <= 0;
  const isDailyReached = dailyLimits.remaining <= 0;

  let earliestResetAt = null;
  if (isHourlyReached && isDailyReached) {
    earliestResetAt = hourlyLimits.resetInSeconds <= dailyLimits.resetInSeconds
      ? hourlyLimits.resetAt
      : dailyLimits.resetAt;
  } else if (isHourlyReached) {
    earliestResetAt = hourlyLimits.resetAt;
  } else if (isDailyReached) {
    earliestResetAt = dailyLimits.resetAt;
  }

  return {
    hourly: hourlyLimits,
    daily: dailyLimits,
    isLimitReached: isHourlyReached || isDailyReached,
    earliestResetAt,
  };
}

async function recordUserImport(userId) {
  if (!userId) return;
  await ImportUsage.create({ kind: 'import', user: userId });
}

// ── Global Gemini limits ────────────────────────────────────────────────────

const GEMINI_MINUTE_MESSAGE = 'The import service is busy. Please try again in a minute.';
const GEMINI_DAILY_MESSAGE = 'The import service has reached its daily limit. Please try again tomorrow.';

class GeminiLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GeminiLimitError';
    this.status = 429;
  }
}

async function countGeminiCalls() {
  const now = Date.now();
  const [lastMinute, lastDay] = await Promise.all([
    ImportUsage.countDocuments({ kind: 'gemini_call', createdAt: { $gt: new Date(now - MINUTE_MS) } }),
    ImportUsage.countDocuments({ kind: 'gemini_call', createdAt: { $gt: new Date(now - DAY_MS) } }),
  ]);
  return { lastMinute, lastDay };
}

function geminiLimitMessage({ lastMinute, lastDay }) {
  if (lastDay >= geminiDailyMax()) return GEMINI_DAILY_MESSAGE;
  if (lastMinute >= geminiMinuteMax()) return GEMINI_MINUTE_MESSAGE;
  return null;
}

// The message to show when no Gemini request can be sent right now, else null
async function getGeminiLimitError() {
  return geminiLimitMessage(await countGeminiCalls());
}

// Counts one Gemini request before it is sent. Throws GeminiLimitError when the
// per-minute or daily limit is used up. The request is recorded first and then
// the window is counted, so two servers at the limit cannot both get through.
async function reserveGeminiCall() {
  const event = await ImportUsage.create({ kind: 'gemini_call' });
  const counts = await countGeminiCalls();
  const message = geminiLimitMessage({ lastMinute: counts.lastMinute - 1, lastDay: counts.lastDay - 1 });
  if (message) {
    await ImportUsage.deleteOne({ _id: event._id });
    throw new GeminiLimitError(message);
  }
}

// ── One import at a time per user ───────────────────────────────────────────

// Returns a lock id when the lock was taken, or null when the user already has
// an import in progress. An expired lock is taken over.
async function acquireImportLock(userId) {
  await ImportLock.init(); // the unique index on user must exist for this to be atomic
  const lockId = crypto.randomUUID();
  const now = new Date();
  try {
    await ImportLock.findOneAndUpdate(
      { user: userId, expiresAt: { $lte: now } },
      { $set: { lockId, expiresAt: new Date(now.getTime() + LOCK_TTL_MS) } },
      { upsert: true }
    );
    return lockId;
  } catch (err) {
    if (err?.code === 11000) return null; // an unexpired lock exists
    throw err;
  }
}

async function releaseImportLock(userId, lockId) {
  await ImportLock.deleteOne({ user: userId, lockId });
}

module.exports = {
  saveImportSession,
  getImportSession,
  deleteImportSession,
  getUserImportLimits,
  recordUserImport,
  GeminiLimitError,
  getGeminiLimitError,
  reserveGeminiCall,
  acquireImportLock,
  releaseImportLock,
};
