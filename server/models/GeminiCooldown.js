const mongoose = require('mongoose');

// A Gemini model the import should skip until `until`, because Google turned a
// request away:
//   - 'minute': Google's per-minute limit (until = the wait Google asked for)
//   - 'day': Google's daily limit (until = the next midnight Pacific time)
//   - 'unavailable': Google says the model does not exist for this API key
//     (until = an hour later, then it is tried again)
// One document per model, removed once it has expired.
const geminiCooldownSchema = new mongoose.Schema({
  model: { type: String, required: true, unique: true },
  reason: { type: String, enum: ['minute', 'day', 'unavailable'], required: true },
  until: { type: Date, required: true },
  message: { type: String, default: '' },
  setAt: { type: Date, default: Date.now },
});

geminiCooldownSchema.index({ until: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('GeminiCooldown', geminiCooldownSchema);
