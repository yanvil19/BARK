const express = require('express');
const router = express.Router();
const { getSummaryStats } = require('../controllers/statsController');

router.get('/summary', getSummaryStats);
router.get('/program-chair/stats', protect, authorize('program_chair'), getProgramChairStats);

module.exports = router;
