const mongoose = require('mongoose');

const studentExamAttemptSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockBoardExam',
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endTime: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
    answers: {
      type: Map,
      of: mongoose.Schema.Types.ObjectId, // Question ID -> Answer ID
      default: {},
    },
    randomizedQuestions: [
      {
        question: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Question',
        },
        answers: [
          {
            type: mongoose.Schema.Types.ObjectId,
          },
        ],
      },
    ],
    score: {
      type: Number,
      default: 0,
    },
    subjectScores: [
      {
        tag: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Tag',
        },
        correct: {
          type: Number,
          default: 0,
        },
        total: {
          type: Number,
          default: 0,
        },
      },
    ],
    autoSubmitted: {
      type: Boolean,
      default: false,
    },
    lateSubmission: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Prevent multiple in-progress attempts for the same exam by the same student
studentExamAttemptSchema.index(
  { student: 1, exam: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } }
);

module.exports = mongoose.model('StudentExamAttempt', studentExamAttemptSchema);
