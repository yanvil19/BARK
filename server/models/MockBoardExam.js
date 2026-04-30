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
    examDate: {
      type: Date,
      required: [true, 'Exam date is required'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      default: 150, // 2.5 hours in minutes
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

module.exports = mongoose.model('MockBoardExam', mockBoardExamSchema);
