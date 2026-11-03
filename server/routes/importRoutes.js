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
 * POST /api/import/extract
 * Upload a file (multipart: file, and tags as a JSON string). Its questions are
 * counted and extracted in one Gemini request and returned for review; the
 * reviewed questions are then saved through /api/questions.
 */
router.post(
    '/extract',
    protect,
    authorizeRoles(...FACULTY),
    userImportLimiter, // Per-user hourly and daily limit
    geminiLimiter, // Turned away early when no Gemini model can take a request
    concurrentImportLimiter, // One import at a time per user
    upload.single('file'),
    importController.importQuestions
);

module.exports = router;
