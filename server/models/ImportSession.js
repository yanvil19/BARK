const mongoose = require('mongoose');

// Text read from an uploaded file, kept between the two import steps: counting
// the questions (POST /api/import/validate-count) and extracting them
// (POST /api/import/extract). Stored in the database so an import survives a
// server restart and works when more than one server instance runs. The text is
// encrypted like question text. The document is deleted once the extraction
// succeeds, and MongoDB removes it on its own once it expires.
const importSessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  questionCount: { type: Number, required: true },
  expiresAt: { type: Date, required: true },
});

importSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ImportSession', importSessionSchema);
