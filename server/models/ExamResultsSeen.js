const mongoose = require('mongoose');

// What a dean or program chair has already looked at on Exam Results, so the navbar badge and
// the list can mark the results that came in since.
// - since: when this person's record began. Results from before it are never "new", so the
//   badge does not start out counting every past exam.
// - exams: exam id -> when this person last opened that exam's results
const examResultsSeenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  since: { type: Date, required: true },
  exams: { type: Map, of: Date, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('ExamResultsSeen', examResultsSeenSchema);
