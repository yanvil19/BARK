const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: true }
);

const QUESTION_STATES = [
  'draft',
  'pending_chair',
  'returned',
  'approved',
  'in_use',
  'retired',
  'rejected',
];

const questionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Question title is required'],
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Question description is required'],
      trim: true,
    },
    images: [{ type: String }],
    answers: {
      type: [answerSchema],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length >= 2,
        message: 'At least 2 answers are required',
      },
    },
    tag: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tag',
      required: [true, 'A topic tag is required'],
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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Question', questionSchema);
