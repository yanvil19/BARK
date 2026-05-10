const mongoose = require('mongoose');

const questionResultSchema = new mongoose.Schema({
  label: { type: String, required: true },
  correctRate: { type: Number, required: true, min: 0, max: 100 }
});

const subjectResultSchema = new mongoose.Schema({
  name: { type: String, required: true },
  averageScore: { type: Number, required: true, min: 0, max: 100 },
  correctCount: { type: Number, required: true },
  totalItems: { type: Number, required: true },
  questions: [questionResultSchema]
});

const mockExamResultSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MockBoardExam',
    required: true,
    index: true,
    unique: true // One result record per exam
  },
  examName: {
    type: String,
    required: true
  },
  dateConducted: {
    type: Date,
    required: true
  },
  totalTakers: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  passingThreshold: {
    type: Number,
    required: true,
    min: 1,
    max: 100,
    default: 70
  },
  status: {
    type: String,
    enum: ['pending', 'computed'],
    default: 'pending'
  },
  computedAt: {
    type: Date
  },
  subjects: [subjectResultSchema],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('MockExamResult', mockExamResultSchema);
