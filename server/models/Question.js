const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: true }
);

const QUESTION_STATES = [
  'draft',
  'pending_chair',
  'returned',
  'approved',
  'rejected',
  'restored',
];

const questionSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      trim: true,
    },
    images: [{ type: String }],
    answers: {
      type: [answerSchema],
    },
    rationalization: {
      type: String,
      trim: true,
      default: '',
    },
    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tag',
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Program',
      required: [true, 'Program is required'],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    state: {
      type: String,
      enum: QUESTION_STATES,
      default: 'draft',
      index: true,
    },
    revisionNote: { type: String, default: null, trim: true },
    rejectionReason: { type: String, default: null, trim: true },
    submittedAt: { type: Date, default: null },
    // Concurrency: track who is currently reviewing this question
    currentReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewStartedAt: { type: Date, default: null },
    // [IMPORT REVIEW - BUBBLE NAVIGATION]
    // Image requirement tracking for imported questions
    image_required: { type: Boolean, default: false },
    image_note: { type: String, default: null, trim: true },
    image_url: { type: String, default: null },
    image_flag_removed_by_user: { type: Boolean, default: false },
    // Tracks whether this question is currently included in at least one exam.
    // When true, the question cannot be returned or deleted.
    is_used_in_exam: { type: Boolean, default: false, index: true },
    // Tracks whether returned/rejected feedback has been viewed/read by the creator
    feedbackRead: { type: Boolean, default: false, index: true },
    // [GROUPED QUESTIONS]
    // Shared UUID string linking all questions in a group. null for solo questions.
    groupId: { type: String, default: null, index: true },
    // 0-based position of this question within the group.
    groupOrder: { type: Number, default: null },
    // Optional shared context/stem text shown above all questions in the group during an exam.
    groupContext: { type: String, default: null, trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
