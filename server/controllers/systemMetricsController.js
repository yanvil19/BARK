const mongoose = require('mongoose');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const requestMetrics = require('../services/requestMetrics');
const settingsManager = require('../services/settingsManager');

const DAY_MS = 24 * 60 * 60 * 1000;
const ACTIVE_NOW_MINUTES = 5;
const ACTIVITY_DAYS = 14;
const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

function resolveTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return timeZone;
  } catch {
    return 'UTC';
  }
}

// Calendar days for the activity charts are counted in the school's time zone
const ACTIVITY_TIMEZONE = resolveTimeZone(process.env.METRICS_TIMEZONE || 'Asia/Manila');
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ACTIVITY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The last `count` calendar days as "YYYY-MM-DD", oldest first
function lastDayKeys(count, now) {
  const keys = new Set();
  for (let i = count - 1; i >= 0; i -= 1) keys.add(dayKeyFormat.format(new Date(now - i * DAY_MS)));
  return [...keys];
}

function countsPerDay(Model, dateField, since) {
  return Model.aggregate([
    { $match: { [dateField]: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: ACTIVITY_TIMEZONE } },
        count: { $sum: 1 },
      },
    },
  ]);
}

function alignToDays(rows, days) {
  const byDay = new Map(rows.map((row) => [row._id, row.count]));
  return days.map((day) => byDay.get(day) || 0);
}

async function getActiveUsers(now) {
  const activeSince = new Date(now - ACTIVE_NOW_MINUTES * 60 * 1000);
  const [byRoleRaw, last24h] = await Promise.all([
    User.aggregate([
      { $match: { last_active_at: { $gte: activeSince } } },
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
    User.countDocuments({ last_active_at: { $gte: new Date(now - DAY_MS) } }),
  ]);
  const byRole = Object.fromEntries(byRoleRaw.map((row) => [row._id, row.count]));
  return {
    windowMinutes: ACTIVE_NOW_MINUTES,
    now: byRoleRaw.reduce((sum, row) => sum + row.count, 0),
    byRole,
    last24h,
  };
}

async function getActivity(now) {
  const days = lastDayKeys(ACTIVITY_DAYS, now);
  // One extra day so the oldest calendar day is complete in any time zone
  const since = new Date(now - (ACTIVITY_DAYS + 1) * DAY_MS);
  const [studentAttempts, alumniAttempts, adminActions] = await Promise.all([
    countsPerDay(StudentExamAttempt, 'startTime', since),
    countsPerDay(AlumniExamAttempt, 'startTime', since),
    countsPerDay(AuditLog, 'timestamp', since),
  ]);
  return {
    timeZone: ACTIVITY_TIMEZONE,
    days,
    examAttempts: {
      student: alignToDays(studentAttempts, days),
      alumni: alignToDays(alumniAttempts, days),
    },
    adminActions: alignToDays(adminActions, days),
  };
}

async function getDatabaseHealth() {
  const readyState = mongoose.connection.readyState;
  const health = { state: DB_STATES[readyState] || 'unknown', pingMs: null };
  if (readyState !== 1) return health;
  try {
    const startedAt = process.hrtime.bigint();
    await mongoose.connection.db.admin().ping();
    health.pingMs = Math.round((Number(process.hrtime.bigint() - startedAt) / 1e6) * 10) / 10;
  } catch {
    health.state = 'unreachable';
  }
  return health;
}

function getServerHealth() {
  const memory = process.memoryUsage();
  const toMB = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;
  const uptimeSec = Math.round(process.uptime());
  return {
    startedAt: new Date(Date.now() - uptimeSec * 1000),
    uptimeSec,
    nodeVersion: process.version,
    memory: {
      rssMB: toMB(memory.rss),
      heapUsedMB: toMB(memory.heapUsed),
      heapTotalMB: toMB(memory.heapTotal),
    },
    eventLoopDelay: requestMetrics.getEventLoopDelay(),
    cpu: requestMetrics.getCpuUsage(),
    liveConnections: settingsManager.facultyClients.size,
  };
}

// @desc    Request traffic, response times, active users, server health and recent activity
// @route   GET /api/stats/system-metrics?range=1h|24h|7d
// @access  Private (Super Admin only)
const getSystemMetrics = async (req, res) => {
  const range = req.query.range || '24h';
  if (!requestMetrics.RANGES[range]) {
    return res.status(400).json({ message: 'Range must be one of: 1h, 24h, 7d' });
  }

  try {
    const now = Date.now();
    const [requests, users, activity, database] = await Promise.all([
      requestMetrics.getRequestMetrics(range, now),
      getActiveUsers(now),
      getActivity(now),
      getDatabaseHealth(),
    ]);

    return res.status(200).json({
      generatedAt: new Date(now),
      requests,
      users,
      server: { ...getServerHealth(), database },
      activity,
    });
  } catch (error) {
    console.error('System metrics error:', error);
    return res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = { getSystemMetrics };
