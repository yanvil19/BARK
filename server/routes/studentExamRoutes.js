const express = require('express');
const {
  getAvailableExams,
  startExam,
  saveProgress,
  submitExam,
} = require('../controllers/studentExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('student'));

router.get('/available', getAvailableExams);
router.post('/:id/start', startExam);
router.patch('/attempt/:attemptId/progress', saveProgress);
router.post('/attempt/:attemptId/submit', submitExam);

module.exports = router;
