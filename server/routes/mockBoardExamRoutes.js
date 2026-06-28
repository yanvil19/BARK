const express = require('express');
const {
  listApprovedQuestions,
  createMockBoardExam,
  listMockBoardExams,
  getMockBoardExam,
  updateMockBoardExam,
  deleteMockBoardExam,
  listPublishedExams,
  archiveExam,
  reuseArchivedExam,
  setResultsReleaseDate,
} = require('../controllers/mockBoardExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// 1. PUBLIC ROUTE: Anyone can see the list of published exam metadata
router.get('/public', listPublishedExams);
router.get('/', protect, authorizeRoles('dean'), listMockBoardExams); 

// 2. PROTECTED ROUTES: Only Deans can manage or view specific details/questions
router.get('/approved-questions', protect, authorizeRoles('dean'), listApprovedQuestions);
router.get('/:id', protect, authorizeRoles('dean'), getMockBoardExam);
router.post('/', protect, authorizeRoles('dean'), createMockBoardExam);
router.patch('/:id', protect, authorizeRoles('dean'), updateMockBoardExam);
router.patch('/:id/archive', protect, authorizeRoles('dean'), archiveExam);
router.post('/:id/reuse', protect, authorizeRoles('dean'), reuseArchivedExam);
router.patch('/:id/release-results', protect, authorizeRoles('dean'), setResultsReleaseDate);
router.delete('/:id', protect, authorizeRoles('dean'), deleteMockBoardExam);

module.exports = router;
