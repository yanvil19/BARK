const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
    },
    role: {
      type: String,
      enum: ['super_admin', 'dean', 'program_chair', 'professor', 'student'],
      required: [true, 'Role is required'],
    },
    // For student/alumni: distinguish between student and alumni
    userType: {
      type: String,
      enum: ['student', 'alumni'],
      default: null,
    },
    // For student: Student ID (format: YYYY-XXXXXX)
    studentId: {
      type: String,
      default: null,
      trim: true,
    },
    // For alumni: Alumni ID (format: YYYY-XXXXXX)
    alumniId: {
      type: String,
      default: null,
      trim: true,
    },
    // For dean, program_chair, professor, student
    department: {
      default: null,
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    // For program_chair, professor, student
    program: {
      default: null,
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Program',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function () {
  if (this._passwordAlreadyHashed) return;
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
