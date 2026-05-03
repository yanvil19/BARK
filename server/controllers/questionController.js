const Question = require('../models/Question');
const Tag = require('../models/Tag');
const User = require('../models/User');
const Program = require('../models/Program');

// Helper: resolve program IDs accessible to the requesting user
async function getAccessibleProgramIds(user) {
  if (user.role === 'professor' || user.role === 'program_chair') {
    if (!user.program) return [];
    return [user.program.toString()];
  }
  if (user.role === 'dean') {
    if (!user.department) return [];
    const programs = await Program.find({ department: user.department, isActive: true }).select('_id');
    return programs.map((p) => p._id.toString());
  }
  return [];
}

const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

// PATCH /api/questions/:id/lock
const lockQuestion = async (req, res) => {
  try {
    const questionId = req.params.id;
    const userId = req.user._id;

    // One-lock-per-user: release any previous lock this user holds
    await Question.updateMany(
      { currentReviewer: userId, _id: { $ne: questionId } },
      { $set: { currentReviewer: null, reviewStartedAt: null } }
    );

    const now = new Date();
    const staleThreshold = new Date(now.getTime() - LOCK_STALE_MS);

    // Try to acquire lock: succeed if no reviewer, same reviewer, or stale lock
    const updated = await Question.findOneAndUpdate(
      {
        _id: questionId,
        $or: [
          { currentReviewer: null },
          { currentReviewer: userId },
          { reviewStartedAt: { $lt: staleThreshold } },
        ],
      },
      { $set: { currentReviewer: userId, reviewStartedAt: now } },
      { returnDocument: 'after' }
    );

    if (updated) {
      return res.json({ message: 'Lock acquired', lockedAt: now });
    }

    // Lock held by someone else — return 423 with details
    const question = await Question.findById(questionId).populate('currentReviewer', 'name role');
    if (!question) return res.status(404).json({ message: 'Question not found' });

    const elapsed = Math.round((now - question.reviewStartedAt) / 60000);
    return res.status(423).json({
      message: 'Question is currently being reviewed',
      reviewer: {
        name: question.currentReviewer?.name || 'Unknown',
        role: question.currentReviewer?.role || 'unknown',
      },
      minutesElapsed: elapsed,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/questions/:id/unlock
const unlockQuestion = async (req, res) => {
  try {
    await Question.findOneAndUpdate(
      { _id: req.params.id, currentReviewer: req.user._id },
      { $set: { currentReviewer: null, reviewStartedAt: null } }
    );
    res.json({ message: 'Unlocked' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/questions?state=draft
const listQuestions = async (req, res) => {
  try {
    const filter = { createdBy: req.user._id };
    if (req.query.state) filter.state = req.query.state;

    const questions = await Question.find(filter)
      .populate('tag', 'name')
      .populate('program', 'name code')
      .sort({ updatedAt: -1 });

    res.json({ questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET /api/questions/approvals
// For Program Chairs: lists all pending_chair questions for their program
const listApprovals = async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'program_chair') {
      filter = { state: { $ne: 'draft' }, program: req.user.program };
    } else if (req.user.role === 'dean') {
      const programIds = await getAccessibleProgramIds(req.user);
      filter = { state: { $ne: 'draft' }, program: { $in: programIds } };
    } else {
      return res.status(403).json({ message: 'Not authorized to view approvals' });
    }

    const questions = await Question.find(filter)
      .populate('tag', 'name')
      .populate('program', 'name code')
      .populate('createdBy', 'name')
      .populate('currentReviewer', 'name role')
      .sort({ submittedAt: 1, updatedAt: 1 });

    res.json({ questions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/questions
const createQuestion = async (req, res) => {
  try {
    const { title, description, answers, tagId, programId, images } = req.body;

    if (!title?.trim()) return res.status(400).json({ message: 'Question title is required' });
    if (!description?.trim()) return res.status(400).json({ message: 'Question description is required' });
    if (!Array.isArray(answers) || answers.length < 2)
      return res.status(400).json({ message: 'At least 2 answers are required' });
    if (!answers.some((a) => a.isCorrect))
      return res.status(400).json({ message: 'At least one answer must be marked as correct' });
    if (!tagId) return res.status(400).json({ message: 'A topic tag is required' });
    if (Array.isArray(images) && images.length > 5)
      return res.status(400).json({ message: 'Maximum of 5 images allowed' });

    const accessibleIds = await getAccessibleProgramIds(req.user);
    let resolvedProgramId;

    if (req.user.role === 'professor' || req.user.role === 'program_chair') {
      resolvedProgramId = req.user.program?.toString();
    } else if (req.user.role === 'dean') {
      if (!programId) return res.status(400).json({ message: 'Dean must specify a program' });
      if (!accessibleIds.includes(programId))
        return res.status(403).json({ message: 'Access denied to this program' });
      resolvedProgramId = programId;
    }

    if (!resolvedProgramId) return res.status(400).json({ message: 'No program assigned' });

    // Validate tag belongs to resolved program
    const tag = await Tag.findById(tagId);
    if (!tag || !tag.isActive) return res.status(400).json({ message: 'Invalid or inactive tag' });
    if (tag.program.toString() !== resolvedProgramId)
      return res.status(400).json({ message: 'Tag does not belong to the specified program' });

    const question = await Question.create({
      title: title.trim(),
      description: description.trim(),
      images: images || [],
      answers,
      tag: tagId,
      program: resolvedProgramId,
      createdBy: req.user._id,
      state: 'draft',
    });

    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    res.status(201).json({ question: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PATCH /api/questions/:id
const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your question' });
    if (question.state !== 'draft' && question.state !== 'returned')
      return res.status(400).json({ message: 'Only draft or returned questions can be edited' });

    const { title, description, answers, tagId, images } = req.body;
    if (title) question.title = title.trim();
    if (description) question.description = description.trim();
    if (images !== undefined) {
      if (Array.isArray(images) && images.length > 5)
        return res.status(400).json({ message: 'Maximum of 5 images allowed' });
      question.images = images;
    }
    if (answers) {
      if (!Array.isArray(answers) || answers.length < 2)
        return res.status(400).json({ message: 'At least 2 answers are required' });
      if (!answers.some((a) => a.isCorrect))
        return res.status(400).json({ message: 'At least one correct answer is required' });
      question.answers = answers;
    }
    if (tagId) question.tag = tagId;

    await question.save();
    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    res.json({ question: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// DELETE /api/questions/:id
const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your question' });
    if (question.state !== 'draft')
      return res.status(400).json({ message: 'Only draft questions can be deleted' });

    await question.deleteOne();
    res.json({ message: 'Question deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/questions/:id/submit
const submitQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your question' });
    if (question.state !== 'draft' && question.state !== 'returned')
      return res.status(400).json({ message: 'Only draft or returned questions can be submitted' });

    question.state = 'pending_chair';
    question.submittedAt = new Date();
    question.revisionNote = null;
    await question.save();

    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    res.json({ question: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/questions/:id/review (Chair / Dean)
const reviewQuestion = async (req, res) => {
  try {
    if (req.user.role !== 'program_chair' && req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Program Chairs and Deans can review questions' });
    }

    const { action, note } = req.body; // action: 'approve', 'return', 'reject', 'restore', 'delete'
    if (!['approve', 'return', 'reject', 'restore', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    // Validate note requirement before DB hit
    if (action === 'return' && !note?.trim()) {
      return res.status(400).json({ message: 'Revision note is required when returning' });
    }
    if (action === 'reject' && !note?.trim()) {
      return res.status(400).json({ message: 'Rejection reason is required when rejecting' });
    }

    // Build the atomic filter and update based on action
    const questionId = req.params.id;
    let requiredState, updateSet;

    if (action === 'approve') {
      requiredState = 'pending_chair';
      updateSet = { state: 'approved', currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'return') {
      requiredState = 'pending_chair';
      updateSet = { state: 'returned', revisionNote: note.trim(), currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'reject') {
      requiredState = 'pending_chair';
      updateSet = { state: 'rejected', rejectionReason: note.trim(), currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'restore') {
      requiredState = 'rejected';
      updateSet = { state: 'pending_chair', currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'delete') {
      requiredState = 'rejected';
      // delete is handled separately below
    }

    // Build program ownership filter
    const ownershipFilter = { _id: questionId, state: requiredState };
    if (req.user.role === 'program_chair') {
      ownershipFilter.program = req.user.program;
    } else if (req.user.role === 'dean') {
      const accessibleIds = await getAccessibleProgramIds(req.user);
      ownershipFilter.program = { $in: accessibleIds };
    }

    // Handle delete atomically
    if (action === 'delete') {
      const deleted = await Question.findOneAndDelete(ownershipFilter);
      if (!deleted) {
        // Check if it exists but state changed
        const exists = await Question.findById(questionId);
        if (!exists) return res.status(404).json({ message: 'Question not found' });
        return res.status(409).json({ message: 'This question has already been reviewed or is no longer in the expected state.' });
      }
      return res.json({ message: 'Question deleted' });
    }

    // Atomic update for approve/return/reject/restore
    const updated = await Question.findOneAndUpdate(
      ownershipFilter,
      { $set: updateSet, ...(action === 'restore' ? { $unset: { rejectionReason: 1 } } : {}) },
      { returnDocument: 'after' }
    );

    if (!updated) {
      const exists = await Question.findById(questionId);
      if (!exists) return res.status(404).json({ message: 'Question not found' });
      if (exists.program) {
        // Check ownership
        const accessible = await getAccessibleProgramIds(req.user);
        if (!accessible.includes(exists.program.toString())) {
          return res.status(403).json({ message: 'Question does not belong to your accessible programs' });
        }
      }
      return res.status(409).json({ message: 'This question has already been reviewed or is no longer in the expected state.' });
    }

    const populated = await updated.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
      { path: 'createdBy', select: 'name' },
    ]);
    res.json({ question: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// POST /api/questions/:id/dean-return
const deanReturnApprovedQuestion = async (req, res) => {
  try {
    if (req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Deans can return approved questions from exam creation' });
    }

    const { note } = req.body;
    if (!note?.trim()) {
      return res.status(400).json({ message: 'Feedback is required when returning an approved question' });
    }

    const accessibleIds = await getAccessibleProgramIds(req.user);

    // Atomic update: only succeed if state is still 'approved'
    const updated = await Question.findOneAndUpdate(
      {
        _id: req.params.id,
        state: 'approved',
        program: { $in: accessibleIds },
      },
      {
        $set: {
          state: 'returned',
          revisionNote: note.trim(),
          currentReviewer: null,
          reviewStartedAt: null,
        },
      },
      { returnDocument: 'after' }
    );

    if (!updated) {
      const exists = await Question.findById(req.params.id);
      if (!exists) return res.status(404).json({ message: 'Question not found' });
      if (!accessibleIds.includes(exists.program.toString())) {
        return res.status(403).json({ message: 'Question does not belong to your accessible programs' });
      }
      return res.status(409).json({ message: 'This question is no longer in the approved state.' });
    }

    const populated = await updated.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
      { path: 'createdBy', select: 'name' },
    ]);
    res.json({ question: populated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  listQuestions,
  listApprovals,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  submitQuestion,
  reviewQuestion,
  deanReturnApprovedQuestion,
  lockQuestion,
  unlockQuestion,
};
