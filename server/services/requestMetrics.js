const fs = require('node:fs');
const mongoose = require('mongoose');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const RequestMetric = require('../models/RequestMetric');

// Records how long every API request takes and how it ended, in memory, and
// periodically adds the totals to one RequestMetric document per minute, along
// with how much CPU the server used. Only route patterns
// ("GET /api/questions/:id") are kept, never raw URLs, query strings, or bodies.

// Upper bounds (ms) of the latency histogram buckets; one more bucket holds anything slower.
const LATENCY_BOUNDS_MS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const HIST_BUCKET_COUNT = LATENCY_BOUNDS_MS.length + 1;
const HIST_KEYS = Array.from({ length: HIST_BUCKET_COUNT }, (_, i) => `b${i}`);

const FLUSH_INTERVAL_MS = 30 * 1000;
const MINUTE_MS = 60 * 1000;
// If the database is unreachable, keep at most this many minutes in memory.
const MAX_PENDING_MINUTES = 120;
// Guards against an unexpected flood of distinct route keys in one minute.
const MAX_ROUTES_PER_MINUTE = 300;

const NO_ROUTE_KEY = '(no matching route)';
const OTHER_ROUTE_KEY = '(other routes)';

// Uptime pings and platform health checks would drown out real traffic.
const EXCLUDED_PATHS = new Set(['/', '/health']);

const RANGES = {
  '1h': { windowMs: 60 * MINUTE_MS, stepMs: MINUTE_MS },
  '24h': { windowMs: 24 * 60 * MINUTE_MS, stepMs: 15 * MINUTE_MS },
  '7d': { windowMs: 7 * 24 * 60 * MINUTE_MS, stepMs: 2 * 60 * MINUTE_MS },
};

let pending = new Map(); // minute start (ms) -> stats with a `routes` Map
let flushing = null;
let flushTimer = null;
let loopDelay = null;
let loopDelaySnapshot = null;
let cpuCapacityCores = 1;
let cpuMark = null; // CPU time and clock reading at the previous sample
let cpuSnapshot = null;

// ─── Recording ───────────────────────────────────────────────────────────────

function emptyStats() {
  return { count: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0, totalMs: 0, maxMs: 0, hist: {} };
}

function pendingMinute(now) {
  const minute = now - (now % MINUTE_MS);
  let bucket = pending.get(minute);
  if (!bucket) {
    bucket = { ...emptyStats(), cpuMs: 0, cpuCapacityMs: 0, routes: new Map() };
    pending.set(minute, bucket);
  }
  return bucket;
}

function histBucketIndex(ms) {
  const index = LATENCY_BOUNDS_MS.findIndex((bound) => ms <= bound);
  return index === -1 ? LATENCY_BOUNDS_MS.length : index;
}

function addSample(stats, status, ms, histKey) {
  stats.count += 1;
  if (status >= 500) stats.serverErrors += 1;
  else if (status >= 400) stats.clientErrors += 1;
  // "Too Many Requests": turned away by a rate limit or an account lockout. Also counted in clientErrors.
  if (status === 429) stats.rateLimited += 1;
  stats.totalMs += ms;
  if (ms > stats.maxMs) stats.maxMs = ms;
  stats.hist[histKey] = (stats.hist[histKey] || 0) + 1;
}

function mergeStats(target, source) {
  target.count += source.count;
  target.clientErrors += source.clientErrors;
  target.serverErrors += source.serverErrors;
  target.rateLimited += source.rateLimited;
  target.totalMs += source.totalMs;
  target.maxMs = Math.max(target.maxMs, source.maxMs);
  for (const [key, n] of Object.entries(source.hist)) {
    target.hist[key] = (target.hist[key] || 0) + n;
  }
}

// The matched route pattern, e.g. "GET /api/questions/:id".
function getRouteKey(req) {
  const routePath = req.route?.path;
  const baseUrl = req.baseUrl || '';
  if (typeof routePath === 'string') {
    const path = routePath === '/' && baseUrl ? baseUrl : `${baseUrl}${routePath}`;
    return `${req.method} ${path}`;
  }
  // Answered by router-level middleware (e.g. a 401 from `router.use(protect)`)
  if (baseUrl) return `${req.method} ${baseUrl}/*`;
  return NO_ROUTE_KEY;
}

function record(routeKey, status, ms, now = Date.now()) {
  const bucket = pendingMinute(now);
  const histKey = HIST_KEYS[histBucketIndex(ms)];
  addSample(bucket, status, ms, histKey);

  let key = routeKey;
  if (!bucket.routes.has(key) && bucket.routes.size >= MAX_ROUTES_PER_MINUTE) key = OTHER_ROUTE_KEY;
  let routeStats = bucket.routes.get(key);
  if (!routeStats) {
    routeStats = emptyStats();
    bucket.routes.set(key, routeStats);
  }
  addSample(routeStats, status, ms, histKey);
}

function requestMetricsMiddleware(req, res, next) {
  if (req.method === 'OPTIONS' || EXCLUDED_PATHS.has(req.path)) return next();

  const startedAt = process.hrtime.bigint();
  res.once('finish', () => {
    // Long-lived event streams would skew the response times
    const contentType = String(res.getHeader('Content-Type') || '');
    if (contentType.startsWith('text/event-stream')) return;

    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    record(getRouteKey(req), res.statusCode, ms);
  });
  next();
}

// ─── Persisting ──────────────────────────────────────────────────────────────

// MongoDB field names can't contain "." or start with "$"
function encodeRouteKey(key) {
  return key.replace(/\./g, '．').replace(/^\$/, '＄');
}

function decodeRouteKey(key) {
  return key.replace(/．/g, '.').replace(/^＄/, '$');
}

function roundMs(ms) {
  return Math.round(ms * 10) / 10;
}

function addUpdateOps(inc, max, prefix, stats) {
  inc[`${prefix}count`] = stats.count;
  if (stats.clientErrors) inc[`${prefix}clientErrors`] = stats.clientErrors;
  if (stats.serverErrors) inc[`${prefix}serverErrors`] = stats.serverErrors;
  if (stats.rateLimited) inc[`${prefix}rateLimited`] = stats.rateLimited;
  inc[`${prefix}totalMs`] = roundMs(stats.totalMs);
  max[`${prefix}maxMs`] = roundMs(stats.maxMs);
  for (const [key, n] of Object.entries(stats.hist)) inc[`${prefix}hist.${key}`] = n;
}

function buildBulkOps(batch) {
  return [...batch].map(([minute, bucket]) => {
    const inc = {};
    const max = {};
    addUpdateOps(inc, max, '', bucket);
    if (bucket.cpuCapacityMs > 0) {
      inc.cpuMs = roundMs(bucket.cpuMs);
      inc.cpuCapacityMs = roundMs(bucket.cpuCapacityMs);
    }
    for (const [routeKey, stats] of bucket.routes) {
      addUpdateOps(inc, max, `routes.${encodeRouteKey(routeKey)}.`, stats);
    }
    return {
      updateOne: {
        filter: { minute: new Date(minute) },
        update: { $inc: inc, $max: max },
        upsert: true,
      },
    };
  });
}

// Put a batch that failed to save back in front of newer data, dropping the oldest minutes if needed.
function requeue(batch) {
  for (const [minute, bucket] of batch) {
    const current = pending.get(minute);
    if (!current) {
      pending.set(minute, bucket);
      continue;
    }
    mergeStats(current, bucket);
    current.cpuMs += bucket.cpuMs;
    current.cpuCapacityMs += bucket.cpuCapacityMs;
    for (const [key, stats] of bucket.routes) {
      const existing = current.routes.get(key);
      if (existing) mergeStats(existing, stats);
      else current.routes.set(key, stats);
    }
  }
  if (pending.size > MAX_PENDING_MINUTES) {
    const minutes = [...pending.keys()].sort((a, b) => a - b);
    minutes.slice(0, pending.size - MAX_PENDING_MINUTES).forEach((minute) => pending.delete(minute));
  }
}

async function writeBatch(batch) {
  try {
    await RequestMetric.collection.bulkWrite(buildBulkOps(batch), { ordered: false });
  } catch (err) {
    console.error('Failed to save request metrics:', err.message);
    requeue(batch);
  }
}

// Saves everything recorded so far. Safe to call at any time; calls never overlap.
async function flush() {
  while (flushing) await flushing;
  if (pending.size === 0 || mongoose.connection.readyState !== 1) return;

  const batch = pending;
  pending = new Map();
  flushing = writeBatch(batch).finally(() => {
    flushing = null;
  });
  await flushing;
}

// ─── Event loop delay ────────────────────────────────────────────────────────

// The histogram records the whole time between samples, so take the sampling interval off to get the delay
const LOOP_DELAY_RESOLUTION_MS = 20;

function loopDelayMs(nanoseconds) {
  return roundMs(Math.max(0, nanoseconds / 1e6 - LOOP_DELAY_RESOLUTION_MS));
}

function readLoopDelay() {
  if (!loopDelay || !loopDelay.count) return null;
  return {
    p50Ms: loopDelayMs(loopDelay.percentile(50)),
    p99Ms: loopDelayMs(loopDelay.percentile(99)),
    maxMs: loopDelayMs(loopDelay.max),
    measuredAt: new Date(),
  };
}

// Called every flush interval, so readings cover roughly the last 30 seconds
function snapshotLoopDelay() {
  const reading = readLoopDelay();
  if (!reading) return;
  loopDelaySnapshot = reading;
  loopDelay.reset();
}

function getEventLoopDelay() {
  return loopDelaySnapshot || readLoopDelay();
}

// ─── CPU ─────────────────────────────────────────────────────────────────────

function toPercent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

function readTextFile(path) {
  try {
    return fs.readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

// The container's CPU quota in cores (Render and Docker set one), or null when there's no limit
function readCpuQuotaCores() {
  if (process.platform !== 'linux') return null;
  const v2 = readTextFile('/sys/fs/cgroup/cpu.max'); // "<quota> <period>", or "max <period>" for no limit
  if (v2) {
    const [quota, period] = v2.split(/\s+/).map(Number);
    return quota > 0 && period > 0 ? quota / period : null;
  }
  const quota = Number(readTextFile('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'));
  const period = Number(readTextFile('/sys/fs/cgroup/cpu/cpu.cfs_period_us'));
  return quota > 0 && period > 0 ? quota / period : null;
}

// How much CPU the server can use, in cores. JavaScript runs on one thread, so
// one core is the most it can keep busy even when the machine has more.
function detectCpuCapacityCores() {
  const quota = readCpuQuotaCores();
  return quota ? Math.min(quota, 1) : 1;
}

// Adds the CPU time used since the previous sample to the current minute
function sampleCpu(now = Date.now()) {
  const at = process.hrtime.bigint();
  const usage = process.cpuUsage();
  if (cpuMark) {
    const wallMs = Number(at - cpuMark.at) / 1e6;
    const cpuMs = (usage.user - cpuMark.usage.user + usage.system - cpuMark.usage.system) / 1000;
    if (wallMs > 0) {
      const capacityMs = wallMs * cpuCapacityCores;
      const bucket = pendingMinute(now);
      bucket.cpuMs += cpuMs;
      bucket.cpuCapacityMs += capacityMs;
      cpuSnapshot = { percent: toPercent(cpuMs, capacityMs), measuredAt: new Date(now) };
    }
  }
  cpuMark = { usage, at };
}

// CPU use over roughly the last 30 seconds, as a percentage of what the server can use
function getCpuUsage() {
  return {
    capacityCores: cpuCapacityCores,
    percent: cpuSnapshot ? cpuSnapshot.percent : null,
    measuredAt: cpuSnapshot ? cpuSnapshot.measuredAt : null,
  };
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

function start() {
  if (flushTimer) return;
  loopDelay = monitorEventLoopDelay({ resolution: LOOP_DELAY_RESOLUTION_MS });
  loopDelay.enable();
  cpuCapacityCores = detectCpuCapacityCores();
  sampleCpu();
  flushTimer = setInterval(() => {
    snapshotLoopDelay();
    sampleCpu();
    flush().catch(() => {});
  }, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

function stop() {
  if (flushTimer) clearInterval(flushTimer);
  flushTimer = null;
  if (loopDelay) loopDelay.disable();
  loopDelay = null;
}

function resetForTests() {
  pending = new Map();
  flushing = null;
  loopDelaySnapshot = null;
  cpuMark = null;
  cpuSnapshot = null;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

// Estimates a percentile from histogram counts by interpolating inside the bucket it falls in.
function percentileFromHist(hist = {}, fraction, maxMs = 0) {
  const counts = HIST_KEYS.map((key) => Number(hist[key]) || 0);
  const total = counts.reduce((sum, n) => sum + n, 0);
  if (!total) return null;

  const target = fraction * total;
  let cumulative = 0;
  for (let i = 0; i < counts.length; i += 1) {
    const n = counts[i];
    if (n > 0 && cumulative + n >= target) {
      const lower = i === 0 ? 0 : LATENCY_BOUNDS_MS[i - 1];
      const upper = i < LATENCY_BOUNDS_MS.length ? LATENCY_BOUNDS_MS[i] : Math.max(maxMs, lower);
      const estimate = lower + (upper - lower) * ((target - cumulative) / n);
      return roundMs(maxMs > 0 ? Math.min(estimate, maxMs) : estimate);
    }
    cumulative += n;
  }
  return roundMs(maxMs);
}

function histSumFields(path) {
  return Object.fromEntries(HIST_KEYS.map((key) => [key, { $sum: `${path}.${key}` }]));
}

function pickHist(doc) {
  return Object.fromEntries(HIST_KEYS.map((key) => [key, doc[key] || 0]));
}

function summarize(stats) {
  const count = stats.count || 0;
  return {
    count,
    clientErrors: stats.clientErrors || 0,
    serverErrors: stats.serverErrors || 0,
    rateLimited: stats.rateLimited || 0,
    avgMs: count ? roundMs(stats.totalMs / count) : null,
    p50Ms: percentileFromHist(stats.hist, 0.5, stats.maxMs),
    p95Ms: percentileFromHist(stats.hist, 0.95, stats.maxMs),
    p99Ms: percentileFromHist(stats.hist, 0.99, stats.maxMs),
    maxMs: count ? roundMs(stats.maxMs || 0) : null,
  };
}

async function getRequestMetrics(rangeKey, now = Date.now()) {
  const range = RANGES[rangeKey];
  if (!range) throw new Error(`Unknown range: ${rangeKey}`);

  // Include what's still in memory so the current minute shows up right away
  await flush();

  const { windowMs, stepMs } = range;
  const pointCount = Math.round(windowMs / stepMs);
  const lastBucket = now - (now % stepMs);
  const firstBucket = lastBucket - (pointCount - 1) * stepMs;
  const since = new Date(firstBucket);

  const bucketExpr = {
    $subtract: [{ $toLong: '$minute' }, { $mod: [{ $toLong: '$minute' }, stepMs] }],
  };

  const [seriesRaw, routesRaw, oldest] = await Promise.all([
    RequestMetric.aggregate([
      { $match: { minute: { $gte: since } } },
      {
        $group: {
          _id: bucketExpr,
          count: { $sum: '$count' },
          clientErrors: { $sum: '$clientErrors' },
          serverErrors: { $sum: '$serverErrors' },
          rateLimited: { $sum: '$rateLimited' },
          totalMs: { $sum: '$totalMs' },
          maxMs: { $max: '$maxMs' },
          ...histSumFields('$hist'),
          cpuMs: { $sum: '$cpuMs' },
          cpuCapacityMs: { $sum: '$cpuCapacityMs' },
          // Each document is one minute, so this is the busiest minute in the bucket
          cpuPeak: {
            $max: {
              $cond: [{ $gt: ['$cpuCapacityMs', 0] }, { $divide: ['$cpuMs', '$cpuCapacityMs'] }, null],
            },
          },
        },
      },
    ]),
    RequestMetric.aggregate([
      { $match: { minute: { $gte: since } } },
      { $project: { routes: { $objectToArray: { $ifNull: ['$routes', {}] } } } },
      { $unwind: '$routes' },
      {
        $group: {
          _id: '$routes.k',
          count: { $sum: '$routes.v.count' },
          clientErrors: { $sum: '$routes.v.clientErrors' },
          serverErrors: { $sum: '$routes.v.serverErrors' },
          rateLimited: { $sum: '$routes.v.rateLimited' },
          totalMs: { $sum: '$routes.v.totalMs' },
          maxMs: { $max: '$routes.v.maxMs' },
          ...histSumFields('$routes.v.hist'),
        },
      },
      { $sort: { count: -1 } },
      { $limit: 200 },
    ]),
    RequestMetric.findOne().sort({ minute: 1 }).select('minute').lean(),
  ]);

  const byBucket = new Map(seriesRaw.map((row) => [Number(row._id), row]));
  const totals = emptyStats();
  const cpuTotals = { cpuMs: 0, cpuCapacityMs: 0, peakPct: null };

  const series = Array.from({ length: pointCount }, (_, i) => {
    const t = firstBucket + i * stepMs;
    const row = byBucket.get(t);
    if (!row) {
      return {
        t,
        count: 0,
        ok: 0,
        clientErrors: 0,
        serverErrors: 0,
        rateLimited: 0,
        p50Ms: null,
        p95Ms: null,
        cpuPct: null,
        cpuPeakPct: null,
      };
    }
    const cpuPeakPct = typeof row.cpuPeak === 'number' ? Math.round(row.cpuPeak * 1000) / 10 : null;
    cpuTotals.cpuMs += row.cpuMs || 0;
    cpuTotals.cpuCapacityMs += row.cpuCapacityMs || 0;
    if (cpuPeakPct !== null) cpuTotals.peakPct = Math.max(cpuTotals.peakPct ?? 0, cpuPeakPct);

    const stats = {
      count: row.count || 0,
      clientErrors: row.clientErrors || 0,
      serverErrors: row.serverErrors || 0,
      rateLimited: row.rateLimited || 0,
      totalMs: row.totalMs || 0,
      maxMs: row.maxMs || 0,
      hist: pickHist(row),
    };
    mergeStats(totals, stats);
    const summary = summarize(stats);
    return {
      t,
      count: summary.count,
      ok: summary.count - summary.clientErrors - summary.serverErrors,
      clientErrors: summary.clientErrors,
      serverErrors: summary.serverErrors,
      rateLimited: summary.rateLimited,
      p50Ms: summary.p50Ms,
      p95Ms: summary.p95Ms,
      cpuPct: toPercent(row.cpuMs || 0, row.cpuCapacityMs || 0),
      cpuPeakPct,
    };
  });

  const routes = routesRaw.map((row) => {
    const route = decodeRouteKey(row._id);
    const spaceAt = route.indexOf(' ');
    const isPattern = spaceAt > 0 && !route.startsWith('(');
    return {
      route,
      method: isPattern ? route.slice(0, spaceAt) : null,
      path: isPattern ? route.slice(spaceAt + 1) : route,
      ...summarize({
        count: row.count || 0,
        clientErrors: row.clientErrors || 0,
        serverErrors: row.serverErrors || 0,
        rateLimited: row.rateLimited || 0,
        totalMs: row.totalMs || 0,
        maxMs: row.maxMs || 0,
        hist: pickHist(row),
      }),
    };
  });

  const totalSummary = summarize(totals);
  const windowMinutes = windowMs / MINUTE_MS;

  return {
    range: rangeKey,
    stepMs,
    from: since,
    to: new Date(now),
    retentionDays: RequestMetric.REQUEST_METRIC_RETENTION_DAYS,
    trackingSince: oldest?.minute || null,
    totals: {
      ...totalSummary,
      serverErrorRate: totalSummary.count ? totalSummary.serverErrors / totalSummary.count : 0,
      clientErrorRate: totalSummary.count ? totalSummary.clientErrors / totalSummary.count : 0,
      rateLimitedRate: totalSummary.count ? totalSummary.rateLimited / totalSummary.count : 0,
      perMinute: Math.round((totalSummary.count / windowMinutes) * 10) / 10,
      cpuAvgPct: toPercent(cpuTotals.cpuMs, cpuTotals.cpuCapacityMs),
      cpuPeakPct: cpuTotals.peakPct,
    },
    series,
    routes,
  };
}

module.exports = {
  LATENCY_BOUNDS_MS,
  RANGES,
  NO_ROUTE_KEY,
  requestMetricsMiddleware,
  record,
  flush,
  start,
  stop,
  resetForTests,
  getEventLoopDelay,
  sampleCpu,
  getCpuUsage,
  getRequestMetrics,
  percentileFromHist,
  getRouteKey,
};
