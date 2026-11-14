const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  listDocuments,
  uploadDocument,
  deleteDocument,
  downloadDocument,
} = require('../controllers/documentController');
const {
  ALLOWED_MIME_TYPES,
  EXTENSION_MAP,
} = require('../services/documentStorageService');

const router = express.Router();

// Multer memory storage setup with strict validation
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max per document
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const hasValidExt = Boolean(EXTENSION_MAP[ext]);
    const hasValidMime = Boolean(ALLOWED_MIME_TYPES[file.mimetype]);

    if (hasValidExt || hasValidMime) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only PDF (.pdf), Word (.doc, .docx), PowerPoint (.ppt, .pptx), and Excel (.xls, .xlsx) files are allowed.'
        )
      );
    }
  },
});

// GET /api/documents - Browse documents (students, alumni, dean, program_chair, super_admin, professor)
router.get(
  '/',
  protect,
  authorizeRoles('dean', 'program_chair', 'student', 'alumni', 'super_admin', 'professor'),
  listDocuments
);

// POST /api/documents - Upload document (dean and program_chair only)
router.post(
  '/',
  protect,
  authorizeRoles('dean', 'program_chair'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File is too large. Maximum size is 50MB.' });
        }
        return res.status(400).json({ message: err.message || 'Error processing uploaded file.' });
      }
      next();
    });
  },
  uploadDocument
);

// GET /api/documents/:id/download - Protected download with original filename
router.get(
  '/:id/download',
  protect,
  authorizeRoles('dean', 'program_chair', 'student', 'alumni', 'super_admin', 'professor'),
  downloadDocument
);

// DELETE /api/documents/:id - Delete document (dean and program_chair only)
router.delete(
  '/:id',
  protect,
  authorizeRoles('dean', 'program_chair'),
  deleteDocument
);

module.exports = router;
