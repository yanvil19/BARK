const express = require('express');
const {
  listApprovedQuestions,
  createMockBoardExam,
  listMockBoardExams, // This is the controller we updated to filter by 'published'
  getMockBoardExam,
  updateMockBoardExam,
  deleteMockBoardExam,
} = require('../controllers/mockBoardExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// 1. PUBLIC ROUTE: Anyone can see the list of published exam metadata
router.get('/', listMockBoardExams); 

// 2. PROTECTED ROUTES: Only Deans can manage or view specific details/questions
router.get('/approved-questions', protect, authorizeRoles('dean'), listApprovedQuestions);
router.get('/:id', protect, authorizeRoles('dean'), getMockBoardExam);
router.post('/', protect, authorizeRoles('dean'), createMockBoardExam);
router.patch('/:id', protect, authorizeRoles('dean'), updateMockBoardExam);
router.delete('/:id', protect, authorizeRoles('dean'), deleteMockBoardExam);

module.exports = router;