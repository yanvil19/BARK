const express = require('express');
const router = express.Router();
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const upload = require('../middleware/importValidation');
const { 
    importHourlyLimiter,
    geminiMinuteLimiter,
    geminiDailyLimiter
} = require('../middleware/importRateLimit');
const importController = require('../controllers/importController');

/**
 * POST /api/import/upload
 * Upload a file and extract questions using AI
 */
router.post(
    '/upload',
    protect,
    importHourlyLimiter, // Per-user hourly limit
    // [SECURITY FIX 2]
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
