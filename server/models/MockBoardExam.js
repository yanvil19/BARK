const mongoose = require('mongoose');

const mockBoardExamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Exam name is required'],
      trim: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Program',
      required: [true, 'Program is required'],
      index: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    subjectTags: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tag',
        required: true,
      },
    ],
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true,
      },
    ],
    startDateTime: {
      type: Date,
      default: null,
    },
    endDateTime: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          if (!value || !this.startDateTime) return true;
          return value > this.startDateTime;
        },
        message: 'endDateTime must be after startDateTime',
      },
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    targetAudience: {
      type: String,
      enum: ['student', 'alumni'],
      default: 'student',
      index: true,
    },
    isTimed: {
      type: Boolean,
      default: false,
    },
    timeLimitMinutes: {
      type: Number,
      default: null,
      min: [1, 'Time limit must be at least 1 minute'],
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'ongoing', 'finished', 'archived'],
      default: 'draft',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    resultsReleaseDate: {
      type: Date,
      default: null,
    },
    passingThreshold: {
      type: Number,
      default: 70,
    },
    missedAttemptsProcessedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

mockBoardExamSchema.virtual('durationMinutes').get(function () {
  if (this.targetAudience === 'alumni') {
    return this.isTimed ? this.timeLimitMinutes : null;
  }
  if (!this.startDateTime || !this.endDateTime) return null;
  return Math.round((this.endDateTime - this.startDateTime) / 60000);
});

mockBoardExamSchema.pre('validate', function () {
  if (this.targetAudience === 'alumni') {
    this.startDateTime = null;
    this.endDateTime = null;
    if (!this.isTimed) this.timeLimitMinutes = null;
  } else {
    this.isTimed = false;
    this.timeLimitMinutes = null;
  }
});

module.exports = mongoose.model('MockBoardExam', mockBoardExamSchema);
