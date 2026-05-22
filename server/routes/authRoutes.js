const express = require('express');
const { rateLimit: expressRateLimit } = require('express-rate-limit');
const {
  registerUser,
  loginUser,
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
} = require('../controllers/authController');
const User = require('../models/User');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// [SECURITY FIX 2]
const loginRateLimiter = expressRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { message: 'Too many login attempts, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// @route   POST /api/auth/login
// @access  Public
router.post(
  '/login',
  // [SECURITY FIX 2]
  loginRateLimiter,
  loginUser
);

// @route   POST /api/auth/register
// @access  Private - Super Admin only
router.post('/register', protect, authorizeRoles('super_admin'), registerUser);

// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, getMe);

// @route   PATCH /api/auth/update-credentials
// @access  Private
router.patch('/update-credentials', protect, updateCredentials);

// @route   POST /api/auth/register-student
// @access  Public
router.post('/register-student', rateLimit({ windowMs: 60_000, max: 10 }), registerStudentRequest);

// [UX IMPROVEMENT - Check Status]
// @route   POST /api/auth/registration-status
// @access  Public (studentId + email)
router.post('/registration-status', rateLimit({ windowMs: 60_000, max: 30 }), checkRegistrationStatus);

// @route   GET /api/auth/registrations
// @access  Private - Dean only
router.get('/registrations', protect, authorizeRoles('dean'), listRegistrationRequests);

// @route   PATCH /api/auth/registrations/:id/approve
// @access  Private - Dean only
router.patch('/registrations/:id/approve', protect, authorizeRoles('dean'), approveRegistrationRequest);

// @route   PATCH /api/auth/registrations/:id/reject
// @access  Private - Dean only
router.patch('/registrations/:id/reject', protect, authorizeRoles('dean'), rejectRegistrationRequest);

// @route   GET /api/auth/users
// @access  Private - Super Admin only
router.get('/users', protect, authorizeRoles('super_admin'), listUsers);

// @route   PATCH /api/auth/users/:id
// @access  Private - Super Admin only
router.patch('/users/:id', protect, authorizeRoles('super_admin'), updateUser);

// @route   PATCH /api/auth/users/:id/email-toggle
// @access  Private - Super Admin only
router.patch('/users/:id/email-toggle', protect, authorizeRoles('super_admin'), async (req, res) => {
  try {
    const { receiveEmails } = req.body || {};

    if (typeof receiveEmails !== 'boolean') {
      return res.status(400).json({ message: 'receiveEmails must be a boolean' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { receiveEmails },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json(updatedUser);
  } catch (err) {
    console.error('Email toggle update error:', err);
    return res.status(500).json({ message: 'Failed to update email preference' });
  }
});

// @route   PATCH /api/auth/users/:id/deactivate
// @access  Private - Super Admin only (soft delete)
router.patch('/users/:id/deactivate', protect, authorizeRoles('super_admin'), deactivateUser);

// @route   PATCH /api/auth/users/:id/activate
// @access  Private - Super Admin only
router.patch('/users/:id/activate', protect, authorizeRoles('super_admin'), activateUser);

// @route   DELETE /api/auth/users/:id
// @access  Private - Super Admin only
router.delete('/users/:id', protect, authorizeRoles('super_admin'), deleteUser);

module.exports = router;
