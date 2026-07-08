const mongoose = require('mongoose');

const alumniExamAttemptSchema = new mongoose.Schema(
  {
    alumni: {
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
    attemptNumber: {
      type: Number,
      required: true,
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
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
      index: true,
    },
    answers: {
      type: Map,
      of: mongoose.Schema.Types.ObjectId,
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
  },
  { timestamps: true }
);

alumniExamAttemptSchema.index(
  { alumni: 1, exam: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } }
);

module.exports = mongoose.model('AlumniExamAttempt', alumniExamAttemptSchema);
