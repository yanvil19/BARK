const express = require('express');
const multer = require('multer');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const {
  listQuestions,
  listApprovals,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  submitQuestion,
  reviewQuestion,
  deanReturnApprovedQuestion,
  lockQuestion,
  unlockQuestion,
} = require('../controllers/questionController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const AppSettings = require('../models/AppSettings');

const router = express.Router();
const FACULTY = ['professor', 'program_chair', 'dean'];

const r2 = new S3Client({
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  region: 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Allow up to 50 files at the multer level; real limit enforced dynamically from AppSettings
const upload = multer({
  storage: multer.memoryStorage(),
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
router.post('/:id/review', protect, authorizeRoles('program_chair', 'dean'), reviewQuestion);
router.post('/:id/dean-return', protect, authorizeRoles('program_chair', 'dean'), deanReturnApprovedQuestion);
router.patch('/:id/lock', protect, authorizeRoles('program_chair', 'dean'), lockQuestion);
router.patch('/:id/unlock', protect, authorizeRoles('program_chair', 'dean'), unlockQuestion);

// Image upload — returns array of URLs
router.post(
  '/upload-image',
  protect,
  authorizeRoles(...FACULTY),
  upload.array('images', 50),
  async (req, res) => {
    try {
      // Dynamically enforce the limit from AppSettings
      const settings = await AppSettings.getSingleton();
      const maxAllowed = settings.maxUploadImages ?? 5;

      const bucket = process.env.R2_BUCKET_NAME;
      const publicBaseUrl = process.env.R2_PUBLIC_URL;

      if (!bucket || !publicBaseUrl) {
        return res.status(500).json({ message: 'R2 is not configured (missing R2_BUCKET_NAME or R2_PUBLIC_URL)' });
      }

      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded' });
      }

      if (req.files.length > maxAllowed) {
        return res.status(400).json({ message: `Maximum of ${maxAllowed} images allowed per question.` });
      }

      const base = publicBaseUrl.replace(/\/$/, '');
      const urls = await Promise.all(
        req.files.map(async (file) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = path.extname(file.originalname);
          const filename = `${unique}${ext}`;
          const key = `question-images/${filename}`;

          await r2.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: file.buffer,
              ContentType: file.mimetype,
            })
          );

          return `${base}/${key}`;
        })
      );

      return res.json({ urls });
    } catch (err) {
      return res.status(500).json({ message: err?.message || 'Failed to upload images' });
    }
  }
);

module.exports = router;
