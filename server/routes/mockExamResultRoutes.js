const express = require('express');
const { 
  listExamsWithStatus,
  getResult, 
  computeResults, 
  deleteResult,
  getStudentResults
} = require('../controllers/mockExamResultController');
const { getAiOverview, generateAiOverview } = require('../controllers/examAiOverviewController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// All routes are protected and restricted to deans
router.use(protect);
router.use(authorizeRoles('dean', 'program_chair'));

router.get('/list', listExamsWithStatus);
router.get('/:examId', getResult);
router.get('/:examId/students', getStudentResults);
router.post('/:examId/compute', computeResults);
router.get('/:examId/ai-overview', getAiOverview);
router.post('/:examId/ai-overview', generateAiOverview);
router.delete('/:examId', deleteResult);

module.exports = router;
