const path = require('path');
const Document = require('../models/Document');
const Program = require('../models/Program');
const User = require('../models/User');
const {
  ALLOWED_MIME_TYPES,
  EXTENSION_MAP,
  isDocumentStorageConfigured,
  uploadDocumentToR2,
  deleteDocumentFromR2,
} = require('../services/documentStorageService');
const { getAccessibleProgramIds } = require('../utils/programAccess');

/**
 * Resolves a program code (e.g. 'BSCS', 'BSIT', 'BSCE', 'GENERAL') for a given identifier or user program reference.
 */
async function resolveProgramCode(programIdentifier) {
  if (!programIdentifier) return null;
  const str = String(programIdentifier).trim();
  if (str.toUpperCase() === 'GENERAL') return 'GENERAL';

  // Check if identifier is an ObjectId
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    const prog = await Program.findById(str).select('code');
    if (prog?.code) return prog.code.toUpperCase();
  }

  // Otherwise assume it's already a code (e.g. 'BSCS')
  return str.toUpperCase();
}

/**
 * Returns the program codes accessible to a user (based on getAccessibleProgramIds).
 */
async function getAccessibleProgramCodes(user) {
  if (user.role === 'super_admin') {
    const all = await Program.find({ isActive: true }).select('code');
    return all.map((p) => p.code.toUpperCase());
  }

  const ids = await getAccessibleProgramIds(user);
  if (!ids || ids.length === 0) return [];

  const programs = await Program.find({ _id: { $in: ids }, isActive: true }).select('code');
  return programs.map((p) => p.code.toUpperCase());
}

/**
 * List documents with program-based access scoping and optional filters
 *
 * Scoping rules:
 * - Students & Alumni: only see documents where program matches their profile program OR program === 'GENERAL'
 * - Program Chairs: scoped to their specific assigned program and 'GENERAL'
 * - Deans: scoped to programs in their department and 'GENERAL' (or filter by specific accessible program)
 * - Super Admin: all programs and GENERAL
 */
async function listDocuments(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const search = (req.query.search || '').trim();
    const fileType = (req.query.fileType || '').trim().toLowerCase();
    const requestedProgram = (req.query.program || '').trim().toUpperCase();

    const query = {};
    const userRole = req.user.role;

    if (userRole === 'student' || userRole === 'alumni') {
      let userProgramCode = null;
      if (req.user.program) {
        userProgramCode = await resolveProgramCode(req.user.program);
      }

      if (userProgramCode) {
        query.program = { $in: [userProgramCode, 'GENERAL'] };
      } else {
        query.program = 'GENERAL';
      }
    } else if (userRole === 'program_chair') {
      let chairProgramCode = null;
      if (req.user.program) {
        chairProgramCode = await resolveProgramCode(req.user.program);
      }

      const allowedCodes = [chairProgramCode, 'GENERAL'].filter(Boolean);
      query.program = { $in: allowedCodes };

      if (requestedProgram) {
        if (allowedCodes.includes(requestedProgram)) {
          query.program = requestedProgram;
        } else {
          return res.status(403).json({ message: 'Access denied: You can only view documents for your program or GENERAL.' });
        }
      }
    } else if (userRole === 'dean') {
      const accessibleCodes = await getAccessibleProgramCodes(req.user);
      const allowedCodes = [...accessibleCodes, 'GENERAL'];
      query.program = { $in: allowedCodes };

      if (requestedProgram) {
        if (allowedCodes.includes(requestedProgram)) {
          query.program = requestedProgram;
        } else {
          return res.status(403).json({ message: 'Access denied: You can only view documents for programs under your department.' });
        }
      }
    } else if (userRole === 'super_admin' || userRole === 'professor') {
      if (requestedProgram) {
        query.program = requestedProgram;
      }
    }

    // Search filter (title or original filename)
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { originalFilename: { $regex: search, $options: 'i' } },
      ];
    }

    // File type filter
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
 * Strictly enforces that Deans and Program Chairs can only upload to programs they have access to.
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

    // Target program submitted
    let targetProgram = (req.body.program || '').trim().toUpperCase();

    if (req.user.role === 'program_chair') {
      const chairProgramCode = await resolveProgramCode(req.user.program);
      if (!chairProgramCode) {
        return res.status(400).json({ message: 'No program assigned to your account.' });
      }

      // If nothing was provided or matches own program, default to chair's program
      if (!targetProgram || targetProgram === chairProgramCode) {
        targetProgram = chairProgramCode;
      } else if (targetProgram === 'GENERAL') {
        targetProgram = 'GENERAL';
      } else {
        // Attempting to upload to another program
        return res.status(403).json({
          message: `Access denied. Program Chairs can only upload documents for their assigned program (${chairProgramCode}) or GENERAL.`,
        });
      }
    } else if (req.user.role === 'dean') {
      if (!targetProgram) {
        return res.status(400).json({ message: 'Target program is required.' });
      }

      const accessibleCodes = await getAccessibleProgramCodes(req.user);
      const allowedCodes = [...accessibleCodes, 'GENERAL'];

      // Normalize if an ObjectId was submitted
      targetProgram = (await resolveProgramCode(targetProgram)) || targetProgram;

      if (!allowedCodes.includes(targetProgram)) {
        return res.status(403).json({
          message: `Access denied. Deans can only upload documents to programs within their department or GENERAL.`,
        });
      }
    } else if (req.user.role === 'super_admin') {
      targetProgram = (await resolveProgramCode(targetProgram)) || targetProgram || 'GENERAL';
    } else {
      return res.status(403).json({ message: 'Not authorized to upload documents.' });
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

    // Save metadata in database with verified program field
    const newDoc = await Document.create({
      title,
      originalFilename: req.file.originalname,
      fileType: uploadResult.fileType,
      mimeType: uploadResult.mimeType,
      fileSize: uploadResult.fileSize,
      storageKey: uploadResult.storageKey,
      publicUrl: uploadResult.publicUrl,
      program: targetProgram,
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
 * Strictly enforces that Deans and Program Chairs can only delete documents belonging to programs they have access to.
 */
async function deleteDocument(req, res) {
  try {
    const { id } = req.params;
    const document = await Document.findById(id);

    if (!document) {
      return res.status(404).json({ message: 'Document not found.' });
    }

    // Role-based program permission check for deletion
    if (req.user.role === 'program_chair') {
      const chairProgramCode = await resolveProgramCode(req.user.program);
      if (document.program !== chairProgramCode && document.program !== 'GENERAL') {
        return res.status(403).json({ message: 'Access denied: You cannot delete documents from other programs.' });
      }
    } else if (req.user.role === 'dean') {
      const accessibleCodes = await getAccessibleProgramCodes(req.user);
      const allowedCodes = [...accessibleCodes, 'GENERAL'];
      if (!allowedCodes.includes(document.program)) {
        return res.status(403).json({ message: 'Access denied: You cannot delete documents outside your department.' });
      }
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
  resolveProgramCode,
  getAccessibleProgramCodes,
};
