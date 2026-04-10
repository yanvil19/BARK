const express = require('express');
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

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

module.exports = router;
