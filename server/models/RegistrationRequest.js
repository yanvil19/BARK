const mongoose = require('mongoose');

const registrationRequestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required'],
      select: false,
    },
    publicTokenHash: {
      type: String,
      required: [true, 'Public token hash is required'],
      select: false,
    },
    role: {
      type: String,
      enum: ['student'],
      default: 'student',
      immutable: true,
    },
    // Distinguish between student and alumni
    userType: {
      type: String,
      enum: ['student', 'alumni'],
      required: [true, 'User type (student or alumni) is required'],
    },
    // Student ID (format: YYYY-XXXXXX)
    studentId: {
      type: String,
      default: null,
      trim: true,
    },
    // Alumni ID (format: YYYY-XXXXXX)
    alumniId: {
      type: String,
      default: null,
      trim: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Program',
      required: [true, 'Program is required'],
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

registrationRequestSchema.index({ email: 1 });

module.exports = mongoose.model('RegistrationRequest', registrationRequestSchema);
