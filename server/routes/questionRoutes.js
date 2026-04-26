const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  listQuestions,
  listApprovals,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  submitQuestion,
  reviewQuestion,
} = require('../controllers/questionController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');

const router = express.Router();
const FACULTY = ['professor', 'program_chair', 'dean'];

// Multer setup for question images
const uploadDir = path.join(__dirname, '..', 'uploads', 'question-images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WEBP files are allowed'));
  },
});

router.get('/', protect, authorizeRoles(...FACULTY), listQuestions);
router.get('/approvals', protect, authorizeRoles('program_chair', 'dean'), listApprovals);
router.post('/', protect, authorizeRoles(...FACULTY), createQuestion);
router.patch('/:id', protect, authorizeRoles(...FACULTY), updateQuestion);
router.delete('/:id', protect, authorizeRoles(...FACULTY), deleteQuestion);
router.post('/:id/submit', protect, authorizeRoles(...FACULTY), submitQuestion);
router.post('/:id/review', protect, authorizeRoles('program_chair'), reviewQuestion);

// Image upload — returns array of URLs
router.post(
  '/upload-image',
  protect,
  authorizeRoles(...FACULTY),
  upload.array('images', 5),
  (req, res) => {
    const urls = req.files.map((f) => `/uploads/question-images/${f.filename}`);
    res.json({ urls });
  }
);

module.exports = router;
