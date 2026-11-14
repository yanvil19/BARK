const path = require('path');
const Document = require('../models/Document');
const {
  ALLOWED_MIME_TYPES,
  EXTENSION_MAP,
  isDocumentStorageConfigured,
  uploadDocumentToR2,
  deleteDocumentFromR2,
} = require('../services/documentStorageService');

/**
 * List documents with pagination and optional search filter
 * Accessible to dean, program_chair, student, alumni
 */
async function listDocuments(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').trim();
    const fileType = (req.query.fileType || '').trim().toLowerCase();

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { originalFilename: { $regex: search, $options: 'i' } },
      ];
    }

    if (fileType && Object.values(EXTENSION_MAP).includes(fileType)) {
      query.fileType = fileType;
    }

    const total = await Document.countDocuments(query);
    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('uploadedBy', 'name email role department program')
      .lean();

    return res.json({
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Failed to list documents:', err);
    return res.status(500).json({ message: 'Failed to retrieve documents.' });
  }
}

/**
 * Upload a new document
 * Accessible only to dean and program_chair
 */
async function uploadDocument(req, res) {
  try {
    if (!isDocumentStorageConfigured()) {
      return res.status(500).json({ message: 'Document storage is not configured.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'Please select a file to upload.' });
    }

    const title = (req.body.title || '').trim();
    if (!title) {
      return res.status(400).json({ message: 'Document title is required.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    const mappedType = EXTENSION_MAP[ext] || ALLOWED_MIME_TYPES[req.file.mimetype];
    if (!mappedType) {
      return res.status(400).json({
        message: 'Invalid file type. Only PDF (.pdf), Word (.doc, .docx), PowerPoint (.ppt, .pptx), and Excel (.xls, .xlsx) files are allowed.',
      });
    }

    // Direct upload via PutObjectCommand
    const uploadResult = await uploadDocumentToR2(req.file, req.user._id);

    // Save metadata in database
    const newDoc = await Document.create({
      title,
      originalFilename: req.file.originalname,
      fileType: uploadResult.fileType,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.fileSize,
      storageKey: uploadResult.storageKey,
      publicUrl: uploadResult.publicUrl,
      uploadedBy: req.user._id,
    });

    const populatedDoc = await Document.findById(newDoc._id)
      .populate('uploadedBy', 'name email role department program')
      .lean();

    return res.status(201).json({
      message: 'Document uploaded successfully.',
      document: populatedDoc,
    });
  } catch (err) {
    console.error('Failed to upload document:', err);
    return res.status(500).json({ message: err.message || 'Failed to upload document.' });
  }
}

/**
 * Delete an existing document
 * Accessible only to dean and program_chair
 */
async function deleteDocument(req, res) {
  try {
    const { id } = req.params;
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    // Try deleting from R2 (ignore if missing to allow database cleanup)
    try {
      await deleteDocumentFromR2(document.storageKey);
    } catch (r2Err) {
      console.warn(`Warning: Could not delete R2 object ${document.storageKey}:`, r2Err.message);
    }

    await Document.findByIdAndDelete(id);

    return res.json({ message: 'Document deleted successfully.' });
  } catch (err) {
    console.error('Failed to delete document:', err);
    return res.status(500).json({ message: 'Failed to delete document.' });
  }
}

module.exports = {
  listDocuments,
  uploadDocument,
  deleteDocument,
};
