const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RegistrationRequest = require('../models/RegistrationRequest');
const AppSettings = require('../models/AppSettings');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Program = require('../models/Program');
const { validateStudentId, validateAlumniId } = require('../utils/idFormats');
const { logAudit } = require('../utils/auditLogger');

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

// Cookie options for the auth token
// httpOnly: JS cannot read this cookie at all (XSS mitigation)
// secure: only sent over HTTPS (browsers exempt localhost, so dev works fine)
// sameSite: 'none' allows the Render-hosted frontend and backend on different
// subdomains to share this secure, httpOnly auth cookie.
// maxAge: matches the 1d JWT expiry
const AUTH_COOKIE_NAME = 'nu_board_token';
const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 24 * 60 * 60 * 1000, // 1 day in ms
  path: '/',
};

// Generate JWT token
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '1d',
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

    if (role === 'student' || role === 'alumni') {
      return res.status(400).json({ message: 'Student and alumni accounts must be created via student registration' });
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

    await logAudit(req.user._id, 'user_created', 'User', user._id, {
      name: user.name,
      email: user.email,
      role: user.role
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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated. Contact the admins for assistance.' });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Generate token, set it as an httpOnly cookie (never in response body)
    const token = generateToken(user._id, user.role);

    res
      .status(200)
      .cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS)
      .json({
        message: 'Login successful',
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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Logout user (clear cookie)
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = (req, res) => {
  res
    .status(200)
    .cookie(AUTH_COOKIE_NAME, '', { ...AUTH_COOKIE_OPTIONS, maxAge: 0 })
    .json({ message: 'Logged out successfully' });
};

// @desc    Get current logged-in user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const [user, settings] = await Promise.all([
      User.findById(req.user.id)
        .select('-password')
        .populate('department', 'name code')
        .populate('program', 'name code department'),
      AppSettings.getSingleton(),
    ]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const userObj = user.toObject({ virtuals: true });
    userObj.emailCooldownDays = Math.max(Number(settings?.emailCooldownDays) || 0, 0);
    userObj.passwordCooldownDays = Math.max(Number(settings?.passwordCooldownDays) || 0, 0);

    res.status(200).json(userObj);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Update current user's email and/or password (no OTP in this scaffold)
// @route   PATCH /api/auth/update-credentials
// @access  Private
const updateCredentials = async (req, res) => {
  try {
    const { newEmail, newPassword, currentPassword } = req.body || {};

    if (!newEmail && !newPassword) {
      return res.status(400).json({ message: 'Please provide a new email and/or new password' });
    }

    const settings = await AppSettings.getSingleton();
    const emailCooldownDays = Math.max(Number(settings.emailCooldownDays) || 0, 0);
    const passwordCooldownDays = Math.max(Number(settings.passwordCooldownDays) || 0, 0);

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const now = new Date();
    const nowMs = now.getTime();

    if (newEmail) {
      const normalizedEmail = String(newEmail).toLowerCase().trim();

      if (!isValidEmail(normalizedEmail)) {
        return res.status(400).json({ message: 'Please provide a valid email' });
      }

      if (normalizedEmail === user.email) {
        return res.status(400).json({ message: 'New email must be different from your current email' });
      }

      const emailCooldownMs = emailCooldownDays * 24 * 60 * 60 * 1000;
      const effectiveNextEmailAllowedAt =
        user.nextEmailChangeAllowedAt ||
        (user.lastEmailChange && emailCooldownMs
          ? new Date(new Date(user.lastEmailChange).getTime() + emailCooldownMs)
          : null);

      if (effectiveNextEmailAllowedAt && nowMs < new Date(effectiveNextEmailAllowedAt).getTime()) {
        const nextAt = new Date(effectiveNextEmailAllowedAt);
        return res.status(400).json({
          message: `Email can only be changed once every ${emailCooldownDays} days. Try again on ${nextAt.toISOString()}.`,
          nextEmailChangeAt: nextAt.toISOString(),
        });
      }

      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({ message: 'A user with this email already exists' });
      }

      user.email = normalizedEmail;
      user.lastEmailChange = now;
      user.nextEmailChangeAllowedAt = emailCooldownMs ? new Date(nowMs + emailCooldownMs) : null;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Current password is required to change your password' });
      }

      if (String(newPassword).length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }

      const passwordCooldownMs = passwordCooldownDays * 24 * 60 * 60 * 1000;
      const effectiveNextPasswordAllowedAt =
        user.nextPasswordChangeAllowedAt ||
        (user.lastPasswordChange && passwordCooldownMs
          ? new Date(new Date(user.lastPasswordChange).getTime() + passwordCooldownMs)
          : null);

      if (effectiveNextPasswordAllowedAt && nowMs < new Date(effectiveNextPasswordAllowedAt).getTime()) {
        const nextAt = new Date(effectiveNextPasswordAllowedAt);
        return res.status(400).json({
          message: `Password can only be changed once every ${passwordCooldownDays} days. Try again on ${nextAt.toISOString()}.`,
          nextPasswordChangeAt: nextAt.toISOString(),
        });
      }

      const isMatch = await bcrypt.compare(String(currentPassword), user.password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Current password is incorrect' });
      }

      user.password = String(newPassword);
      user.lastPasswordChange = now;
      user.nextPasswordChangeAllowedAt = passwordCooldownMs ? new Date(nowMs + passwordCooldownMs) : null;
    }

    await user.save();

    res.status(200).json({
      message: 'Credentials updated successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        program: user.program,
        lastEmailChange: user.lastEmailChange,
        lastPasswordChange: user.lastPasswordChange,
        nextEmailChangeAllowedAt: user.nextEmailChangeAllowedAt,
        nextPasswordChangeAllowedAt: user.nextPasswordChangeAllowedAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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
    if (req.query.isActive === 'true') filter.isActive = true;
    if (req.query.isActive === 'false') filter.isActive = false;

    const search = (req.query.search || '').trim();
    if (search) {
      const safe = escapeRegExp(search);
      filter.$or = [
        { name: new RegExp(safe, 'i') },
        { email: new RegExp(safe, 'i') },
        { studentId: new RegExp(safe, 'i') },
        { alumniId: new RegExp(safe, 'i') },
      ];
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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Update a user (admin)
// @route   PATCH /api/auth/users/:id
// @access  Private (Super Admin only — enforced in route)
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isSelf = String(req.user._id) === String(req.params.id);

    // Strip email and password from update payload before saving if not self
    if (!isSelf && req.body) {
      delete req.body.email;
      delete req.body.password;
    }

    const { name, email, password, role, studentId, alumniId } = req.body || {};

    if (isSelf && user.role === 'super_admin' && (email !== undefined || password !== undefined)) {
      return res.status(403).json({ message: 'Super Admin cannot update its own email or password from User Management' });
    }

    if (email !== undefined) {
      if (!isValidEmail(email)) return res.status(400).json({ message: 'Please provide a valid email' });
      const normalizedEmail = String(email).toLowerCase().trim();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
      if (existing) return res.status(400).json({ message: 'A user with this email already exists' });
      user.email = normalizedEmail;
    }

    if (typeof name === 'string' && name.trim()) user.name = name.trim();

    if (password !== undefined) {
      if (String(password).length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      user.password = String(password);
    }

    if (role !== undefined) user.role = role;
    if (studentId !== undefined) {
      if (studentId !== null && studentId !== '' && !validateStudentId(studentId)) {
        return res.status(400).json({ message: 'Student ID must be in format YYYY-XXXXXX (e.g., 2026-123456)' });
      }
      // Check for duplicates
      if (studentId) {
        const existingStudentId = await User.findOne({ studentId, _id: { $ne: user._id } });
        if (existingStudentId) {
          return res.status(400).json({ message: 'A student with this Student ID already exists' });
        }
        // Cross-check alumni
        const existingAsAlumni = await User.findOne({ alumniId: studentId, _id: { $ne: user._id } });
        if (existingAsAlumni) {
          return res.status(400).json({ message: 'This ID is already in use by an alumni' });
        }
      }
      user.studentId = studentId || null;
    }

    if (alumniId !== undefined) {
      if (alumniId !== null && alumniId !== '' && !validateAlumniId(alumniId)) {
        return res.status(400).json({ message: 'Alumni ID must be in format YYYY-XXXXXX (e.g., 2026-123456)' });
      }
      // Check for duplicates
      if (alumniId) {
        const existingAlumniId = await User.findOne({ alumniId, _id: { $ne: user._id } });
        if (existingAlumniId) {
          return res.status(400).json({ message: 'An alumni with this Alumni ID already exists' });
        }
        // Cross-check students
        const existingAsStudent = await User.findOne({ studentId: alumniId, _id: { $ne: user._id } });
        if (existingAsStudent) {
          return res.status(400).json({ message: 'This ID is already in use by a student' });
        }
      }
      user.alumniId = alumniId || null;
    }

    // Department / Program updates (IDs)
    let departmentId =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'departmentId') ? req.body.departmentId : undefined;
    let programId =
      req.body && Object.prototype.hasOwnProperty.call(req.body, 'programId') ? req.body.programId : undefined;

    // Allow clearing via null / empty string
    if (departmentId === '' || departmentId === null) departmentId = null;
    if (programId === '' || programId === null) programId = null;

    if (user.role === 'super_admin') {
      user.department = null;
      user.program = null;
    } else if (departmentId !== undefined || programId !== undefined) {
      const nextProgramId = programId === undefined ? (user.program ? String(user.program) : null) : programId;
      let nextDepartmentId = departmentId === undefined ? (user.department ? String(user.department) : null) : departmentId;

      if (nextProgramId && !nextDepartmentId) {
        if (!isObjectId(nextProgramId)) return res.status(400).json({ message: 'Invalid programId' });
        const p = await Program.findById(nextProgramId);
        if (!p) return res.status(400).json({ message: 'Program not found' });
        nextDepartmentId = String(p.department);
      }

      if (nextDepartmentId && !isObjectId(nextDepartmentId)) {
        return res.status(400).json({ message: 'Invalid departmentId' });
      }

      if (nextProgramId && !isObjectId(nextProgramId)) {
        return res.status(400).json({ message: 'Invalid programId' });
      }

      const validation = await ensureDeptProgramValid({ departmentId: nextDepartmentId, programId: nextProgramId });
      if (!validation.ok) return res.status(400).json({ message: validation.message });

      user.department = nextDepartmentId || null;
      user.program = nextProgramId || null;
    }

    await user.save();

    await logAudit(req.user._id, 'user_updated', 'User', user._id, {
      changedFields: Object.keys(req.body || {}).filter(k => k !== 'password')
    });

    const out = await User.findById(user._id)
      .select('-password')
      .populate('department', 'name code')
      .populate('program', 'name code department');

    res.status(200).json({ message: 'User updated', user: out });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Deactivate a user (soft delete)
// @route   PATCH /api/auth/users/:id/deactivate
// @access  Private (Super Admin only — enforced in route)
const deactivateUser = async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'Super admin cannot deactivate itself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = false;
    await user.save();

    await logAudit(req.user._id, 'user_deactivated', 'User', user._id);

    res.status(200).json({ message: 'User deactivated', user: { _id: user._id, isActive: user.isActive } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Activate a user
// @route   PATCH /api/auth/users/:id/activate
// @access  Private (Super Admin only — enforced in route)
const activateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isActive = true;
    await user.save();

    await logAudit(req.user._id, 'user_activated', 'User', user._id);

    res.status(200).json({ message: 'User activated', user: { _id: user._id, isActive: user.isActive } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Delete a user permanently
// @route   DELETE /api/auth/users/:id
// @access  Private (Super Admin only — enforced in route)
const deleteUser = async (req, res) => {
  try {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'Super admin cannot delete itself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    await User.deleteOne({ _id: user._id });

    await logAudit(req.user._id, 'user_deleted', 'User', user._id, {
      name: user.name,
      email: user.email,
      role: user.role,
    });

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// @desc    Student self-registration (creates a pending request)
// @route   POST /api/auth/register-student
// @access  Public
const registerStudentRequest = async (req, res) => {
  try {
    const { name, email, password, departmentId, programId, userType, studentId, alumniId } = req.body;

    if (!name || !email || !password || !departmentId || !programId || !userType) {
      return res.status(400).json({
        message: 'Please provide name, email, password, departmentId, programId, and userType (student or alumni)',
      });
    }

    if (userType !== 'student' && userType !== 'alumni') {
      return res.status(400).json({ message: 'userType must be either "student" or "alumni"' });
    }

    if (userType === 'student' && !studentId) {
      return res.status(400).json({ message: 'Student ID is required for student accounts' });
    }

    if (userType === 'alumni' && !alumniId) {
      return res.status(400).json({ message: 'Alumni ID is required for alumni accounts' });
    }

    if (userType === 'student' && !validateStudentId(studentId)) {
      return res.status(400).json({ message: 'Student ID must be in format YYYY-XXXXXX (e.g., 2026-123456)' });
    }

    if (userType === 'alumni' && !validateAlumniId(alumniId)) {
      return res.status(400).json({ message: 'Alumni ID must be in format YYYY-XXXXXX (e.g., 2026-123456)' });
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

    if (userType === 'student' && studentId) {
      const existingStudentId = await User.findOne({ studentId });
      if (existingStudentId) {
        return res.status(400).json({ message: 'A student with this Student ID already exists' });
      }
      // Cross-check against alumni IDs
      const existingAsAlumni = await User.findOne({ alumniId: studentId });
      if (existingAsAlumni) {
        return res.status(400).json({ message: 'This ID is already in use by an alumni' });
      }
      const pendingStudentId = await RegistrationRequest.findOne({ studentId, status: 'pending' });
      if (pendingStudentId) {
        return res.status(400).json({ message: 'A registration request with this Student ID is already pending' });
      }
      const pendingAsAlumni = await RegistrationRequest.findOne({ alumniId: studentId, status: 'pending' });
      if (pendingAsAlumni) {
        return res.status(400).json({ message: 'This ID is already pending as an alumni registration' });
      }
    }

    if (userType === 'alumni' && alumniId) {
      const existingAlumniId = await User.findOne({ alumniId });
      if (existingAlumniId) {
        return res.status(400).json({ message: 'An alumni with this Alumni ID already exists' });
      }
      // Cross-check against student IDs
      const existingAsStudent = await User.findOne({ studentId: alumniId });
      if (existingAsStudent) {
        return res.status(400).json({ message: 'This ID is already in use by a student' });
      }
      const pendingAlumniId = await RegistrationRequest.findOne({ alumniId, status: 'pending' });
      if (pendingAlumniId) {
        return res.status(400).json({ message: 'A registration request with this Alumni ID is already pending' });
      }
      const pendingAsStudent = await RegistrationRequest.findOne({ studentId: alumniId, status: 'pending' });
      if (pendingAsStudent) {
        return res.status(400).json({ message: 'This ID is already pending as a student registration' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const publicToken = crypto.randomBytes(32).toString('base64url');
    const publicTokenHash = hashPublicToken(publicToken);

    const request = await RegistrationRequest.create({
      name,
      email: normalizedEmail,
      passwordHash,
      publicTokenHash,
      userType,
      studentId: userType === 'student' ? studentId : null,
      alumniId: userType === 'alumni' ? alumniId : null,
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
        userType: request.userType,
        department: request.department,
        program: request.program,
        status: request.status,
        createdAt: request.createdAt,
      },
      token: publicToken,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

// [UX IMPROVEMENT - Check Status]
// @desc    Check registration status (student-facing)
// @route   POST /api/auth/registration-status
// @access  Public
const checkRegistrationStatus = async (req, res) => {
  try {
    // [UX IMPROVEMENT - Check Status]
    const { studentId, email } = req.body || {};

    // [UX IMPROVEMENT - Check Status]
    if (!studentId || !email) {
      return res.status(400).json({ message: 'Please provide studentId and email' });
    }

    // [UX IMPROVEMENT - Check Status]
    const normalizedEmail = String(email).toLowerCase().trim();
    const normalizedStudentId = String(studentId).trim();

    // [UX IMPROVEMENT - Check Status]
    const request = await RegistrationRequest.findOne({
      studentId: normalizedStudentId,
      email: normalizedEmail,
    })
      .populate('program', 'name code department');

    if (!request) {
      return res.status(404).json({ message: 'No registration request found for the provided details.' });
    }

    // [UX IMPROVEMENT - Check Status]
    res.status(200).json({
      request: {
        status: request.status,
        fullName: request.name,
        program: request.program?.name || request.program?.code || '',
        createdAt: request.createdAt,
        updatedAt: request.updatedAt,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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

    if (request.studentId) {
      const existingStudentId = await User.findOne({ studentId: request.studentId });
      if (existingStudentId) {
        return res.status(400).json({ message: 'A student with this Student ID already exists' });
      }
      const existingAsAlumni = await User.findOne({ alumniId: request.studentId });
      if (existingAsAlumni) {
        return res.status(400).json({ message: 'This ID is already in use by an alumni' });
      }
    }
    if (request.alumniId) {
      const existingAlumniId = await User.findOne({ alumniId: request.alumniId });
      if (existingAlumniId) {
        return res.status(400).json({ message: 'An alumni with this Alumni ID already exists' });
      }
      const existingAsStudent = await User.findOne({ studentId: request.alumniId });
      if (existingAsStudent) {
        return res.status(400).json({ message: 'This ID is already in use by a student' });
      }
    }

    const user = new User({
      name: request.name,
      email: request.email,
      password: request.passwordHash,
      role: request.userType,   // 'student' → role:'student', 'alumni' → role:'alumni'
      userType: request.userType,
      studentId: request.studentId,
      alumniId: request.alumniId,
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

    await logAudit(req.user._id, 'registration_approved', 'RegistrationRequest', request._id, {
      userEmail: request.email,
      userId: user._id
    });

    res.status(200).json({
      message: 'Registration request approved; student account created',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        userType: user.userType,
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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
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

    await logAudit(req.user._id, 'registration_rejected', 'RegistrationRequest', request._id, {
      reason: request.rejectionReason
    });

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
    console.error(error);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  updateCredentials,
  listUsers,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
  registerStudentRequest,
  checkRegistrationStatus,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
};
