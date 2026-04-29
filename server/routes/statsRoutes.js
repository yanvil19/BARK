const express = require('express');
const router = express.Router();

const { getSummaryStats, getProgramChairStats, getDeanDashboardStats } = require('../controllers/statsController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

router.get('/summary', getSummaryStats);

router.get(
  '/program-chair/stats',
  protect,
  authorizeRoles('program_chair'),
  getProgramChairStats
);

router.get(
  '/dean/dashboard',
  protect,
  authorizeRoles('dean'),
  getDeanDashboardStats
);

router.get(
  '/audit-logs',
  protect,
  authorizeRoles('super_admin'),
  require('../controllers/statsController').getAuditLogs
);

module.exports = router;
