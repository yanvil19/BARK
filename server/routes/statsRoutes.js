const express = require('express');
const router = express.Router();

const { getSummaryStats, getProgramChairStats } = require('../controllers/statsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/summary', getSummaryStats);

router.get(
  '/program-chair/stats',
  protect,
  authorizeRoles('program_chair'),
  getProgramChairStats
);

module.exports = router;