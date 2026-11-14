const path = require('path');
const request = require('supertest');
const app = require('../app');
const Document = require('../models/Document');
const User = require('../models/User');
const { createTestUser, createTestDean, createTestProgramChair } = require('./helpers');

// Mock document storage service
jest.mock('../services/documentStorageService', () => {
  const actual = jest.requireActual('../services/documentStorageService');
  const nodePath = require('path');
  return {
    ...actual,
    isDocumentStorageConfigured: jest.fn().mockReturnValue(true),
    uploadDocumentToR2: jest.fn().mockImplementation(async (file, uploaderId) => {
      const ext = nodePath.extname(file.originalname).toLowerCase();
      const fileType = actual.EXTENSION_MAP[ext] || 'pdf';
      return {
        storageKey: `academic-docs/test-uuid${ext}`,
        publicUrl: `https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/test-uuid${ext}`,
        fileType,
        mimeType: file.mimetype,
        fileSize: file.size || 1024,
      };
    }),
    deleteDocumentFromR2: jest.fn().mockResolvedValue(),
  };
});

describe('Document Upload and Download API', () => {
  let deanToken;
  let chairToken;
  let studentToken;
  let deanUser;
  let chairUser;
  let studentUser;

  beforeEach(async () => {
    // Create users using test helpers
    deanUser = await createTestDean({ email: 'dean.docs@nu-baliwag.edu.ph' });
    chairUser = await createTestProgramChair({ email: 'chair.docs@nu-baliwag.edu.ph' });
    studentUser = await createTestUser({ email: 'student.docs@nu-baliwag.edu.ph', role: 'student' });

    // Generate tokens
    const jwt = require('jsonwebtoken');
    deanToken = jwt.sign({ id: deanUser._id }, process.env.JWT_SECRET);
    chairToken = jwt.sign({ id: chairUser._id }, process.env.JWT_SECRET);
    studentToken = jwt.sign({ id: studentUser._id }, process.env.JWT_SECRET);
  });

  describe('POST /api/documents', () => {
    it('allows dean to upload valid PDF document', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${deanToken}`)
        .field('title', 'Board Exam Syllabus')
        .attach('file', Buffer.from('%PDF-1.4 test content'), 'syllabus.pdf');

      expect(res.status).toBe(201);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.title).toBe('Board Exam Syllabus');
      expect(res.body.document.fileType).toBe('pdf');
      expect(res.body.document.publicUrl).toContain('r2.dev');
      expect(String(res.body.document.uploadedBy._id)).toBe(String(deanUser._id));
    });

    it('allows program chair to upload Word document (.docx)', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${chairToken}`)
        .field('title', 'Reviewer Module 1')
        .attach(
          'file',
          Buffer.from('dummy docx data'),
          { filename: 'reviewer1.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
        );

      expect(res.status).toBe(201);
      expect(res.body.document.fileType).toBe('docx');
    });

    it('rejects disallowed file extensions (e.g., .exe, .png, .js)', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${deanToken}`)
        .field('title', 'Malicious Script')
        .attach('file', Buffer.from('alert(1)'), 'script.js');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid file type');
    });

    it('denies student role from uploading documents', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${studentToken}`)
        .field('title', 'Student Document')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'sample.pdf');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/documents', () => {
    beforeEach(async () => {
      await Document.create([
        {
          title: 'Nursing Board Primer',
          originalFilename: 'primer.pdf',
          fileType: 'pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          storageKey: 'academic-docs/primer.pdf',
          publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/primer.pdf',
          uploadedBy: deanUser._id,
        },
        {
          title: 'Math Formula Sheet',
          originalFilename: 'math.xlsx',
          fileType: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: 4096,
          storageKey: 'academic-docs/math.xlsx',
          publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/math.xlsx',
          uploadedBy: chairUser._id,
        },
      ]);
    });

    it('allows students to list shared academic documents', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(2);
      expect(res.body.total).toBe(2);
      expect(res.body.documents[0].publicUrl).toBeDefined();
    });

    it('filters documents by search query', async () => {
      const res = await request(app)
        .get('/api/documents?search=primer')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].title).toBe('Nursing Board Primer');
    });

    it('filters documents by fileType', async () => {
      const res = await request(app)
        .get('/api/documents?fileType=xlsx')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].fileType).toBe('xlsx');
    });
  });

  describe('DELETE /api/documents/:id', () => {
    let doc;
    beforeEach(async () => {
      doc = await Document.create({
        title: 'Obsolete Reviewer',
        originalFilename: 'old.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf',
        fileSize: 1000,
        storageKey: 'academic-docs/old.pdf',
        publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/old.pdf',
        uploadedBy: deanUser._id,
      });
    });

    it('allows dean or program chair to delete document', async () => {
      const res = await request(app)
        .delete(`/api/documents/${doc._id}`)
        .set('Authorization', `Bearer ${deanToken}`);

      expect(res.status).toBe(200);
      const exists = await Document.findById(doc._id);
      expect(exists).toBeNull();
    });

    it('denies student from deleting document', async () => {
      const res = await request(app)
        .delete(`/api/documents/${doc._id}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });
});
