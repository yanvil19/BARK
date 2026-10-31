const mongoose = require('mongoose');

// How long per-minute request summaries are kept before MongoDB's TTL monitor
// deletes them. Changing this later needs a collMod on the existing index.
const REQUEST_METRIC_RETENTION_DAYS = 7;

// One document per minute while the server runs. Counters are added with $inc,
// so a minute can be flushed several times (or by several server instances) safely.
//
// Shape (fields at zero are left out to save space; readers treat them as 0):
//   minute        start of the minute
//   count         requests that finished in this minute
//   clientErrors  4xx responses
//   serverErrors  5xx responses
//   rateLimited   429 responses (rate limits and account lockouts), also counted in clientErrors
//   totalMs       summed response time, for averages
//   maxMs         slowest response
//   hist          latency histogram { b0: n, b1: n, ... } (bounds in services/requestMetrics.js)
//   cpuMs         CPU time the server used during the minute
//   cpuCapacityMs CPU time it could have used (clock time x its CPU limit), so
//                 cpuMs / cpuCapacityMs is how busy it was
//   routes        the same counters per route pattern, keyed by "METHOD /path/:param".
//                 Only route patterns are stored: never raw URLs, query strings or bodies.
const requestMetricSchema = new mongoose.Schema(
  {
    minute: { type: Date, required: true },
    count: { type: Number, default: 0 },
    clientErrors: { type: Number, default: 0 },
    serverErrors: { type: Number, default: 0 },
    rateLimited: { type: Number, default: 0 },
    totalMs: { type: Number, default: 0 },
    maxMs: { type: Number, default: 0 },
    hist: { type: mongoose.Schema.Types.Mixed, default: {} },
    cpuMs: { type: Number, default: 0 },
    cpuCapacityMs: { type: Number, default: 0 },
    routes: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { versionKey: false, minimize: true }
);

// Serves the time-range queries and expires old minutes.
requestMetricSchema.index(
  { minute: 1 },
  { expireAfterSeconds: REQUEST_METRIC_RETENTION_DAYS * 24 * 60 * 60 }
);

module.exports = mongoose.model('RequestMetric', requestMetricSchema);
module.exports.REQUEST_METRIC_RETENTION_DAYS = REQUEST_METRIC_RETENTION_DAYS;
