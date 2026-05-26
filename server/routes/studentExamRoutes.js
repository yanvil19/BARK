const express = require('express');
const {
  getAvailableExams,
  startExam,
  saveProgress,
  submitExam,
  getMyAttempts,
} = require('../controllers/studentExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('student', 'alumni'));

router.get('/available', getAvailableExams);
router.get('/my-attempts', getMyAttempts);
router.post('/:id/start', startExam);
router.patch('/attempt/:attemptId/progress', saveProgress);
router.post('/attempt/:attemptId/submit', submitExam);
router.post('/attempt/:attemptId/violation', require('../controllers/studentExamController').logViolation);

module.exports = router;
