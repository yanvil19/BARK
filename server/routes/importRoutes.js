const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/importValidation');
const { 
    importHourlyLimiter,
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
    importController.getStatus
);

/**
 * POST /api/import/submit
 * Save extracted questions to database
 */
router.post(
    '/submit',
    protect,
    importController.submitQuestions
);

module.exports = router;
