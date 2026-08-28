const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/importValidation');
const { 
    userImportLimiter,
    geminiMinuteLimiter,
    geminiDailyLimiter
} = require('../middleware/importRateLimit');
const importController = require('../controllers/importController');

/**
 * GET /api/import/limits
 * Get current user's hourly and daily upload limits and reset timer
 */
router.get(
    '/limits',
    protect,
    authorizeRoles('professor', 'program_chair', 'dean'),
    importController.getLimits
);

/**
 * POST /api/import/validate-count
 * Stage 1: Upload file, extract text, AI-count questions, verify <= 20, return token + questionCount
 */
router.post(
    '/validate-count',
    protect,
    authorizeRoles('professor', 'program_chair', 'dean'),
    userImportLimiter, // Per-user hourly (5) and daily (20) limit
    geminiMinuteLimiter,
    geminiDailyLimiter,
    upload.single('file'),
    importController.validateAndCount
);

/**
 * POST /api/import/extract
 * Stage 2: Full question extraction using pre-counted session token
 */
router.post(
    '/extract',
    protect,
    authorizeRoles('professor', 'program_chair', 'dean'),
    geminiMinuteLimiter,
    geminiDailyLimiter,
    importController.extractFromSession
);

/**
 * POST /api/import/upload
 * Upload a file and extract questions using AI (legacy single-stage)
 */
router.post(
    '/upload',
    protect,
    authorizeRoles('professor', 'program_chair', 'dean'),
    userImportLimiter, // Per-user hourly (5) and daily (20) limit
    geminiMinuteLimiter, // Global burst limit
    geminiDailyLimiter, // Global daily limit
    upload.single('file'),
    importController.uploadAndExtract
);

/**
 * GET /api/import/status/:jobId
 * Poll the status of an import job
 */
router.get(
    '/status/:jobId',
    protect,
    // [SECURITY FIX 1]
    authorizeRoles('professor', 'program_chair', 'dean'),
    importController.getStatus
);

/**
 * POST /api/import/submit
 * Save extracted questions to database
 */
router.post(
    '/submit',
    protect,
    // [SECURITY FIX 1]
    authorizeRoles('professor', 'program_chair', 'dean'),
    importController.submitQuestions
);

module.exports = router;
