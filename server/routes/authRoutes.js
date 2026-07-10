const express = require('express');
const { rateLimit: expressRateLimit } = require('express-rate-limit');
const crypto = require('node:crypto');
const {
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
} = require('../controllers/authController');
const User = require('../models/User');
const { sendEmail } = require('../utils/emailService');
const { passwordResetTemplate } = require('../emails/templates/passwordResetTemplate');
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

const forgotPasswordRateLimiter = expressRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  message: { message: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// @route   POST /api/auth/login
// @access  Public
router.post(
  '/login',
  // [SECURITY FIX 2]
  loginRateLimiter,
  loginUser
);

// @route   POST /api/auth/logout
// @access  Public
router.post('/logout', logoutUser);

// @route   POST /api/auth/forgot-password
// @access  Public
router.post('/forgot-password', forgotPasswordRateLimiter, async (req, res) => {
  const genericMessage = { message: 'If this email is registered, you will receive a reset code shortly.' };

  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !isValidEmail(email)) {
      return res.status(200).json(genericMessage);
    }

    const user = await User.findOne({ email });
    if (!user || user.receiveEmails === false) {
      return res.status(200).json(genericMessage);
    }

    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    user.passwordResetOTP = otp;
    user.passwordResetOTPExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.passwordResetOTPAttempts = 0;
    await user.save();

    const { subject, html } = passwordResetTemplate(otp);
    await sendEmail({ to: user.email, subject, html, user });

    return res.status(200).json(genericMessage);
  } catch (error) {
    console.error('forgot-password error:', error);
    return res.status(200).json(genericMessage);
  }
});

// @route   POST /api/auth/reset-password
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp = String(req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    if (!otp) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    if ((user.passwordResetOTPAttempts || 0) >= 3) {
      return res.status(400).json({ message: 'Too many attempts. Please request a new code.' });
    }

    if (!user.passwordResetOTP || user.passwordResetOTP !== otp) {
      user.passwordResetOTPAttempts = (user.passwordResetOTPAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: 'Invalid OTP.' });
    }

    if (!user.passwordResetOTPExpiry || Date.now() > new Date(user.passwordResetOTPExpiry).getTime()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
    }

    user.password = newPassword;
    user.passwordResetOTP = null;
    user.passwordResetOTPExpiry = null;
    user.passwordResetOTPAttempts = 0;
    await user.save();

    return res.status(200).json({ message: 'Password reset successful.' });
  } catch (error) {
    console.error('reset-password error:', error);
    return res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

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
router.get('/registrations', protect, authorizeRoles('dean', 'program_chair'), listRegistrationRequests);

// @route   PATCH /api/auth/registrations/:id/approve
// @access  Private - Dean only
router.patch('/registrations/:id/approve', protect, authorizeRoles('dean', 'program_chair'), approveRegistrationRequest);

// @route   PATCH /api/auth/registrations/:id/reject
// @access  Private - Dean only
router.patch('/registrations/:id/reject', protect, authorizeRoles('dean', 'program_chair'), rejectRegistrationRequest);

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
