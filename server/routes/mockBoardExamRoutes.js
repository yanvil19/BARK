const express = require('express');
const {
  listApprovedQuestions,
  createMockBoardExam,
  listMockBoardExams,
  getMockBoardExam,
  updateMockBoardExam,
  deleteMockBoardExam,
} = require('../controllers/mockBoardExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/approved-questions', protect, authorizeRoles('dean'), listApprovedQuestions);
router.get('/', protect, authorizeRoles('dean'), listMockBoardExams);
router.get('/:id', protect, authorizeRoles('dean'), getMockBoardExam);
router.post('/', protect, authorizeRoles('dean'), createMockBoardExam);
router.patch('/:id', protect, authorizeRoles('dean'), updateMockBoardExam);
router.delete('/:id', protect, authorizeRoles('dean'), deleteMockBoardExam);

module.exports = router;
