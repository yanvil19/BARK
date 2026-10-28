const mongoose = require('mongoose');

const questionResultSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
  label: { type: String, required: true },
  description: { type: String, default: '' },
  correctRate: { type: Number, required: true, min: 0, max: 100 },
  answerCounts: [{
    answerId: { type: mongoose.Schema.Types.ObjectId },
    text: { type: String, default: '' },
    image: { type: String, default: null },
    count: { type: Number, default: 0, min: 0 },
    isCorrect: { type: Boolean, default: false },
  }],
  unansweredCount: { type: Number, default: 0, min: 0 },
  groupId: { type: String, default: null },
  groupContext: { type: String, default: null, trim: true },
  groupContextImages: { type: [String], default: [] },
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
  highestScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  lowestScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  // The average of the takers' scores, how many reached the threshold, how many fell
  // short of it by a few points, and the takers per 10-point score range
  overallAverageScore: {
    type: Number,
    min: 0,
    max: 100
  },
  passedCount: {
    type: Number,
    min: 0
  },
  nearMissCount: {
    type: Number,
    min: 0
  },
  scoreDistribution: [{
    _id: false,
    min: Number,
    max: Number,
    below: Number,
    passed: Number
  }],
  totalEligibleStudents: {
    type: Number,
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
