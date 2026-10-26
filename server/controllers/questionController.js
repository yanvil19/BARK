const Question = require('../models/Question');
const Tag = require('../models/Tag');
const User = require('../models/User');
const { logAudit } = require('../utils/auditLogger');
const AppSettings = require('../models/AppSettings');
const { encryptText, decryptQuestion } = require('../services/encryptionService');
const {
  collectQuestionImageUrls,
  validateImageReferences,
  deleteUnreferencedImages,
} = require('../services/questionImageService');
const { getAccessibleProgramIds } = require('../utils/programAccess');
const {
  isFilledAnswer,
  normalizeAnswersInput,
  encryptAnswers,
  countAnswerImages,
  getAnswerSubmissionError,
} = require('../utils/questionAnswers');
const crypto = require('crypto');

// Checks a question's image limits from AppSettings. Question images and answer
// images have separate limits. Returns an error message or null.
function getImageLimitError({ images, answers }, settings, prefix = '') {
  const maxImages = settings.maxUploadImages ?? 5;
  if (images.length > maxImages) {
    return `${prefix}Maximum of ${maxImages} images allowed`;
  }

  const maxAnswerImages = settings.maxAnswerImages ?? 5;
  const answerImageCount = countAnswerImages(answers);
  if (answerImageCount > maxAnswerImages) {
    return maxAnswerImages === 0
      ? `${prefix}Answer images are disabled. Remove the images from the answer choices.`
      : `${prefix}Only ${maxAnswerImages} answer choice${maxAnswerImages === 1 ? '' : 's'} per question can have an image`;
  }

  return null;
}

function normalizeImagesInput(images) {
  if (!Array.isArray(images)) return [];
  return [...new Set(images.filter((url) => typeof url === 'string' && url.trim()).map((url) => url.trim()))];
}

// Drops empty answer choices saved before blank rows were filtered out, so they
// never reach an exam. Returns the decrypted, filled choices for validation.
function keepFilledAnswers(question, decrypted) {
  const filled = (decrypted.answers || []).filter(isFilledAnswer);
  if (filled.length !== question.answers.length) {
    const keptIds = new Set(filled.map((answer) => String(answer._id)));
    question.answers = question.answers.filter((answer) => keptIds.has(String(answer._id)));
  }
  return filled;
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
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// GET /api/questions?state=draft
const listQuestions = async (req, res) => {
  try {
    const filter = { createdBy: req.user._id };
    if (req.query.state) filter.state = req.query.state;
    if (req.query.programId) filter.program = req.query.programId;

    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const skip = (page - 1) * limit;

    const [totalItems, questions] = await Promise.all([
      Question.countDocuments(filter),
      Question.find(filter)
        .populate('tag', 'name')
        .populate('program', 'name code')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    const totalPages = Math.max(1, Math.ceil(totalItems / limit));

    res.json({ questions: questions.map(decryptQuestion), totalPages, currentPage: page, totalItems });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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

    res.json({ questions: questions.map(decryptQuestion) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};


// POST /api/questions/group
// Creates multiple Question documents sharing the same groupId.
const createQuestionGroup = async (req, res) => {
  try {
    const { questions: questionsPayload, programId, groupContext } = req.body;

    if (!Array.isArray(questionsPayload) || questionsPayload.length < 2) {
      return res.status(400).json({ message: 'A group must have at least 2 questions' });
    }

    const settings = await AppSettings.getSingleton();

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

    // Validate every member before creating any, so a bad member never leaves a partial group behind
    const members = [];
    for (let i = 0; i < questionsPayload.length; i++) {
      const q = questionsPayload[i];
      const prefix = `Question ${i + 1}: `;

      if (!q.description?.trim()) {
        return res.status(400).json({ message: `${prefix}Question prompt/description is required` });
      }

      const member = { ...q, images: normalizeImagesInput(q.images), answers: normalizeAnswersInput(q.answers) };
      const limitError = getImageLimitError(member, settings, prefix);
      if (limitError) return res.status(400).json({ message: limitError });

      // Validate tag if provided
      if (q.tagId) {
        const tag = await Tag.findById(q.tagId);
        if (!tag || !tag.isActive) return res.status(400).json({ message: `${prefix}invalid or inactive tag` });
        if (tag.program.toString() !== resolvedProgramId)
          return res.status(400).json({ message: `${prefix}tag does not belong to the specified program` });
      }

      members.push(member);
    }

    const imageCheck = await validateImageReferences({
      urls: members.flatMap(collectQuestionImageUrls),
      userId: req.user._id,
    });
    if (!imageCheck.ok) return res.status(400).json({ message: imageCheck.message });

    const groupId = crypto.randomUUID();
    const createdQuestions = [];

    for (let i = 0; i < members.length; i++) {
      const q = members[i];

      const questionData = {
        description: encryptText(q.description.trim()),
        images: q.images,
        answers: encryptAnswers(q.answers),
        rationalization: encryptText(q.rationalization?.trim() || ''),
        tag: q.tagId || null,
        program: resolvedProgramId,
        createdBy: req.user._id,
        state: 'draft',
        // Image flags from import
        image_required: q.image_required || false,
        image_note: q.image_note || null,
        image_flag_removed_by_user: q.image_flag_removed_by_user || false,
        // Group metadata
        groupId,
        groupOrder: i,
        groupContext: groupContext?.trim() || null,
      };

      const question = await Question.create(questionData);
      const populated = await question.populate([
        { path: 'tag', select: 'name' },
        { path: 'program', select: 'name code' },
      ]);
      createdQuestions.push(decryptQuestion(populated));
    }

    await logAudit(req.user._id, 'question_group_created', 'Question', null, {
      groupId,
      programId: resolvedProgramId,
      questionCount: createdQuestions.length,
    });

    res.status(201).json({ questions: createdQuestions, groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// GET /api/questions/group/:groupId — fetch all questions in a group
const getQuestionGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const questions = await Question.find({ groupId, createdBy: req.user._id })
      .populate('tag', 'name')
      .populate('program', 'name code')
      .sort({ groupOrder: 1 });

    if (questions.length === 0) {
      return res.status(404).json({ message: 'Group not found or access denied' });
    }

    res.json({ questions: questions.map(decryptQuestion), groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// POST /api/questions/group/:groupId/submit — submit all questions in a group together
const submitQuestionGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const questions = await Question.find({ groupId, createdBy: req.user._id });

    if (questions.length === 0) {
      return res.status(404).json({ message: 'Question group not found' });
    }

    if (questions.length < 2) {
      return res.status(400).json({ message: 'A grouped question set must have at least 2 questions to submit' });
    }

    // Validate every question in the group against strict board exam rules
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (q.state !== 'draft' && q.state !== 'returned') {
        return res.status(400).json({ message: `Question ${i + 1} is already ${q.state}` });
      }

      const decrypted = decryptQuestion(q);
      const prefix = `Question ${i + 1}: `;

      if (!decrypted.description?.trim()) {
        return res.status(400).json({ message: `${prefix}Question text is required for submission` });
      }
      if (!decrypted.rationalization?.trim()) {
        return res.status(400).json({ message: `${prefix}Rationalization is required for submission` });
      }
      if (!decrypted.tag) {
        return res.status(400).json({ message: `${prefix}A subject tag must be assigned before submission` });
      }

      const answerError = getAnswerSubmissionError(keepFilledAnswers(q, decrypted));
      if (answerError) {
        return res.status(400).json({ message: `${prefix}${answerError}` });
      }
    }

    // Transition all questions to pending_chair
    const submittedQuestions = [];
    for (const question of questions) {
      question.state = 'pending_chair';
      question.submittedAt = new Date();
      question.revisionNote = null;
      question.feedbackRead = false;
      await question.save();

      const populated = await question.populate([
        { path: 'tag', select: 'name' },
        { path: 'program', select: 'name code' },
      ]);
      submittedQuestions.push(decryptQuestion(populated));

      await logAudit(req.user._id, 'question_submitted', 'Question', question._id, {
        programId: question.program,
        tagId: question.tag || null,
        groupId,
        state: question.state,
      });
    }

    res.json({ questions: submittedQuestions, message: 'Question group submitted for review' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// DELETE /api/questions/group/:groupId — delete all questions in a group
const deleteQuestionGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const questions = await Question.find({ groupId, createdBy: req.user._id });

    if (questions.length === 0) {
      return res.status(404).json({ message: 'Question group not found' });
    }

    for (const q of questions) {
      if (q.state !== 'draft' && q.state !== 'rejected') {
        return res.status(400).json({ message: 'Only draft or rejected questions can be deleted' });
      }
      if (q.is_used_in_exam) {
        return res.status(400).json({ message: 'Cannot delete questions that are currently used in an exam' });
      }
    }

    for (const q of questions) {
      await q.deleteOne();
      await logAudit(req.user._id, 'question_deleted', 'Question', q._id, {
        programId: q.program,
        tagId: q.tag || null,
        groupId,
      });
    }

    // Images are removed only after the questions are gone
    await deleteUnreferencedImages(questions.flatMap(collectQuestionImageUrls));

    res.json({ message: 'Question group deleted', groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// PUT /api/questions/group/:groupId — update entire question group (reorder, edit text, choices, context)
const updateQuestionGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { questions: questionsPayload, groupContext } = req.body;

    if (!Array.isArray(questionsPayload) || questionsPayload.length < 2) {
      return res.status(400).json({ message: 'A question group must have at least 2 questions' });
    }

    const existingQuestions = await Question.find({ groupId, createdBy: req.user._id });
    if (existingQuestions.length === 0) {
      return res.status(404).json({ message: 'Question group not found' });
    }

    const editableStates = ['draft', 'returned', 'pending_chair', 'restored'];
    for (const q of existingQuestions) {
      if (!editableStates.includes(q.state)) {
        return res.status(400).json({ message: 'Only draft, returned, pending, or restored question groups can be edited' });
      }
    }

    const settings = await AppSettings.getSingleton();
    const programId = existingQuestions[0].program;

    // Validate payloads
    const members = [];
    for (let i = 0; i < questionsPayload.length; i++) {
      const q = questionsPayload[i];
      const prefix = `Question ${i + 1}: `;
      if (!q.description?.trim()) {
        return res.status(400).json({ message: `${prefix}Question prompt/description is required` });
      }

      const member = { ...q, images: normalizeImagesInput(q.images), answers: normalizeAnswersInput(q.answers) };
      const limitError = getImageLimitError(member, settings, prefix);
      if (limitError) return res.status(400).json({ message: limitError });

      members.push(member);
    }

    // Images already in this group stay valid; anything new must be the user's own upload
    const previousUrls = existingQuestions.flatMap(collectQuestionImageUrls);
    const nextUrls = members.flatMap(collectQuestionImageUrls);
    const imageCheck = await validateImageReferences({
      urls: nextUrls,
      previousUrls,
      userId: req.user._id,
      excludeQuestionIds: existingQuestions.map((q) => q._id),
    });
    if (!imageCheck.ok) return res.status(400).json({ message: imageCheck.message });

    const existingMap = new Map(existingQuestions.map(q => [String(q._id), q]));
    const updatedQuestions = [];

    // Update or create members
    for (let i = 0; i < members.length; i++) {
      const qData = members[i];
      const qId = qData._id ? String(qData._id) : null;
      let questionDoc = qId ? existingMap.get(qId) : null;

      if (questionDoc) {
        questionDoc.description = encryptText(qData.description.trim());
        questionDoc.rationalization = encryptText(qData.rationalization?.trim() || '');
        questionDoc.answers = encryptAnswers(qData.answers);
        questionDoc.tag = qData.tagId || qData.tag?._id || qData.tag || null;
        questionDoc.images = qData.images;
        questionDoc.groupOrder = i;
        questionDoc.groupContext = groupContext?.trim() || null;
        if (questionDoc.state === 'pending_chair' || questionDoc.state === 'restored') {
          questionDoc.state = 'draft';
          questionDoc.currentReviewer = null;
          questionDoc.reviewStartedAt = null;
        }
        await questionDoc.save();
        existingMap.delete(qId);
      } else {
        questionDoc = await Question.create({
          description: encryptText(qData.description.trim()),
          images: qData.images,
          answers: encryptAnswers(qData.answers),
          rationalization: encryptText(qData.rationalization?.trim() || ''),
          tag: qData.tagId || qData.tag?._id || qData.tag || null,
          program: programId,
          createdBy: req.user._id,
          state: 'draft',
          groupId,
          groupOrder: i,
          groupContext: groupContext?.trim() || null,
        });
      }

      const populated = await questionDoc.populate([
        { path: 'tag', select: 'name' },
        { path: 'program', select: 'name code' },
      ]);
      updatedQuestions.push(decryptQuestion(populated));
    }

    // Delete any questions that were removed from the group during edit
    for (const [, removedQ] of existingMap) {
      await removedQ.deleteOne();
    }

    // Now that every change is saved, remove images the group no longer uses
    await deleteUnreferencedImages(previousUrls.filter((url) => !nextUrls.includes(url)));

    await logAudit(req.user._id, 'question_group_updated', 'Question', null, {
      groupId,
      questionCount: updatedQuestions.length,
    });

    res.json({ questions: updatedQuestions, groupId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// POST /api/questions
const createQuestion = async (req, res) => {
  try {
    const { description, answers, tagId, programId, images, rationalization } = req.body;

    if (!description?.trim()) {
      return res.status(400).json({
        message: 'Question text is required'
      });
    }

    // Other fields are optional for drafts; empty answer rows are dropped
    const draft = { images: normalizeImagesInput(images), answers: normalizeAnswersInput(answers) };

    const settings = await AppSettings.getSingleton();
    const limitError = getImageLimitError(draft, settings);
    if (limitError) return res.status(400).json({ message: limitError });

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

    // Validate tag if provided
    if (tagId) {
      const tag = await Tag.findById(tagId);
      if (!tag || !tag.isActive) return res.status(400).json({ message: 'Invalid or inactive tag' });
      if (tag.program.toString() !== resolvedProgramId)
        return res.status(400).json({ message: 'Tag does not belong to the specified program' });
    }

    const imageCheck = await validateImageReferences({
      urls: collectQuestionImageUrls(draft),
      userId: req.user._id,
    });
    if (!imageCheck.ok) return res.status(400).json({ message: imageCheck.message });

    const questionData = {
      description: encryptText(description.trim()),
      images: draft.images,
      answers: encryptAnswers(draft.answers),
      rationalization: encryptText(rationalization?.trim() || ''),
      tag: tagId || null,
      program: resolvedProgramId,
      createdBy: req.user._id,
      state: 'draft',
    };
    const question = await Question.create(questionData);

    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    await logAudit(req.user._id, 'question_created', 'Question', question._id, {
      programId: question.program,
      tagId: question.tag || null,
      state: question.state,
    });
    res.status(201).json({ question: decryptQuestion(populated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// PATCH /api/questions/:id
const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your question' });
    const editableStates = ['draft', 'returned', 'pending_chair', 'restored'];
    if (!editableStates.includes(question.state))
      return res.status(400).json({ message: 'Only draft, returned, pending, or restored questions can be edited' });

    const { description, answers, tagId, images, rationalization } = req.body;
    if (answers && !Array.isArray(answers))
      return res.status(400).json({ message: 'Answers must be an array' });

    const previousUrls = collectQuestionImageUrls(question);
    const next = {
      images: images !== undefined ? normalizeImagesInput(images) : question.images,
      answers: answers ? normalizeAnswersInput(answers) : question.answers,
    };

    // Limits apply to what this request changes, so a text-only edit still saves after a limit is lowered
    const settings = await AppSettings.getSingleton();
    const limitError = getImageLimitError({
      images: images !== undefined ? next.images : [],
      answers: answers ? next.answers : [],
    }, settings);
    if (limitError) return res.status(400).json({ message: limitError });

    const nextUrls = collectQuestionImageUrls(next);
    const imageCheck = await validateImageReferences({
      urls: nextUrls,
      previousUrls,
      userId: req.user._id,
      excludeQuestionIds: [question._id],
    });
    if (!imageCheck.ok) return res.status(400).json({ message: imageCheck.message });

    if (description) question.description = encryptText(description.trim());
    if (rationalization !== undefined) question.rationalization = encryptText(rationalization.trim());
    if (images !== undefined) question.images = next.images;
    if (answers) question.answers = encryptAnswers(next.answers);
    if (tagId !== undefined) question.tag = tagId || null;

    // If a submitted question is edited, pull it back to draft so it can be re-submitted.
    if (question.state === 'pending_chair' || question.state === 'restored') {
      question.state = 'draft';
      question.currentReviewer = null;
      question.reviewStartedAt = null;
    }

    await question.save();

    // Removed images are deleted only once the question has saved successfully
    await deleteUnreferencedImages(previousUrls.filter((url) => !nextUrls.includes(url)));

    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    await logAudit(req.user._id, 'question_updated', 'Question', question._id, {
      programId: question.program,
      tagId: question.tag || null,
      state: question.state,
    });
    res.json({ question: decryptQuestion(populated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// DELETE /api/questions/:id
const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (question.createdBy.toString() !== req.user._id.toString())
      return res.status(403).json({ message: 'Not your question' });
    if (question.state !== 'draft' && question.state !== 'rejected')
      return res.status(400).json({ message: 'Only draft or rejected questions can be deleted' });
    if (question.is_used_in_exam)
      return res.status(400).json({ message: 'Cannot delete a question that is currently used in an exam' });

    await question.deleteOne();
    await deleteUnreferencedImages(collectQuestionImageUrls(question));

    await logAudit(req.user._id, 'question_deleted', 'Question', question._id, {
      programId: question.program,
      tagId: question.tag || null,
    });
    res.json({ message: 'Question deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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

    const decrypted = decryptQuestion(question);

    // --- STRICT SUBMISSION VALIDATION ---
    if (!decrypted.description?.trim()) return res.status(400).json({ message: 'Question text is required for submission' });
    if (!decrypted.rationalization?.trim()) return res.status(400).json({ message: 'Rationalization is required for submission' });
    if (!decrypted.tag) return res.status(400).json({ message: 'A subject tag must be assigned before submission' });

    const answerError = getAnswerSubmissionError(keepFilledAnswers(question, decrypted));
    if (answerError) return res.status(400).json({ message: answerError });
    // ------------------------------------

    question.state = 'pending_chair';
    question.submittedAt = new Date();
    question.revisionNote = null;
    question.feedbackRead = false;
    await question.save();

    const populated = await question.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
    ]);
    await logAudit(req.user._id, 'question_submitted', 'Question', question._id, {
      programId: question.program,
      tagId: question.tag || null,
      state: question.state,
    });
    res.json({ question: decryptQuestion(populated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// POST /api/questions/:id/review (Chair / Dean)
const reviewQuestion = async (req, res) => {
  try {
    if (req.user.role !== 'program_chair' && req.user.role !== 'dean') {
      return res.status(403).json({ message: 'Only Program Chairs and Deans can review questions' });
    }

    const { action, note } = req.body; // action: 'approve', 'return', 'reject', 'restore', 'delete'
    if (!['approve', 'return', 'reject', 'restore', 'reuse', 'delete'].includes(action)) {
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
      requiredState = { $in: ['pending_chair', 'restored'] };
      updateSet = { state: 'approved', currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'return') {
      requiredState = { $in: ['pending_chair', 'restored'] };
      // Guard: cannot return a question that is in an active exam
      const questionToReturn = await Question.findById(questionId).select('is_used_in_exam');
      if (questionToReturn?.is_used_in_exam)
        return res.status(400).json({ message: 'Cannot return a question that is currently used in an exam' });
      updateSet = { state: 'returned', revisionNote: note.trim(), feedbackRead: false, currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'reject') {
      requiredState = { $in: ['pending_chair', 'restored'] };
      updateSet = { state: 'rejected', rejectionReason: note.trim(), feedbackRead: false, currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'restore') {
      requiredState = 'rejected';
      updateSet = { state: 'restored', revisionNote: note?.trim() || null, currentReviewer: null, reviewStartedAt: null };
    } else if (action === 'reuse') {
      return res.status(400).json({ message: 'Questions are reusable once approved and no longer need to be marked for reuse' });
    } else if (action === 'delete') {
      requiredState = 'rejected';
      // Guard: cannot delete a question that is in an active exam
      const questionToDelete = await Question.findById(questionId).select('is_used_in_exam');
      if (questionToDelete?.is_used_in_exam)
        return res.status(400).json({ message: 'Cannot delete a question that is currently used in an exam' });
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
      const question = await Question.findOne(ownershipFilter);
      if (!question) {
        // Check if it exists but state changed
        const exists = await Question.findById(questionId);
        if (!exists) return res.status(404).json({ message: 'Question not found' });
        return res.status(409).json({ message: 'This question has already been reviewed or is no longer in the expected state.' });
      }
      await question.deleteOne();
      await deleteUnreferencedImages(collectQuestionImageUrls(question));

      await logAudit(req.user._id, 'question_reviewed', 'Question', question._id, {
        reviewAction: action,
        role: req.user.role,
        programId: question.program,
      });
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

    // If this question belongs to a group, apply the same review action to all siblings in that group
    let siblingQuestions = [];
    if (updated.groupId) {
      const siblingFilter = {
        groupId: updated.groupId,
        _id: { $ne: updated._id },
        state: requiredState,
      };
      if (req.user.role === 'program_chair') {
        siblingFilter.program = req.user.program;
      } else if (req.user.role === 'dean') {
        const accessibleIds = await getAccessibleProgramIds(req.user);
        siblingFilter.program = { $in: accessibleIds };
      }

      await Question.updateMany(
        siblingFilter,
        { $set: updateSet, ...(action === 'restore' ? { $unset: { rejectionReason: 1 } } : {}) }
      );

      const updatedSiblings = await Question.find({ groupId: updated.groupId })
        .populate('tag', 'name')
        .populate('program', 'name code')
        .populate('createdBy', 'name');
      siblingQuestions = updatedSiblings.map(decryptQuestion);
    }

    const populated = await updated.populate([
      { path: 'tag', select: 'name' },
      { path: 'program', select: 'name code' },
      { path: 'createdBy', select: 'name' },
    ]);
    await logAudit(req.user._id, 'question_reviewed', 'Question', updated._id, {
      reviewAction: action,
      role: req.user.role,
      programId: updated.program,
      note: note?.trim() || null,
      newState: updated.state,
      groupId: updated.groupId || null,
    });
    res.json({
      question: decryptQuestion(populated),
      groupQuestions: siblingQuestions.length > 0 ? siblingQuestions : undefined,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// POST /api/questions/:id/dean-return
const deanReturnApprovedQuestion = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note?.trim()) {
      return res.status(400).json({ message: 'Feedback is required when returning an approved question' });
    }

    // Guard: cannot return a question that is currently in an active exam
    const questionCheck = await Question.findById(req.params.id).select('is_used_in_exam');
    if (!questionCheck) return res.status(404).json({ message: 'Question not found' });
    if (questionCheck.is_used_in_exam)
      return res.status(400).json({ message: 'Cannot return a question that is currently used in an exam' });

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
          feedbackRead: false,
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
    await logAudit(req.user._id, 'question_dean_returned', 'Question', updated._id, {
      programId: updated.program,
      note: note.trim(),
      newState: updated.state,
    });
    res.json({ question: decryptQuestion(populated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// PATCH /api/questions/:id/mark-read
const markQuestionRead = async (req, res) => {
  try {
    const question = await Question.findOne({
      _id: req.params.id,
      createdBy: req.user._id,
    });
    if (!question) return res.status(404).json({ message: 'Question not found' });

    question.feedbackRead = true;
    await question.save();

    res.json({ message: 'Marked as read', questionId: question._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = {
  listQuestions,
  listApprovals,
  createQuestion,
  createQuestionGroup,
  getQuestionGroup,
  updateQuestionGroup,
  submitQuestionGroup,
  deleteQuestionGroup,
  updateQuestion,
  deleteQuestion,
  submitQuestion,
  reviewQuestion,
  deanReturnApprovedQuestion,
  lockQuestion,
  unlockQuestion,
  markQuestionRead,
};
