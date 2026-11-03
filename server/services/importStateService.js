// State of the AI question import, kept in MongoDB rather than server memory so
// it survives restarts and is shared by every server instance:
//   - per-user import limits (hourly and daily), and the most questions a file may hold
//   - each Gemini model's limits (per minute and per day), counted per request
//     sent, and its cooldown after Google turned a request away
//   - a per-user lock, so a user runs one import at a time

const crypto = require('crypto');
const ImportUsage = require('../models/ImportUsage');
const ImportLock = require('../models/ImportLock');
const GeminiCooldown = require('../models/GeminiCooldown');
const { getGeminiModels } = require('../config/geminiModels');
const { PACIFIC, startOfPacificDay, nextPacificMidnight } = require('../utils/pacificTime');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const LOCK_TTL_MS = 5 * MINUTE_MS;

// Limits are read when used, so a changed environment value applies right away
function readLimit(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
const userHourlyMax = () => readLimit('IMPORT_USER_HOURLY_LIMIT', 8);
const userDailyMax = () => readLimit('IMPORT_USER_DAILY_LIMIT', 20);
// The most questions one uploaded file may hold (IMPORT_MAX_QUESTIONS, default 40)
const importMaxQuestions = () => Math.max(1, readLimit('IMPORT_MAX_QUESTIONS', 40));

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
  const maxQuestions = importMaxQuestions();

  if (!userId) {
    return {
      hourly: { used: 0, max: hourlyMax, remaining: hourlyMax, resetAt: null, resetInSeconds: 0 },
      daily: { used: 0, max: dailyMax, remaining: dailyMax, resetAt: null, resetInSeconds: 0 },
      isLimitReached: false,
      earliestResetAt: null,
      maxQuestions,
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
    maxQuestions,
  };
}

async function recordUserImport(userId) {
  if (!userId) return;
  await ImportUsage.create({ kind: 'import', user: userId });
}

// ── Gemini models: limits and cooldowns ─────────────────────────────────────
// Each model in config/geminiModels.js has its own per-minute and daily limit,
// counted from the requests this server sent it. The daily count runs from
// midnight Pacific time, when Google resets its own daily quotas. A model Google
// turned away has a cooldown (GeminiCooldown) and is skipped until it ends.

const GEMINI_MINUTE_MESSAGE = 'The import service is busy. Please try again in a minute.';
const GEMINI_DAILY_MESSAGE = 'The import service has reached its daily limit. Please try again tomorrow.';

class GeminiLimitError extends Error {
  // reason: 'minute' when a model frees up within minutes, 'day' when not before
  // its daily reset (or it is unavailable or turned off)
  constructor(message, reason = 'minute') {
    super(message);
    this.name = 'GeminiLimitError';
    this.status = 429;
    this.reason = reason;
  }
}

// The error for when none of the models can take a request
function noModelAvailableError(reasons) {
  return reasons.includes('minute')
    ? new GeminiLimitError(GEMINI_MINUTE_MESSAGE, 'minute')
    : new GeminiLimitError(GEMINI_DAILY_MESSAGE, 'day');
}

async function countModelCalls(modelName, now) {
  const [lastMinute, today] = await Promise.all([
    ImportUsage.countDocuments({ kind: 'gemini_call', model: modelName, createdAt: { $gt: new Date(now - MINUTE_MS) } }),
    ImportUsage.countDocuments({ kind: 'gemini_call', model: modelName, createdAt: { $gte: startOfPacificDay(now) } }),
  ]);
  return { lastMinute, today };
}

function getActiveCooldown(modelName, now) {
  return GeminiCooldown.findOne({ model: modelName, until: { $gt: new Date(now) } }).lean();
}

const COOLDOWN_STATUS = { minute: 'cooling_down', day: 'daily_limit', unavailable: 'unavailable' };

// What a model can do right now:
//   status: 'available' | 'cooling_down' | 'daily_limit' | 'unavailable' | 'off'
//   availableAt: when it can take requests again (null when available or off)
//   source: 'google' when Google turned it away, 'limit' when this server's own
//   limit is used up
async function describeModel(model, now) {
  const dayStart = startOfPacificDay(now);
  const [minuteCalls, today, blockedToday, cooldown] = await Promise.all([
    ImportUsage.find({ kind: 'gemini_call', model: model.name, createdAt: { $gt: new Date(now - MINUTE_MS) } })
      .select('createdAt')
      .sort({ createdAt: 1 })
      .lean(),
    ImportUsage.countDocuments({ kind: 'gemini_call', model: model.name, createdAt: { $gte: dayStart } }),
    ImportUsage.countDocuments({ kind: 'gemini_call', model: model.name, outcome: 'rate_limited', createdAt: { $gte: dayStart } }),
    getActiveCooldown(model.name, now),
  ]);

  const lastMinute = minuteCalls.length;
  const minuteResetAt = lastMinute > 0 ? new Date(new Date(minuteCalls[0].createdAt).getTime() + MINUTE_MS) : null;
  const usage = { lastMinute, today, blockedToday };
  const base = { position: model.position, name: model.name, limits: { perMinute: model.rpm, perDay: model.rpd }, usage, minuteResetAt };

  if (model.rpm === 0 || model.rpd === 0) {
    return { ...base, status: 'off', availableAt: null, source: 'limit', message: 'Turned off: its limit is set to 0.' };
  }

  // When several things hold a model back, the one that lasts longest decides
  const holds = [];
  if (cooldown) {
    holds.push({ status: COOLDOWN_STATUS[cooldown.reason], availableAt: new Date(cooldown.until), source: 'google', message: cooldown.message });
  }
  if (today >= model.rpd) {
    holds.push({ status: 'daily_limit', availableAt: nextPacificMidnight(now), source: 'limit', message: 'Its daily limit on this server is used up.' });
  }
  if (lastMinute >= model.rpm) {
    holds.push({ status: 'cooling_down', availableAt: minuteResetAt, source: 'limit', message: 'Its per-minute limit on this server is used up.' });
  }
  if (holds.length === 0) return { ...base, status: 'available', availableAt: null, source: null, message: '' };

  const hold = holds.reduce((longest, next) => (next.availableAt > longest.availableAt ? next : longest));
  return { ...base, ...hold };
}

// The message to show when no Gemini model can take a request right now, else null
async function getGeminiLimitError() {
  const now = Date.now();
  const states = await Promise.all(getGeminiModels().map((model) => describeModel(model, now)));
  if (states.some((state) => state.status === 'available')) return null;
  return noModelAvailableError(states.map((state) => (state.status === 'cooling_down' ? 'minute' : 'day'))).message;
}

// Counts one request to a model before it is sent and returns its usage id.
// Throws GeminiLimitError when the model is cooling down or its per-minute or
// daily limit is used up. The request is recorded first and then the window is
// counted, so two servers at the limit cannot both get through.
async function reserveGeminiCall(model) {
  const now = Date.now();
  const cooldown = await getActiveCooldown(model.name, now);
  if (cooldown) {
    throw new GeminiLimitError(cooldown.reason === 'minute' ? GEMINI_MINUTE_MESSAGE : GEMINI_DAILY_MESSAGE, cooldown.reason === 'minute' ? 'minute' : 'day');
  }

  const event = await ImportUsage.create({ kind: 'gemini_call', model: model.name, outcome: 'pending' });
  const counts = await countModelCalls(model.name, now);
  // The counts include this request
  if (counts.today - 1 >= model.rpd) {
    await ImportUsage.deleteOne({ _id: event._id });
    throw new GeminiLimitError(GEMINI_DAILY_MESSAGE, 'day');
  }
  if (counts.lastMinute - 1 >= model.rpm) {
    await ImportUsage.deleteOne({ _id: event._id });
    throw new GeminiLimitError(GEMINI_MINUTE_MESSAGE, 'minute');
  }
  return event._id;
}

async function recordGeminiOutcome(usageId, outcome) {
  if (!usageId) return;
  await ImportUsage.updateOne({ _id: usageId }, { $set: { outcome } });
}

// Skips a model until `until` (see models/GeminiCooldown.js)
async function setModelCooldown(modelName, { reason, until, message = '' }) {
  await GeminiCooldown.findOneAndUpdate(
    { model: modelName },
    { $set: { reason, until, message, setAt: new Date() } },
    { upsert: true }
  );
}

// An import sends one request, which counts and extracts the questions (a retry
// after a passing error sends another)
const REQUESTS_PER_IMPORT = 1;

// Requests a model can still take today: none once it reached its daily limit
// (here or at Google), else what is left of its own daily limit
function remainingToday(model) {
  if (model.status === 'off' || model.status === 'daily_limit') return 0;
  return Math.max(0, model.limits.perDay - model.usage.today);
}

// All models together. A model turned off adds no capacity.
function sumModels(models) {
  const sum = (pick) => models.reduce((total, model) => total + pick(model), 0);
  const counted = models.filter((model) => model.status !== 'off');
  const remaining = sum(remainingToday);
  return {
    perMinute: counted.reduce((total, model) => total + model.limits.perMinute, 0),
    perDay: counted.reduce((total, model) => total + model.limits.perDay, 0),
    lastMinute: sum((model) => model.usage.lastMinute),
    today: sum((model) => model.usage.today),
    blockedToday: sum((model) => model.usage.blockedToday),
    remainingToday: remaining,
    requestsPerImport: REQUESTS_PER_IMPORT,
    importsLeftToday: Math.floor(remaining / REQUESTS_PER_IMPORT),
    availableModels: models.filter((model) => model.status === 'available').length,
  };
}

// Every model in the order they are tried, with its usage and status, and the
// totals across them, for the super admin's System Metrics page
async function getGeminiModelsStatus(now = Date.now()) {
  const models = await Promise.all(getGeminiModels().map((model) => describeModel(model, now)));
  const inUse = models.find((model) => model.status === 'available');
  return {
    dailyResetAt: nextPacificMidnight(now),
    dailyResetTimeZone: PACIFIC,
    activeModel: inUse ? inUse.name : null,
    totals: sumModels(models),
    models: models.map((model) => ({ ...model, inUse: model === inUse })),
  };
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
  importMaxQuestions,
  getUserImportLimits,
  recordUserImport,
  GeminiLimitError,
  noModelAvailableError,
  getGeminiLimitError,
  reserveGeminiCall,
  recordGeminiOutcome,
  setModelCooldown,
  getGeminiModelsStatus,
  acquireImportLock,
  releaseImportLock,
};
