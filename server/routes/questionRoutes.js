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
  deleteQuestionImagesFromR2,
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

const { encryptBuffer, decryptBuffer } = require('../services/encryptionService');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

// [New] Fetch and decrypt image
router.get('/image/:key', protect, authorizeRoles('student', 'alumni', ...FACULTY), async (req, res) => {
  try {
    const bucket = process.env.R2_BUCKET_NAME;
    if (!bucket) {
      return res.status(500).json({ message: 'R2 is not configured' });
    }

    const obj = await r2.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `question-images/${req.params.key}`,
      })
    );

    const chunks = [];
    for await (const chunk of obj.Body) chunks.push(chunk);
    const encryptedBlob = Buffer.concat(chunks);

    const decrypted = decryptBuffer(encryptedBlob);
    
    // We can use a generic image type or infer it from the key extension
    res.setHeader('Content-Type', 'image/jpeg');
    res.send(decrypted);
  } catch (err) {
    return res.status(404).json({ message: 'Image not found or failed to load' });
  }
});

// [New] Delete image explicitly
router.delete('/image/:key', protect, authorizeRoles(...FACULTY), async (req, res) => {
  try {
    // Reconstruct the URL format expected by deleteQuestionImagesFromR2
    const fakeUrl = `http://dummy.local/question-images/${req.params.key}`;
    await deleteQuestionImagesFromR2([fakeUrl]);
    res.json({ message: 'Image deleted from storage' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete image' });
  }
});

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

      if (!bucket) {
        return res.status(500).json({ message: 'R2 is not configured' });
      }

      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded' });
      }

      if (req.files.length > maxAllowed) {
        return res.status(400).json({ message: `Maximum of ${maxAllowed} images allowed per question.` });
      }

      const urls = await Promise.all(
        req.files.map(async (file) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          const ext = path.extname(file.originalname);
          const filename = `${unique}${ext}`;
          const key = `question-images/${filename}`;

          const encryptedBlob = encryptBuffer(file.buffer);

          await r2.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: encryptedBlob,
              ContentType: 'application/octet-stream', // Store as encrypted binary blob
            })
          );

          // Return the API path to the new decryption route, NOT the R2 public URL
          return `/api/questions/image/${filename}`;
        })
      );

      return res.json({ urls });
    } catch (err) {
      return res.status(500).json({ message: err?.message || 'Failed to upload images' });
    }
  }
);

module.exports = router;
