const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const { sendExamPublishedAnnouncement } = require('../services/examAnnouncementEmailService');
const { checkExamScheduleConflict } = require('../services/examScheduleConflictService');
const { logAudit } = require('../utils/auditLogger');

async function getDeanPrograms(user) {
  if (user.role !== 'dean' || !user.department) return [];
  const programs = await Program.find({ department: user.department, isActive: true }).select('_id department name code');
  return programs;
}

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

async function listApprovedQuestions(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can access approved questions for exam creation' });
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

    const questions = await Question.find({
      program: programId,
      state: { $in: queryStates },
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

  if (!name) errors.push('Exam name is required');
  if (!programId) errors.push('Program is required');
  if (!body.startDateTime) errors.push('Start date and time is required');
  if (!body.endDateTime) errors.push('End date and time is required');
  if (subjectTagIds.length === 0) errors.push('At least one subject is required');
  if (questionIds.length === 0) errors.push('At least one approved question is required');
  if (!['draft', 'published', 'archived'].includes(status)) errors.push('Invalid exam status');

  const program = programId ? await ensureDeanProgramAccess(user, programId) : null;
  if (programId && !program) errors.push('Access denied to this program');

  const start = body.startDateTime ? new Date(body.startDateTime) : null;
  const end = body.endDateTime ? new Date(body.endDateTime) : null;

  if (start && Number.isNaN(start.getTime())) errors.push('Invalid start date');
  if (end && Number.isNaN(end.getTime())) errors.push('Invalid end date');
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
      status,
      tags,
      questions,
      passingThreshold: body.passingThreshold ?? 70,
    },
  };
}

async function createMockBoardExam(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can create mock board exams' });
    }

    const { errors, payload } = await validateExamPayload(req.user, req.body);
    if (payload.startDateTime && payload.startDateTime <= new Date()) {
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
      status: payload.status,
      passingThreshold: payload.passingThreshold,
      createdBy: req.user._id,
    });

    if (payload.questionIds.length > 0) {
      const questionState = payload.status === 'draft' ? 'in_draft' : 'in_use';
      await Question.updateMany(
        { _id: { $in: payload.questionIds } },
        { $set: { state: questionState } }
      );
    }

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

    if (req.user && req.user.role === 'dean') {
      const programs = await getDeanPrograms(req.user);
      const programIds = programs.map((program) => program._id);
      
      // Auto-archive expired exams for the Dean as well
      const now = new Date();
      const expiredExams = await MockBoardExam.find({
        program: { $in: programIds },
        status: 'published',
        endDateTime: { $lt: now }
      }).select('_id questions');

      if (expiredExams.length > 0) {
        const expiredIds = expiredExams.map(e => e._id);
        const qIdsToRetire = expiredExams.flatMap(e => e.questions);

        if (qIdsToRetire.length > 0) {
          await Question.updateMany(
            { _id: { $in: qIdsToRetire } },
            { $set: { state: 'retired' } }
          );
        }

        await MockBoardExam.updateMany(
          { _id: { $in: expiredIds } },
          { $set: { status: 'finished' } }
        );
      }

      query = { program: { $in: programIds } };
    } 
    else {
      query = { status: 'published' };
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
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can view mock board exams' });
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
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can update mock board exams' });
    }

    const existing = await MockBoardExam.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Mock board exam not found' });

    if (['finished', 'archived'].includes(existing.status)) {
      return res.status(400).json({ message: `Cannot edit a ${existing.status} exam` });
    }

    const accessible = await ensureDeanProgramAccess(req.user, existing.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    const mergedBody = {
      name: req.body.name ?? existing.name,
      programId: req.body.programId ?? existing.program.toString(),
      subjectTagIds: req.body.subjectTagIds ?? existing.subjectTags.map((item) => item.toString()),
      questionIds: req.body.questionIds ?? existing.questions.map((item) => item.toString()),
      startDateTime: req.body.startDateTime ?? existing.startDateTime,
      endDateTime: req.body.endDateTime ?? existing.endDateTime,
      instructions: req.body.instructions ?? existing.instructions,
      status: existing.status === 'published' ? 'draft' : (req.body.status ?? existing.status),
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

    const oldQuestionIds = existing.questions.map((id) => id.toString());
    const newQuestionIds = payload.questionIds.map((id) => id.toString());

    const oldStatus = existing.status;
    existing.name = payload.name;
    existing.program = payload.program._id;
    existing.department = payload.program.department;
    existing.subjectTags = payload.subjectTagIds;
    existing.questions = payload.questionIds;
    existing.startDateTime = payload.startDateTime;
    existing.endDateTime = payload.endDateTime;
    existing.instructions = payload.instructions;
    existing.status = payload.status;
    existing.passingThreshold = payload.passingThreshold;
    await existing.save();

    // Handle question state transitions based on exam status
    const targetState = payload.status === 'draft' ? 'in_draft' : 'in_use';
    const removedIds = oldQuestionIds.filter((id) => !newQuestionIds.includes(id));
    const addedIds = newQuestionIds.filter((id) => !oldQuestionIds.includes(id));

    if (removedIds.length > 0) {
      await Question.updateMany({ _id: { $in: removedIds } }, { $set: { state: 'approved' } });
    }
    
    const statusChanged = oldStatus !== payload.status;
    const idsToUpdate = statusChanged ? newQuestionIds : addedIds;

    if (idsToUpdate.length > 0) {
      await Question.updateMany({ _id: { $in: idsToUpdate } }, { $set: { state: targetState } });
    }

    const populated = await MockBoardExam.findById(existing._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');
    await logAudit(req.user._id, 'mock_exam_updated', 'MockBoardExam', existing._id, {
      name: existing.name,
      programId: existing.program,
      oldStatus,
      newStatus: existing.status,
      questionCount: existing.questions?.length || 0,
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
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can delete mock board exams' });
    }

    const exam = await MockBoardExam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, exam.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    // Revert question states before deleting to ensure they aren't stuck in "in_use"
    if (['draft', 'published', 'finished'].includes(exam.status) && exam.questions.length > 0) {
      await Question.updateMany({ _id: { $in: exam.questions } }, { $set: { state: 'approved' } });
    }
    // draft / archived: no question state changes needed

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
    const exams = await MockBoardExam.find({ status: 'published' })
      .populate('program', 'name code')
      .select('name program updatedAt')
      .sort({ updatedAt: -1 });

    res.json({ exams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function archiveExam(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can archive exams' });
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

    // Ensure questions turn to 'retired' when archived
    if (exam.questions && exam.questions.length > 0) {
      await Question.updateMany(
        { _id: { $in: exam.questions } },
        { $set: { state: 'retired' } }
      );
    }
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

async function setResultsReleaseDate(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can schedule result releases' });
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
  setResultsReleaseDate,
};
