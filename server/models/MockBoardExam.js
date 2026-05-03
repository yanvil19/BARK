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
      required: [true, 'Start date and time is required'],
    },
    endDateTime: {
      type: Date,
      required: [true, 'End date and time is required'],
      validate: {
        validator: function (value) {
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
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'draft',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

mockBoardExamSchema.virtual('durationMinutes').get(function () {
  if (!this.startDateTime || !this.endDateTime) return null;
  return Math.round((this.endDateTime - this.startDateTime) / 60000);
});

mockBoardExamSchema.set('toJSON', { virtuals: true });
mockBoardExamSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('MockBoardExam', mockBoardExamSchema);
