const Question = require('../models/Question');
const Tag = require('../models/Tag');
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
    } else {
      return res.status(403).json({ message: 'Not authorized to view approvals' });
    }

    const questions = await Question.find(filter)
      .populate('tag', 'name')
      .populate('program', 'name code')
      .populate('createdBy', 'name')
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

// POST /api/questions/:id/review (Chair only)
const reviewQuestion = async (req, res) => {
  try {
    if (req.user.role !== 'program_chair') {
      return res.status(403).json({ message: 'Only Program Chairs can review questions at this stage' });
    }

    const { action, note } = req.body; // action: 'approve', 'return', 'reject', 'restore', 'delete'
    if (!['approve', 'return', 'reject', 'restore', 'delete'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action' });
    }

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.program.toString() !== req.user.program?.toString()) {
      return res.status(403).json({ message: 'Question does not belong to your program' });
    }

    if (action === 'delete') {
      if (question.state !== 'rejected') return res.status(400).json({ message: 'Only rejected questions can be deleted' });
      await question.deleteOne();
      return res.json({ message: 'Question deleted' });
    }

    if (action === 'restore') {
      if (question.state !== 'rejected') return res.status(400).json({ message: 'Only rejected questions can be restored' });
      question.state = 'pending_chair';
      question.rejectionReason = undefined;
    } else if (action === 'approve') {
      if (question.state !== 'pending_chair') return res.status(400).json({ message: 'Question is not pending Chair review' });
      question.state = 'approved';
    } else if (action === 'return') {
      if (question.state !== 'pending_chair') return res.status(400).json({ message: 'Question is not pending Chair review' });
      if (!note?.trim()) return res.status(400).json({ message: 'Revision note is required when returning' });
      question.state = 'returned';
      question.revisionNote = note.trim();
    } else if (action === 'reject') {
      if (question.state !== 'pending_chair') return res.status(400).json({ message: 'Question is not pending Chair review' });
      if (!note?.trim()) return res.status(400).json({ message: 'Rejection reason is required when rejecting' });
      question.state = 'rejected';
      question.rejectionReason = note.trim();
    }

    await question.save();
    
    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
      { path: 'createdBy', select: 'name' }
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

    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    const accessibleIds = await getAccessibleProgramIds(req.user);
    if (!accessibleIds.includes(question.program.toString())) {
      return res.status(403).json({ message: 'Question does not belong to your accessible programs' });
    }

    if (question.state !== 'approved') {
      return res.status(400).json({ message: 'Only approved questions can be returned by the Dean' });
    }

    question.state = 'returned';
    question.revisionNote = note.trim();
    await question.save();

    const populated = await question.populate([
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
};
