// The AI overview of an exam's results (the "AI Overview" view of the Exam Results page). Deans
// and program chairs share EXAM_AI_OVERVIEW_LIMIT generations per exam; every generation is kept
// as a version. The server works out the figures (services/examOverviewFacts.js) and Gemini
// writes the words (geminiService.writeExamOverview). See models/ExamAiOverview.js.
const mongoose = require('mongoose');
const MockBoardExam = require('../models/MockBoardExam');
const ExamAiOverview = require('../models/ExamAiOverview');
const { loadExamReport } = require('../services/examResultsReport');
const { buildOverviewFacts, currentBasis } = require('../services/examOverviewFacts');
const geminiService = require('../services/geminiService');
const { GeminiLimitError } = require('../services/importStateService');
const { logAudit } = require('../utils/auditLogger');

const { EXAM_AI_OVERVIEW_LIMIT } = ExamAiOverview;

// A generation still running after this long has failed without cleaning up (the server
// restarted while Gemini was writing), so its slot is given back
const STUCK_AFTER_MS = 10 * 60 * 1000;

const NOT_COUNTED = "This try wasn't counted.";
const MESSAGES = {
  notFound: 'Exam not found.',
  versionNotFound: 'That version of the overview was not found.',
  generating: 'An overview of this exam is being generated. It will appear here when it is ready.',
  limit: `This exam has used all ${EXAM_AI_OVERVIEW_LIMIT} overview generations.`,
  noStudentResults: 'Compute the results before generating an overview.',
  noAlumniResults: 'No alumni have taken this exam yet.',
  busy: `The AI is busy right now. Try again in a minute. ${NOT_COUNTED}`,
  daily: `The AI has reached its daily limit. Try again tomorrow. ${NOT_COUNTED}`,
  failed: `The overview could not be written. ${NOT_COUNTED} You can try again.`,
};

// The exam, if the user may see it: in their department, and for a program chair in their program
function findExam(req) {
  if (!mongoose.isValidObjectId(req.params.examId)) return null;
  const query = { _id: req.params.examId, department: req.user.department };
  if (req.user.role === 'program_chair') query.program = req.user.program;
  return MockBoardExam.findOne(query);
}

function clearStuckGenerations(examId) {
  return ExamAiOverview.deleteMany({
    exam: examId,
    status: 'generating',
    createdAt: { $lt: new Date(Date.now() - STUCK_AFTER_MS) },
  });
}

function describeUser(user) {
  return user ? { name: user.name, role: user.role } : null;
}

// Whether the results changed after the overview read them: student results computed again,
// or new alumni attempts
function compareBasis(basedOn, current) {
  if (!basedOn) return { isStale: false, newAttempts: 0 };
  if (basedOn.attempts !== undefined) {
    const newAttempts = Math.max(0, (current.attempts || 0) - basedOn.attempts);
    return { isStale: current.attempts !== basedOn.attempts, newAttempts };
  }
  return { isStale: current.computedAt !== basedOn.computedAt, newAttempts: 0 };
}

/**
 * What the AI Overview view shows: how many generations are left, the versions, whether one is
 * being generated, and the overview asked for (the latest unless `version` is given).
 */
async function buildState(exam, version = null) {
  const slots = await ExamAiOverview.find({ exam: exam._id })
    .sort({ version: -1 })
    .select('version status createdAt createdBy')
    .populate('createdBy', 'name role')
    .lean();

  const ready = slots.filter((slot) => slot.status === 'ready');
  const generating = slots.find((slot) => slot.status === 'generating');
  const state = {
    limit: EXAM_AI_OVERVIEW_LIMIT,
    used: slots.length,
    remaining: Math.max(0, EXAM_AI_OVERVIEW_LIMIT - slots.length),
    generating: generating
      ? { version: generating.version, createdAt: generating.createdAt, createdBy: describeUser(generating.createdBy) }
      : null,
    versions: ready.map((slot) => ({
      version: slot.version,
      createdAt: slot.createdAt,
      createdBy: describeUser(slot.createdBy),
    })),
    overview: null,
  };

  const chosen = version === null ? ready[0] : ready.find((slot) => slot.version === version);
  if (!chosen) return { state, found: version === null };

  const overview = await ExamAiOverview.findById(chosen._id).populate('createdBy', 'name role').lean();
  const { isStale, newAttempts } = compareBasis(overview.basedOn, await currentBasis(exam));
  state.overview = {
    version: overview.version,
    createdAt: overview.createdAt,
    completedAt: overview.completedAt,
    createdBy: describeUser(overview.createdBy),
    model: overview.model,
    facts: overview.facts,
    content: overview.content,
    isLatest: overview.version === ready[0].version,
    isStale,
    newAttempts,
  };
  return { state, found: true };
}

/**
 * @desc    The AI overview of an exam's results, with its versions and generations left
 * @route   GET /api/mock-exam-results/:examId/ai-overview?version=n
 * @access  Private (dean, program chair)
 */
exports.getAiOverview = async (req, res) => {
  try {
    const exam = await findExam(req);
    if (!exam) return res.status(404).json({ message: MESSAGES.notFound });

    const requested = req.query.version === undefined ? null : Number.parseInt(req.query.version, 10);
    if (requested !== null && !(requested >= 1)) {
      return res.status(404).json({ message: MESSAGES.versionNotFound });
    }

    await clearStuckGenerations(exam._id);
    const { state, found } = await buildState(exam, requested);
    if (!found) return res.status(404).json({ message: MESSAGES.versionNotFound, ...state });
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Generate a new version of an exam's AI overview. Uses one of the exam's generations;
 *          a try that fails is not counted.
 * @route   POST /api/mock-exam-results/:examId/ai-overview
 * @access  Private (dean, program chair)
 */
exports.generateAiOverview = async (req, res) => {
  let slot = null;
  try {
    const examQuery = findExam(req);
    const exam = examQuery ? await examQuery.populate('questions') : null;
    if (!exam) return res.status(404).json({ message: MESSAGES.notFound });

    await clearStuckGenerations(exam._id);
    const slots = await ExamAiOverview.find({ exam: exam._id }).select('version status').lean();
    if (slots.some((existing) => existing.status === 'generating')) {
      return res.status(409).json({ code: 'generating', message: MESSAGES.generating });
    }
    if (slots.length >= EXAM_AI_OVERVIEW_LIMIT) {
      return res.status(409).json({ code: 'limit', message: MESSAGES.limit });
    }

    // Every overview reads the exam's whole results, as the dean sees them; alumni can only
    // take their own program's exams, so a program chair's results are the same
    const report = await loadExamReport(exam, { programId: exam.program });
    if (!report || !report.totalTakers) {
      const isAlumni = exam.targetAudience === 'alumni';
      return res.status(409).json({
        code: 'no_results',
        message: isAlumni ? MESSAGES.noAlumniResults : MESSAGES.noStudentResults,
      });
    }

    // Reserve the next version before calling Gemini, so the limit holds when two people
    // generate at once (the indexes on ExamAiOverview refuse the second)
    const version = slots.reduce((highest, existing) => Math.max(highest, existing.version), 0) + 1;
    try {
      slot = await ExamAiOverview.create({
        exam: exam._id,
        department: exam.department,
        version,
        status: 'generating',
        basedOn: await currentBasis(exam),
        createdBy: req.user._id,
      });
    } catch (err) {
      if (err?.code === 11000) return res.status(409).json({ code: 'generating', message: MESSAGES.generating });
      throw err;
    }

    const facts = await buildOverviewFacts(exam, report);
    const { model, content } = await geminiService.writeExamOverview(facts);

    const saved = await ExamAiOverview.findOneAndUpdate(
      { _id: slot._id, status: 'generating' },
      { $set: { status: 'ready', facts, content, model, completedAt: new Date() } },
      { returnDocument: 'after' }
    );
    // The slot was given back meanwhile (it took longer than STUCK_AFTER_MS)
    if (!saved) {
      slot = null;
      return res.status(502).json({ message: MESSAGES.failed });
    }
    slot = null;

    await logAudit(req.user._id, 'mock_exam_ai_overview_generated', 'MockBoardExam', exam._id, {
      examName: exam.name,
      version,
      model,
    });

    const { state } = await buildState(exam, version);
    res.status(201).json(state);
  } catch (err) {
    if (slot) {
      await ExamAiOverview.deleteOne({ _id: slot._id, status: 'generating' }).catch((deleteErr) => {
        console.error('Could not give back an AI overview generation:', deleteErr.message);
      });
    }
    if (err instanceof GeminiLimitError) {
      return res.status(429).json({ code: 'ai_busy', message: err.reason === 'day' ? MESSAGES.daily : MESSAGES.busy });
    }
    console.error('AI overview generation failed:', err);
    res.status(502).json({ code: 'failed', message: MESSAGES.failed });
  }
};

exports.EXAM_AI_OVERVIEW_MESSAGES = MESSAGES;
