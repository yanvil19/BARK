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
  copyExam,
  setResultsReleaseDate,
  getEndEarlyStats,
  endExamEarly,
} = require('../controllers/mockBoardExamController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();

// 1. PUBLIC ROUTE: Anyone can see the list of published exam metadata
router.get('/public', listPublishedExams);
router.get('/', protect, authorizeRoles('dean', 'program_chair'), listMockBoardExams); 

// 2. PROTECTED ROUTES: Only Deans can manage or view specific details/questions
router.get('/approved-questions', protect, authorizeRoles('dean', 'program_chair'), listApprovedQuestions);
router.get('/:id', protect, authorizeRoles('dean', 'program_chair'), getMockBoardExam);
router.post('/', protect, authorizeRoles('dean', 'program_chair'), createMockBoardExam);
router.patch('/:id', protect, authorizeRoles('dean', 'program_chair'), updateMockBoardExam);
router.patch('/:id/archive', protect, authorizeRoles('dean', 'program_chair'), archiveExam);
router.post('/:id/copy', protect, authorizeRoles('dean', 'program_chair'), copyExam);
router.get('/:id/end-early-stats', protect, authorizeRoles('dean', 'program_chair'), getEndEarlyStats);
router.post('/:id/end-early', protect, authorizeRoles('dean', 'program_chair'), endExamEarly);
router.patch('/:id/release-results', protect, authorizeRoles('dean', 'program_chair'), setResultsReleaseDate);
router.delete('/:id', protect, authorizeRoles('dean', 'program_chair'), deleteMockBoardExam);

module.exports = router;
