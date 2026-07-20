const express = require('express');
const {
  getAvailableExams,
  startExam,
  submitExam,
  getMyAttempts,
  getDashboardAttempts,
  getAttemptDetails,
} = require('../controllers/alumniExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorizeRoles('alumni'));

router.get('/available', getAvailableExams);
router.get('/my-attempts', getDashboardAttempts);
router.get('/:examId/my-attempts', getMyAttempts);
router.get('/attempt/:attemptId', getAttemptDetails);
router.post('/:id/start', startExam);
router.post('/attempt/:attemptId/submit', submitExam);

module.exports = router;
