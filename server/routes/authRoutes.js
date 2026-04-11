const express = require('express');
const {
  registerUser,
  loginUser,
  getMe,
  listUsers,
  registerStudentRequest,
  checkRegistrationStatus,
  listRegistrationRequests,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();

// @route   POST /api/auth/login
// @access  Public
router.post('/login', loginUser);

// @route   POST /api/auth/register
// @access  Private - Super Admin only
router.post('/register', protect, authorizeRoles('super_admin'), registerUser);

// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, getMe);

// @route   POST /api/auth/register-student
// @access  Public
router.post('/register-student', rateLimit({ windowMs: 60_000, max: 10 }), registerStudentRequest);

// @route   POST /api/auth/registration-status
// @access  Public (requires requestId + token)
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

module.exports = router;
