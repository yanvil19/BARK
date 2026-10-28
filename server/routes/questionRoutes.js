const express = require('express');
const multer = require('multer');
const Question = require('../models/Question');
const {
  listQuestions,
  listApprovals,
  createQuestion,
  createQuestionGroup,
  getQuestionGroup,
  updateQuestionGroup,
  submitQuestionGroup,
  deleteQuestionGroup,
  updateQuestion,
  deleteQuestion,
  submitQuestion,
  reviewQuestion,
  deanReturnApprovedQuestion,
  lockQuestion,
  unlockQuestion,
  markQuestionRead,
} = require('../controllers/questionController');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const AppSettings = require('../models/AppSettings');
const {
  isStorageConfigured,
  isValidImageFilename,
  toImageUrl,
  imageReferenceFilter,
  uploadQuestionImage,
  getImageUploader,
  readQuestionImage,
  deleteImageObject,
  canViewQuestionImage,
} = require('../services/questionImageService');

const router = express.Router();
const FACULTY = ['professor', 'program_chair', 'dean'];

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
// [GROUPED QUESTIONS] — must be before /:id routes so 'group' isn't treated as an ID
router.post('/group', protect, authorizeRoles(...FACULTY), createQuestionGroup);
router.get('/group/:groupId', protect, authorizeRoles(...FACULTY), getQuestionGroup);
router.put('/group/:groupId', protect, authorizeRoles(...FACULTY), updateQuestionGroup);
router.post('/group/:groupId/submit', protect, authorizeRoles(...FACULTY), submitQuestionGroup);
router.delete('/group/:groupId', protect, authorizeRoles(...FACULTY), deleteQuestionGroup);
router.patch('/:id', protect, authorizeRoles(...FACULTY), updateQuestion);
router.patch('/:id/mark-read', protect, authorizeRoles(...FACULTY), markQuestionRead);
router.delete('/:id', protect, authorizeRoles(...FACULTY), deleteQuestion);
router.post('/:id/submit', protect, authorizeRoles(...FACULTY), submitQuestion);
router.post('/:id/review', protect, authorizeRoles('program_chair', 'dean'), reviewQuestion);
router.post('/:id/dean-return', protect, authorizeRoles('program_chair', 'dean'), deanReturnApprovedQuestion);
router.patch('/:id/lock', protect, authorizeRoles('program_chair', 'dean'), lockQuestion);
router.patch('/:id/unlock', protect, authorizeRoles('program_chair', 'dean'), unlockQuestion);

// Decrypted images are confidential: no browser, proxy or CDN may keep a copy.
function setNoStoreHeaders(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

// Fetch and decrypt a question or answer image
router.get('/image/:key', protect, authorizeRoles('student', 'alumni', ...FACULTY), async (req, res) => {
  setNoStoreHeaders(res);

  try {
    const filename = req.params.key;
    if (!isValidImageFilename(filename)) {
      return res.status(404).json({ message: 'Image not found' });
    }

    if (!isStorageConfigured()) {
      return res.status(500).json({ message: 'R2 is not configured' });
    }

    // Check access before anything is read from storage
    const access = await canViewQuestionImage(req.user, filename);
    if (!access.allowed) {
      return access.status === 403
        ? res.status(403).json({ message: 'Not authorized to view this image' })
        : res.status(404).json({ message: 'Image not found' });
    }

    const { buffer, contentType } = await readQuestionImage(filename);

    res.setHeader('Content-Type', contentType);
    return res.send(buffer);
  } catch (err) {
    return res.status(404).json({ message: 'Image not found or failed to load' });
  }
});

// Discard an uploaded image that was never saved to a question. Images that a
// question uses are removed by the server once the question change is saved.
router.delete('/image/:key', protect, authorizeRoles(...FACULTY), async (req, res) => {
  try {
    const filename = req.params.key;
    if (!isValidImageFilename(filename) || !isStorageConfigured()) {
      return res.status(404).json({ message: 'Image not found' });
    }

    if (await Question.exists(imageReferenceFilter(toImageUrl(filename)))) {
      return res.status(409).json({ message: 'Image is used by a saved question' });
    }

    const uploader = await getImageUploader(filename);
    if (!uploader || uploader !== String(req.user._id)) {
      return res.status(404).json({ message: 'Image not found' });
    }

    await deleteImageObject(filename);
    return res.json({ message: 'Image deleted from storage' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to delete image' });
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

      if (!isStorageConfigured()) {
        return res.status(500).json({ message: 'R2 is not configured' });
      }

      if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ message: 'No images uploaded' });
      }

      if (req.files.length > maxAllowed) {
        return res.status(400).json({ message: `Maximum of ${maxAllowed} images allowed per question.` });
      }

      // Returns the API path to the decrypting image route, NOT an R2 URL
      const urls = await Promise.all(req.files.map((file) => uploadQuestionImage(file, req.user._id)));

      return res.json({ urls });
    } catch (err) {
      return res.status(500).json({ message: err?.message || 'Failed to upload images' });
    }
  }
);

module.exports = router;
