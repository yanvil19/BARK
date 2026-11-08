const mongoose = require('mongoose');

// One AI overview of an exam's results, written by Gemini when a dean or program chair asks for
// it on the Exam Results page. Each generation is a new version, kept so earlier ones can still
// be read. An exam gets at most EXAM_AI_OVERVIEW_LIMIT generations; a try that fails is deleted,
// so it does not count.
//
// status is 'generating' while Gemini is writing it (the reserved slot that counts toward the
// limit) and 'ready' once saved. Only one may be generating per exam at a time.
//
// facts holds the figures the overview was written from, worked out by the server
// (services/examOverviewFacts.js): the page draws its charts and tables from them, so every
// number shown comes from the results, not from the AI. content holds what Gemini wrote,
// checked against those facts (services/examOverviewContent.js). basedOn records which results
// it read, to tell when the results changed afterwards.
const EXAM_AI_OVERVIEW_LIMIT = 8;

const examAiOverviewSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'MockBoardExam', required: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  version: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['generating', 'ready'], default: 'generating' },
  facts: { type: mongoose.Schema.Types.Mixed, default: null },
  content: { type: mongoose.Schema.Types.Mixed, default: null },
  basedOn: { type: mongoose.Schema.Types.Mixed, default: null },
  model: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

examAiOverviewSchema.index({ exam: 1, version: 1 }, { unique: true });
// One generation at a time per exam: a second one started meanwhile is refused
examAiOverviewSchema.index(
  { exam: 1 },
  { unique: true, partialFilterExpression: { status: 'generating' }, name: 'one_generating_per_exam' }
);

module.exports = mongoose.model('ExamAiOverview', examAiOverviewSchema);
module.exports.EXAM_AI_OVERVIEW_LIMIT = EXAM_AI_OVERVIEW_LIMIT;
