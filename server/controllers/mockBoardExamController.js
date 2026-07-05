const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const { sendExamPublishedAnnouncement } = require('../services/examAnnouncementEmailService');
const { checkExamScheduleConflict } = require('../services/examScheduleConflictService');
const { logAudit } = require('../utils/auditLogger');

const EXAM_MANAGER_ROLES = ['dean', 'program_chair'];

function isExamManager(user) {
  return Boolean(user) && EXAM_MANAGER_ROLES.includes(user.role);
}

// Returns the programs a user is allowed to manage exams for.
// Deans get every active program in their department, while Program Chairs
// are scoped to only the single program they are assigned to.
async function getDeanPrograms(user) {
  if (user.role === 'dean') {
    if (!user.department) return [];
    const programs = await Program.find({ department: user.department, isActive: true }).select('_id department name code');
    return programs;
  }

  if (user.role === 'program_chair') {
    if (!user.program) return [];
    const program = await Program.findOne({ _id: user.program, isActive: true }).select('_id department name code');
    return program ? [program] : [];
  }

  return [];
}

// Confirms the given program is one the user is permitted to manage.
// Because getDeanPrograms already scopes Program Chairs to their single
// assigned program, this rejects any program a Program Chair does not
// manage, even if a different programId is passed in the request.
async function ensureDeanProgramAccess(user, programId) {
  const programs = await getDeanPrograms(user);
  const program = programs.find((item) => item._id.toString() === String(programId));
  if (!program) return null;
  return program;
}

function parseTagIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return String(raw)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatProgramName(program) {
  if (!program) return 'Unknown program';
  return program.code ? `${program.name} (${program.code})` : program.name;
}

function formatConflictMessage(conflicts, action = 'saving') {
  const conflictList = conflicts
    .map((exam) => {
      const programName = formatProgramName(exam.program);
      return `${exam.name} for ${programName} from ${new Date(exam.startDateTime).toISOString()} to ${new Date(exam.endDateTime).toISOString()}`;
    })
    .join('; ');

  return `Schedule conflict detected with existing exam(s): ${conflictList}. Please resolve the schedule conflict before ${action}.`;
}

async function buildScheduleConflictResponse(payload, examId = null) {
  const conflictResult = await checkExamScheduleConflict({
    programId: payload.program._id,
    startDateTime: payload.startDateTime,
    endDateTime: payload.endDateTime,
    status: payload.status,
    examId,
  });

  if (!conflictResult.hasConflict) {
    return { shouldBlock: false, warnings: [] };
  }

  const message = formatConflictMessage(
    conflictResult.conflicts,
    payload.status === 'published' ? 'publishing' : 'saving'
  );

  return {
    shouldBlock: payload.status === 'published',
    message,
    conflicts: conflictResult.conflicts,
    warnings: [{ message, conflicts: conflictResult.conflicts }],
  };
}

async function advanceExamStatuses(query = {}) {
  const now = new Date();

  await MockBoardExam.updateMany(
    {
      ...query,
      status: 'published',
      startDateTime: { $lte: now },
      endDateTime: { $gt: now },
    },
    { $set: { status: 'ongoing' } }
  );

  await MockBoardExam.updateMany(
    {
      ...query,
      status: { $in: ['published', 'ongoing'] },
      endDateTime: { $lt: now },
    },
    { $set: { status: 'finished' } }
  );
}

async function listApprovedQuestions(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can access approved questions for exam creation' });
    }

    const { program: programId, states } = req.query;
    const tagIds = parseTagIds(req.query.tags);

    if (!programId) return res.status(400).json({ message: 'Program is required' });
    if (tagIds.length === 0) return res.json({ questions: [] });

    const program = await ensureDeanProgramAccess(req.user, programId);
    if (!program) return res.status(403).json({ message: 'Access denied to this program' });

    const validTags = await Tag.find({ _id: { $in: tagIds }, program: programId, isActive: true }).select('_id');
    const validTagIds = validTags.map((tag) => tag._id.toString());

    if (validTagIds.length === 0) return res.json({ questions: [] });

    const queryStates = states ? states.split(',') : ['approved'];
    const eligibleStates = queryStates.includes('approved')
      ? [...new Set([...queryStates, 'in_draft', 'in_use', 'retired'])]
      : queryStates;

    const questions = await Question.find({
      program: programId,
      state: { $in: eligibleStates },
      tag: { $in: validTagIds },
    })
      .populate('tag', 'name')
      .populate('program', 'name code')
      .populate('createdBy', 'name')
      .sort({ updatedAt: -1 });

    res.json({ questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function validateExamPayload(user, body) {
  const errors = [];
  const name = body.name?.trim();
  const programId = body.programId;
  const subjectTagIds = Array.isArray(body.subjectTagIds) ? body.subjectTagIds.filter(Boolean) : [];
  const questionIds = Array.isArray(body.questionIds) ? body.questionIds.filter(Boolean) : [];
  const status = body.status || 'draft';
  const instructions = body.instructions?.trim() || '';
  const description = body.description?.trim() || '';

  if (!name) errors.push('Exam name is required');
  if (!programId) errors.push('Program is required');
  if (status === 'published' && !body.startDateTime) errors.push('Start date and time is required');
  if (status === 'published' && !body.endDateTime) errors.push('End date and time is required');
  if (subjectTagIds.length === 0) errors.push('At least one subject is required');
  if (questionIds.length === 0) errors.push('At least one approved question is required');
  if (!['draft', 'published'].includes(status)) errors.push('Invalid exam status');

  const program = programId ? await ensureDeanProgramAccess(user, programId) : null;
  if (programId && !program) errors.push('Access denied to this program');

  const start = body.startDateTime ? new Date(body.startDateTime) : null;
  const end = body.endDateTime ? new Date(body.endDateTime) : null;

  if (start && Number.isNaN(start.getTime())) errors.push('Invalid start date');
  if (end && Number.isNaN(end.getTime())) errors.push('Invalid end date');
  if ((start && !end) || (!start && end)) errors.push('Both start and end date are required when scheduling an exam');
  if (start && end && end <= start) errors.push('End date must be later than the start date');
  
  const now = new Date();
  if (status === 'published' && end && end <= now) {
    errors.push('Cannot publish an exam that has already expired. Please adjust the end date and time.');
  }

  let tags = [];
  if (program && subjectTagIds.length > 0) {
    tags = await Tag.find({ _id: { $in: subjectTagIds }, program: program._id, isActive: true }).select('_id name program');
    if (tags.length !== subjectTagIds.length) {
      errors.push('One or more selected subjects are invalid for the chosen program');
    }
  }

  let questions = [];
  if (program && questionIds.length > 0 && tags.length > 0) {
    const allowedTagIds = tags.map((tag) => tag._id.toString());
    questions = await Question.find({
      _id: { $in: questionIds },
      program: program._id,
      state: { $in: ['approved', 'in_use', 'retired', 'in_draft'] },
      tag: { $in: allowedTagIds },
    }).select('_id title tag program state');

    if (questions.length !== questionIds.length) {
      errors.push('One or more selected questions are not approved or do not match the chosen subjects');
    }
  }

  return {
    errors,
    payload: {
      name,
      program,
      subjectTagIds,
      questionIds,
      startDateTime: start,
      endDateTime: end,
      instructions,
      description,
      status,
      tags,
      questions,
      passingThreshold: body.passingThreshold ?? 70,
    },
  };
}

async function createMockBoardExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can create mock board exams' });
    }

    const { errors, payload } = await validateExamPayload(req.user, req.body);
    if (payload.status === 'published' && payload.startDateTime && payload.startDateTime <= new Date()) {
      errors.push('Start date must be in the future');
    }
    if (errors.length > 0) return res.status(400).json({ message: errors[0], errors });

    const scheduleConflict = await buildScheduleConflictResponse(payload);
    if (scheduleConflict.shouldBlock) {
      return res.status(409).json({
        message: scheduleConflict.message,
        conflicts: scheduleConflict.conflicts,
      });
    }

    const exam = await MockBoardExam.create({
      name: payload.name,
      program: payload.program._id,
      department: payload.program.department,
      subjectTags: payload.subjectTagIds,
      questions: payload.questionIds,
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      instructions: payload.instructions,
      description: payload.description,
      status: payload.status,
      passingThreshold: payload.passingThreshold,
      createdBy: req.user._id,
    });

    const populated = await MockBoardExam.findById(exam._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');
    await logAudit(req.user._id, 'mock_exam_created', 'MockBoardExam', exam._id, {
      name: exam.name,
      programId: exam.program,
      status: exam.status,
      questionCount: exam.questions?.length || 0,
    });

    if (payload.status === 'published') {
      sendExamPublishedAnnouncement({ exam: populated }).catch((err) => {
        console.error('Exam announcement email error:', err);
      });
    }

    res.status(201).json({ exam: populated, warnings: scheduleConflict.warnings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function listMockBoardExams(req, res) {
  try {
    let query = {};

    if (isExamManager(req.user)) {
      const programs = await getDeanPrograms(req.user);
      const programIds = programs.map((program) => program._id);
      
      await advanceExamStatuses({ program: { $in: programIds } });

      query = { program: { $in: programIds } };
    } 
    else {
      query = { status: { $in: ['published', 'ongoing'] } };
    }

    const exams = await MockBoardExam.find(query)
      .populate('program', 'name code department')
      .populate('subjectTags', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    const now = new Date();
    const examIds = exams.map((exam) => exam._id);
    const resultRecords = examIds.length > 0
      ? await MockExamResult.find({ examId: { $in: examIds } }).select('examId status').lean()
      : [];
    const uploadedExamIds = new Set(
      resultRecords
        .filter((record) => record.status === 'computed')
        .map((record) => String(record.examId))
    );

    const enrichedExams = exams.map((exam) => {
      const resultsReleaseDate = exam.resultsReleaseDate || null;
      const resultsUploaded = uploadedExamIds.has(String(exam._id));
      const resultsReleased = Boolean(
        resultsReleaseDate && new Date(resultsReleaseDate) <= now
      );
      const durationMinutes = exam.startDateTime && exam.endDateTime
        ? Math.round((new Date(exam.endDateTime) - new Date(exam.startDateTime)) / 60000)
        : null;

      return {
        ...exam,
        durationMinutes,
        resultsReleaseDate,
        computationStatus: resultsUploaded ? 'computed' : 'none',
        resultsUploaded,
        resultsReleased,
      };
    });

    res.json({ exams: enrichedExams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function getMockBoardExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can view mock board exams' });
    }

    const exam = await MockBoardExam.findById(req.params.id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate({
        path: 'questions',
        select: 'title description images answers tag state',
        populate: { path: 'tag', select: 'name' },
      })
      .populate('createdBy', 'name');

    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const program = await ensureDeanProgramAccess(req.user, exam.program?._id || exam.program);
    if (!program) return res.status(403).json({ message: 'Access denied to this exam' });

    res.json({ exam });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function updateMockBoardExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can update mock board exams' });
    }

    const existing = await MockBoardExam.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Mock board exam not found' });

    await advanceExamStatuses({ _id: existing._id });
    const current = await MockBoardExam.findById(req.params.id);
    if (['ongoing', 'finished', 'archived'].includes(current.status)) {
      return res.status(400).json({ message: `Cannot edit a ${current.status} exam` });
    }

    const accessible = await ensureDeanProgramAccess(req.user, current.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    const mergedBody = {
      name: req.body.name ?? current.name,
      programId: req.body.programId ?? current.program.toString(),
      subjectTagIds: req.body.subjectTagIds ?? current.subjectTags.map((item) => item.toString()),
      questionIds: req.body.questionIds ?? current.questions.map((item) => item.toString()),
      startDateTime: req.body.startDateTime ?? current.startDateTime,
      endDateTime: req.body.endDateTime ?? current.endDateTime,
      instructions: req.body.instructions ?? current.instructions,
      description: req.body.description ?? current.description,
      status: req.body.status ?? current.status,
      passingThreshold: req.body.passingThreshold ?? current.passingThreshold,
    };

    const { errors, payload } = await validateExamPayload(req.user, mergedBody);
    if (errors.length > 0) return res.status(400).json({ message: errors[0], errors });

    const scheduleConflict = await buildScheduleConflictResponse(payload, existing._id);
    if (scheduleConflict.shouldBlock) {
      return res.status(409).json({
        message: scheduleConflict.message,
        conflicts: scheduleConflict.conflicts,
      });
    }

    const oldStatus = current.status;
    current.name = payload.name;
    current.program = payload.program._id;
    current.department = payload.program.department;
    current.subjectTags = payload.subjectTagIds;
    current.questions = payload.questionIds;
    current.startDateTime = payload.startDateTime;
    current.endDateTime = payload.endDateTime;
    current.instructions = payload.instructions;
    current.description = payload.description;
    current.status = payload.status;
    current.passingThreshold = payload.passingThreshold;
    await current.save();

    const populated = await MockBoardExam.findById(current._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');
    await logAudit(req.user._id, 'mock_exam_updated', 'MockBoardExam', current._id, {
      name: current.name,
      programId: current.program,
      oldStatus,
      newStatus: current.status,
      questionCount: current.questions?.length || 0,
    });

    if (oldStatus !== 'published' && payload.status === 'published') {
      sendExamPublishedAnnouncement({ exam: populated }).catch((err) => {
        console.error('Exam announcement email error:', err);
      });
    }

    res.json({ exam: populated, warnings: scheduleConflict.warnings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function deleteMockBoardExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can delete mock board exams' });
    }

    const exam = await MockBoardExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, exam.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    await exam.deleteOne();
    await logAudit(req.user._id, 'mock_exam_deleted', 'MockBoardExam', exam._id, {
      name: exam.name,
      programId: exam.program,
      status: exam.status,
    });
    res.json({ message: 'Mock board exam deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function listPublishedExams(req, res) {
  try {
    await advanceExamStatuses();
    const exams = await MockBoardExam.find({ status: { $in: ['published', 'ongoing'] } })
      .populate('program', 'name code department')
      .populate('department', 'name code')
      .select('name program department startDateTime endDateTime status updatedAt')
      .sort({ updatedAt: -1 });

    res.json({ exams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function archiveExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can archive exams' });
    }

    const exam = await MockBoardExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, exam.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    if (exam.status !== 'finished') {
      return res.status(400).json({ message: 'Only finished exams can be archived' });
    }

    exam.status = 'archived';
    await exam.save();

    await logAudit(req.user._id, 'mock_exam_archived', 'MockBoardExam', exam._id, {
      name: exam.name,
      programId: exam.program,
      status: exam.status,
      questionCount: exam.questions?.length || 0,
    });

    res.json({ message: 'Exam archived successfully', exam: { _id: exam._id, status: exam.status } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function reuseArchivedExam(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can reuse archived exams' });
    }

    const exam = await MockBoardExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, exam.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    if (exam.status !== 'archived') {
      return res.status(400).json({ message: 'Only archived exams can be reused as a new draft' });
    }

    const reused = await MockBoardExam.create({
      name: `${exam.name} (Copy)`,
      program: exam.program,
      department: exam.department,
      subjectTags: exam.subjectTags,
      questions: exam.questions,
      startDateTime: null,
      endDateTime: null,
      description: exam.description || '',
      instructions: exam.instructions || '',
      status: 'draft',
      passingThreshold: exam.passingThreshold,
      resultsReleaseDate: null,
      missedAttemptsProcessedAt: null,
      createdBy: req.user._id,
    });

    const populated = await MockBoardExam.findById(reused._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');

    await logAudit(req.user._id, 'mock_exam_created', 'MockBoardExam', reused._id, {
      name: reused.name,
      programId: reused.program,
      status: reused.status,
      reusedFromExamId: exam._id,
      questionCount: reused.questions?.length || 0,
    });

    res.status(201).json({ exam: populated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function setResultsReleaseDate(req, res) {
  try {
    if (!isExamManager(req.user)) {
      return res.status(403).json({ message: 'Only Deans and Program Chairs can schedule result releases' });
    }

    const { resultsReleaseDate } = req.body;
    if (!resultsReleaseDate) {
      return res.status(400).json({ message: 'Results release date is required' });
    }

    const releaseDate = new Date(resultsReleaseDate);
    if (Number.isNaN(releaseDate.getTime())) {
      return res.status(400).json({ message: 'Invalid release date' });
    }

    if (releaseDate <= new Date()) {
      return res.status(400).json({ message: 'Results release date must be in the future' });
    }

    const exam = await MockBoardExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, exam.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    if (exam.status !== 'finished' && exam.status !== 'archived') {
      return res.status(400).json({ message: 'Can only schedule results release for finished or archived exams' });
    }

    const uploadedResult = await MockExamResult.findOne({ examId: exam._id, status: 'computed' });
    // Allow the first release schedule even if analytics were computed early on Exam Results
    if (uploadedResult && exam.resultsReleaseDate) {
      return res.status(400).json({ message: 'Results have already been uploaded. Release date can no longer be changed.' });
    }

    if (exam.resultsReleaseDate && new Date(exam.resultsReleaseDate) <= new Date()) {
      return res.status(400).json({ message: 'Results have already been released to students. Release date can no longer be changed.' });
    }

    const updated = await MockBoardExam.findByIdAndUpdate(
      exam._id,
      { $set: { resultsReleaseDate: releaseDate } },
      { new: true, runValidators: false }
    ).select('resultsReleaseDate status').lean();
    await logAudit(req.user._id, 'mock_exam_results_release_scheduled', 'MockBoardExam', exam._id, {
      name: exam.name,
      programId: exam.program,
      resultsReleaseDate: updated?.resultsReleaseDate || releaseDate,
      status: exam.status,
    });

    res.json({
      message: 'Results release date scheduled successfully',
      resultsReleaseDate: updated?.resultsReleaseDate || releaseDate,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

module.exports = {
  listApprovedQuestions,
  createMockBoardExam,
  listMockBoardExams,
  getMockBoardExam,
  updateMockBoardExam,
  deleteMockBoardExam,
  listPublishedExams,
  archiveExam,
  reuseArchivedExam,
  setResultsReleaseDate,
};