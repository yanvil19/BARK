const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/importValidation');
const {
    userImportLimiter,
    geminiLimiter,
    concurrentImportLimiter,
} = require('../middleware/importRateLimit');
const importController = require('../controllers/importController');

const FACULTY = ['professor', 'program_chair', 'dean'];

/**
 * GET /api/import/limits
 * Get current user's hourly and daily upload limits and reset timer
 */
router.get(
    '/limits',
    protect,
    authorizeRoles(...FACULTY),
    importController.getLimits
);

/**
 * POST /api/import/validate-count
 * Step 1: Upload file, extract text, AI-count questions, verify <= 20, return token + questionCount
 */
router.post(
    '/validate-count',
    protect,
    authorizeRoles(...FACULTY),
    userImportLimiter, // Per-user hourly and daily limit
    geminiLimiter, // Global Gemini per-minute and daily limit
    concurrentImportLimiter, // One import at a time per user
    upload.single('file'),
    importController.validateAndCount
);

/**
 * POST /api/import/extract
 * Step 2: Full question extraction using the session token from step 1.
 * The reviewed questions are then saved through /api/questions.
 */
router.post(
    '/extract',
    protect,
    authorizeRoles(...FACULTY),
    geminiLimiter,
    concurrentImportLimiter,
    importController.extractFromSession
);

module.exports = router;
