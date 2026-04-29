const MockBoardExam = require('../models/MockBoardExam');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');

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

async function listApprovedQuestions(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can access approved questions for exam creation' });
    }

    const { program: programId } = req.query;
    const tagIds = parseTagIds(req.query.tags);

    if (!programId) return res.status(400).json({ message: 'Program is required' });
    if (tagIds.length === 0) return res.json({ questions: [] });

    const program = await ensureDeanProgramAccess(req.user, programId);
    if (!program) return res.status(403).json({ message: 'Access denied to this program' });

    const validTags = await Tag.find({ _id: { $in: tagIds }, program: programId, isActive: true }).select('_id');
    const validTagIds = validTags.map((tag) => tag._id.toString());

    if (validTagIds.length === 0) return res.json({ questions: [] });

    const questions = await Question.find({
      program: programId,
      state: 'approved',
      tag: { $in: validTagIds },
    })
      .populate('tag', 'name')
      .populate('program', 'name code')
      .populate('createdBy', 'name')
      .sort({ updatedAt: -1 });

    res.json({ questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
  if (!body.availabilityStart) errors.push('Availability start date and time is required');
  if (subjectTagIds.length === 0) errors.push('At least one subject is required');
  if (questionIds.length === 0) errors.push('At least one approved question is required');
  if (!['draft', 'published', 'archived'].includes(status)) errors.push('Invalid exam status');

  const program = programId ? await ensureDeanProgramAccess(user, programId) : null;
  if (programId && !program) errors.push('Access denied to this program');

  const start = body.availabilityStart ? new Date(body.availabilityStart) : null;
  const end = body.availabilityEnd ? new Date(body.availabilityEnd) : null;

  if (start && Number.isNaN(start.getTime())) errors.push('Invalid availability start date');
  if (end && Number.isNaN(end.getTime())) errors.push('Invalid availability end date');
  if (start && end && end < start) errors.push('Availability end must be later than the start date');

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
      state: 'approved',
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
      availabilityStart: start,
      availabilityEnd: end || null,
      instructions,
      status,
      tags,
      questions,
    },
  };
}

async function createMockBoardExam(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can create mock board exams' });
    }

    const { errors, payload } = await validateExamPayload(req.user, req.body);
    if (errors.length > 0) return res.status(400).json({ message: errors[0], errors });

    const exam = await MockBoardExam.create({
      name: payload.name,
      program: payload.program._id,
      department: payload.program.department,
      subjectTags: payload.subjectTagIds,
      questions: payload.questionIds,
      availabilityStart: payload.availabilityStart,
      availabilityEnd: payload.availabilityEnd,
      instructions: payload.instructions,
      status: payload.status,
      createdBy: req.user._id,
    });

    const populated = await MockBoardExam.findById(exam._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');

    res.status(201).json({ exam: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

async function listMockBoardExams(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can view mock board exams' });
    }

    const programs = await getDeanPrograms(req.user);
    const programIds = programs.map((program) => program._id);

    const exams = await MockBoardExam.find({ program: { $in: programIds } })
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title')
      .populate('createdBy', 'name')
      .sort({ updatedAt: -1 });

    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
}

async function updateMockBoardExam(req, res) {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can update mock board exams' });
    }

    const existing = await MockBoardExam.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Mock board exam not found' });

    const accessible = await ensureDeanProgramAccess(req.user, existing.program);
    if (!accessible) return res.status(403).json({ message: 'Access denied to this exam' });

    const mergedBody = {
      name: req.body.name ?? existing.name,
      programId: req.body.programId ?? existing.program.toString(),
      subjectTagIds: req.body.subjectTagIds ?? existing.subjectTags.map((item) => item.toString()),
      questionIds: req.body.questionIds ?? existing.questions.map((item) => item.toString()),
      availabilityStart: req.body.availabilityStart ?? existing.availabilityStart,
      availabilityEnd: req.body.availabilityEnd === undefined ? existing.availabilityEnd : req.body.availabilityEnd,
      instructions: req.body.instructions ?? existing.instructions,
      status: req.body.status ?? existing.status,
    };

    const { errors, payload } = await validateExamPayload(req.user, mergedBody);
    if (errors.length > 0) return res.status(400).json({ message: errors[0], errors });

    existing.name = payload.name;
    existing.program = payload.program._id;
    existing.department = payload.program.department;
    existing.subjectTags = payload.subjectTagIds;
    existing.questions = payload.questionIds;
    existing.availabilityStart = payload.availabilityStart;
    existing.availabilityEnd = payload.availabilityEnd;
    existing.instructions = payload.instructions;
    existing.status = payload.status;
    await existing.save();

    const populated = await MockBoardExam.findById(existing._id)
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .populate('questions', 'title tag')
      .populate('createdBy', 'name');

    res.json({ exam: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
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

    await exam.deleteOne();
    res.json({ message: 'Mock board exam deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}

module.exports = {
  listApprovedQuestions,
  createMockBoardExam,
  listMockBoardExams,
  getMockBoardExam,
  updateMockBoardExam,
  deleteMockBoardExam,
};
