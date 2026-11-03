const mongoose = require('mongoose');

// Marks a user's import that is in progress, so a user runs one import at a
// time. One document per user (unique). A lock left behind by a crash expires on
// its own after a few minutes.
const importLockSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  lockId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

importLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ImportLock', importLockSchema);
