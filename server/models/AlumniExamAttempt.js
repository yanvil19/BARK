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
    // What the answers are worth under the exam's points (score stays the number right).
    // Empty on attempts marked before points were kept.
    pointsEarned: {
      type: Number,
      default: null,
    },
    pointsTotal: {
      type: Number,
      default: null,
    },
    // Where the taker is, kept so a refresh can't reset it: the stop they are on (-1 the
    // introduction, the question count the summary), the last stop reached (one-way
    // navigation), and each question's time left and spent (question timers)
    runState: {
      currentIdx: { type: Number, default: -1 },
      furthestIdx: { type: Number, default: 0 },
      timeLeftMs: { type: Map, of: Number, default: {} },
      spentMs: { type: Map, of: Number, default: {} },
      savedAt: { type: Date, default: null },
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
