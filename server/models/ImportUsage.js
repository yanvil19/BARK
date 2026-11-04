const mongoose = require('mongoose');

// One document per counted event, for the import limits:
//   - 'import': one import by a user (the per-user hourly and daily limits)
//   - 'gemini_call': one request sent to a Gemini model, retries included (that
//     model's per-minute and daily limits). `outcome` says how it went.
// Stored in the database so the limits hold across restarts and server
// instances. Documents are removed a little over a day after they were made,
// once no limit window can include them (a Pacific-time day is at most 25 hours).
const importUsageSchema = new mongoose.Schema({
  kind: { type: String, enum: ['import', 'gemini_call'], required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  model: { type: String, default: null },
  outcome: { type: String, enum: ['pending', 'success', 'rate_limited', 'failed', null], default: null },
  createdAt: { type: Date, default: Date.now },
});

importUsageSchema.index({ kind: 1, user: 1, createdAt: -1 });
importUsageSchema.index({ kind: 1, model: 1, createdAt: -1 });
importUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 25 * 60 * 60 });

module.exports = mongoose.model('ImportUsage', importUsageSchema);
