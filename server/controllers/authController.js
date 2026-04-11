const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RegistrationRequest = require('../models/RegistrationRequest');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Program = require('../models/Program');

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function escapeRegExp(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hashPublicToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

async function resolveDepartmentId(input) {
  if (!input) return null;
  if (isObjectId(input)) return String(input);

  const text = String(input).trim();
  if (!text) return null;

  const code = text.toUpperCase();
  const dept = await Department.findOne({ $or: [{ code }, { name: new RegExp(`^${escapeRegExp(text)}$`, 'i') }] });
  return dept ? String(dept._id) : null;
}

async function resolveProgramId(input, departmentId) {
  if (!input) return null;
  if (isObjectId(input)) return String(input);

  const text = String(input).trim();
  if (!text) return null;

  const code = text.toUpperCase();
  const filter = { $or: [{ code }, { name: new RegExp(`^${escapeRegExp(text)}$`, 'i') }] };
  if (departmentId) filter.department = departmentId;
  const program = await Program.findOne(filter);
  return program ? String(program._id) : null;
}

async function ensureDeptProgramValid({ departmentId, programId }) {
  const dept = departmentId ? await Department.findById(departmentId) : null;
  if (departmentId && !dept) return { ok: false, message: 'Department not found' };
  if (dept && !dept.isActive) return { ok: false, message: 'Department is inactive' };

  const program = programId ? await Program.findById(programId) : null;
  if (programId && !program) return { ok: false, message: 'Program not found' };
  if (program && !program.isActive) return { ok: false, message: 'Program is inactive' };
  if (dept && program && String(program.department) !== String(dept._id)) {
    return { ok: false, message: 'Program does not belong to department' };
  }

  return { ok: true, dept, program };
}

// Generate JWT token
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '7d',
  });

// @desc    Register a new user (admin-created accounts)
// @route   POST /api/auth/register
// @access  Private (Super Admin only — enforced in route)
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, department, program } = req.body;

    // Check for missing required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Please provide name, email, password, and role' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    const departmentId = await resolveDepartmentId(req.body.departmentId || department);
    const programId = await resolveProgramId(req.body.programId || program, departmentId);
    const validation = await ensureDeptProgramValid({ departmentId, programId });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    // Create the user
    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      role,
      department: departmentId || null,
      program: programId || null,
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        program: user.program,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check for missing fields
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // Find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact the administrator.' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generate token and respond
    const token = generateToken(user._id, user.role);

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        program: user.program,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get current logged-in user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('department', 'name code')
      .populate('program', 'name code department');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    List users (admin view)
// @route   GET /api/auth/users
// @access  Private (Super Admin only — enforced in route)
const listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10) || 25;
    const limit = Math.min(Math.max(limitRaw, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.department && isObjectId(req.query.department)) filter.department = req.query.department;
    if (req.query.program && isObjectId(req.query.program)) filter.program = req.query.program;

    const search = (req.query.search || '').trim();
    if (search) {
      const safe = escapeRegExp(search);
      filter.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
    }

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('-password')
        .populate('department', 'name code')
        .populate('program', 'name code department')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
    ]);

    res.status(200).json({
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Student self-registration (creates a pending request)
// @route   POST /api/auth/register-student
// @access  Public
const registerStudentRequest = async (req, res) => {
  try {
    const { name, email, password, departmentId, programId } = req.body;

    if (!name || !email || !password || !departmentId || !programId) {
      return res.status(400).json({
        message: 'Please provide name, email, password, departmentId, and programId',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Please provide a valid email' });
    }

    if (String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    if (!isObjectId(departmentId) || !isObjectId(programId)) {
      return res.status(400).json({ message: 'Invalid departmentId or programId' });
    }

    const validation = await ensureDeptProgramValid({ departmentId, programId });
    if (!validation.ok) {
      return res.status(400).json({ message: validation.message });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const existingRequest = await RegistrationRequest.findOne({
      email: normalizedEmail,
      status: 'pending',
    });
    if (existingRequest) {
      return res.status(400).json({ message: 'A registration request for this email is already pending' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const publicToken = crypto.randomBytes(32).toString('base64url');
    const publicTokenHash = hashPublicToken(publicToken);

    const request = await RegistrationRequest.create({
      name,
      email: normalizedEmail,
      passwordHash,
      publicTokenHash,
      department: departmentId,
      program: programId,
      status: 'pending',
    });

    res.status(201).json({
      message: 'Registration request submitted and awaiting dean approval',
      request: {
        _id: request._id,
        name: request.name,
        email: request.email,
        department: request.department,
        program: request.program,
        status: request.status,
        createdAt: request.createdAt,
      },
      token: publicToken,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Check registration status (student-facing)
// @route   POST /api/auth/registration-status
// @access  Public (requires requestId + token from submission)
const checkRegistrationStatus = async (req, res) => {
  try {
    const { requestId, token } = req.body || {};

    if (!requestId || !token) {
      return res.status(400).json({ message: 'Please provide requestId and token' });
    }

    const request = await RegistrationRequest.findById(requestId)
      .select('+publicTokenHash')
      .populate('department', 'name code')
      .populate('program', 'name code department');
    if (!request) {
      return res.status(404).json({ message: 'Registration request not found' });
    }

    const tokenHash = hashPublicToken(token);
    if (tokenHash !== request.publicTokenHash) {
      return res.status(401).json({ message: 'Invalid registration token' });
    }

    res.status(200).json({
      request: {
        _id: request._id,
        name: request.name,
        email: request.email,
        department: request.department,
        program: request.program,
        status: request.status,
        rejectionReason: request.rejectionReason,
        reviewedAt: request.reviewedAt,
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    List registration requests for dean's department
// @route   GET /api/auth/registrations
// @access  Private (Dean only — enforced in route)
const listRegistrationRequests = async (req, res) => {
  try {
    if (!req.user.department) {
      return res.status(400).json({ message: 'Dean department is not set' });
    }

    const status = (req.query.status || 'pending').trim();
    const allowedStatuses = new Set(['pending', 'approved', 'rejected']);
    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ message: 'Invalid status filter' });
    }

    const requests = await RegistrationRequest.find({
      department: req.user.department,
      status,
    })
      .select('-passwordHash')
      .populate('department', 'name code')
      .populate('program', 'name code department')
      .sort({ createdAt: -1 });

    res.status(200).json({ department: req.user.department, status, count: requests.length, requests });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Approve a student registration request (creates the user)
// @route   PATCH /api/auth/registrations/:id/approve
// @access  Private (Dean only — enforced in route)
const approveRegistrationRequest = async (req, res) => {
  try {
    if (!req.user.department) {
      return res.status(400).json({ message: 'Dean department is not set' });
    }

    const request = await RegistrationRequest.findById(req.params.id).select('+passwordHash');
    if (!request) {
      return res.status(404).json({ message: 'Registration request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    if (String(request.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'You can only approve requests from your department' });
    }

    const existingUser = await User.findOne({ email: request.email });
    if (existingUser) {
      return res.status(400).json({ message: 'A user with this email already exists' });
    }

    const user = new User({
      name: request.name,
      email: request.email,
      password: request.passwordHash,
      role: 'student',
      department: request.department,
      program: request.program,
      isActive: true,
    });
    user._passwordAlreadyHashed = true;
    await user.save();

    request.status = 'approved';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.rejectionReason = null;
    await request.save();

    res.status(200).json({
      message: 'Registration request approved; student account created',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        program: user.program,
        isActive: user.isActive,
      },
      request: {
        _id: request._id,
        status: request.status,
        reviewedAt: request.reviewedAt,
        reviewedBy: request.reviewedBy,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Reject a student registration request
// @route   PATCH /api/auth/registrations/:id/reject
// @access  Private (Dean only — enforced in route)
const rejectRegistrationRequest = async (req, res) => {
  try {
    if (!req.user.department) {
      return res.status(400).json({ message: 'Dean department is not set' });
    }

    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Registration request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ message: `Request is already ${request.status}` });
    }

    if (String(request.department) !== String(req.user.department)) {
      return res.status(403).json({ message: 'You can only reject requests from your department' });
    }

    const reason = req.body && typeof req.body.reason === 'string' ? req.body.reason.trim() : '';

    request.status = 'rejected';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    request.rejectionReason = reason || null;
    await request.save();

    res.status(200).json({
      message: 'Registration request rejected',
      request: {
        _id: request._id,
        status: request.status,
        reviewedAt: request.reviewedAt,
        reviewedBy: request.reviewedBy,
        rejectionReason: request.rejectionReason,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  listUsers,
  registerStudentRequest,
  checkRegistrationStatus,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
};
