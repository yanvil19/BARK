const request = require('supertest');
const app = require('../app');
const Document = require('../models/Document');
const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const { createUserAndToken } = require('./helpers');

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

describe('Document Program-Based Access Scoping', () => {
  let dept;
  let csProgram;
  let itProgram;
  let ceProgram;

  let deanUser, deanToken;
  let chairUser, chairToken;
  let csStudentUser, csStudentToken;
  let ceStudentUser, ceStudentToken;

  beforeEach(async () => {
    dept = await Department.create({ name: 'School of Technology', code: 'SOT' });
    csProgram = await Program.create({ name: 'Computer Science', code: 'BSCS', department: dept._id });
    itProgram = await Program.create({ name: 'Information Technology', code: 'BSIT', department: dept._id });
    ceProgram = await Program.create({ name: 'Civil Engineering', code: 'BSCE', department: dept._id });

    // Users
    const deanRes = await createUserAndToken({
      email: 'dean@nu-board.edu',
      role: 'dean',
      department: dept._id,
    });
    deanUser = deanRes.user;
    deanToken = deanRes.token;

    const chairRes = await createUserAndToken({
      email: 'chair.cs@nu-board.edu',
      role: 'program_chair',
      department: dept._id,
      program: csProgram._id,
    });
    chairUser = chairRes.user;
    chairToken = chairRes.token;

    const csStudentRes = await createUserAndToken({
      email: 'student.cs@nu-board.edu',
      role: 'student',
      department: dept._id,
      program: csProgram._id,
    });
    csStudentUser = csStudentRes.user;
    csStudentToken = csStudentRes.token;

    const ceStudentRes = await createUserAndToken({
      email: 'student.ce@nu-board.edu',
      role: 'student',
      department: dept._id,
      program: ceProgram._id,
    });
    ceStudentUser = ceStudentRes.user;
    ceStudentToken = ceStudentRes.token;

    // Create fixture documents
    await Document.create([
      {
        title: 'CS Data Structures Notes',
        originalFilename: 'ds.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        storageKey: 'academic-docs/ds.pdf',
        publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/ds.pdf',
        program: 'BSCS',
        uploadedBy: chairUser._id,
      },
      {
        title: 'CE Structural Analysis Guide',
        originalFilename: 'structural.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf',
        fileSize: 2048,
        storageKey: 'academic-docs/structural.pdf',
        publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/structural.pdf',
        program: 'BSCE',
        uploadedBy: deanUser._id,
      },
      {
        title: 'University Student Handbook',
        originalFilename: 'handbook.pdf',
        fileType: 'pdf',
        mimeType: 'application/pdf',
        fileSize: 4096,
        storageKey: 'academic-docs/handbook.pdf',
        publicUrl: 'https://pub-ab383c78c8c14efb97d92d59e43f5b5f.r2.dev/academic-docs/handbook.pdf',
        program: 'GENERAL',
        uploadedBy: deanUser._id,
      },
    ]);
  });

  describe('GET /api/documents Scoping', () => {
    it('allows CS students to see BSCS documents and GENERAL documents, but NOT BSCE documents', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${csStudentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(2);
      const titles = res.body.documents.map((d) => d.title);
      expect(titles).toContain('CS Data Structures Notes');
      expect(titles).toContain('University Student Handbook');
      expect(titles).not.toContain('CE Structural Analysis Guide');
    });

    it('allows CE students to see BSCE documents and GENERAL documents, but NOT BSCS documents', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${ceStudentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(2);
      const titles = res.body.documents.map((d) => d.title);
      expect(titles).toContain('CE Structural Analysis Guide');
      expect(titles).toContain('University Student Handbook');
      expect(titles).not.toContain('CS Data Structures Notes');
    });

    it('allows Program Chair to see documents scoped to their program plus GENERAL', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${chairToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(2);
      const titles = res.body.documents.map((d) => d.title);
      expect(titles).toContain('CS Data Structures Notes');
      expect(titles).toContain('University Student Handbook');
      expect(titles).not.toContain('CE Structural Analysis Guide');
    });

    it('allows Dean to view documents across all programs', async () => {
      const res = await request(app)
        .get('/api/documents')
        .set('Authorization', `Bearer ${deanToken}`);

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(3);
    });
  });

  describe('POST /api/documents Upload Scoping', () => {
    it('saves selected program when Dean uploads a document', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${deanToken}`)
        .field('title', 'IT Network Systems')
        .field('program', 'BSIT')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'network.pdf');

      expect(res.status).toBe(201);
      expect(res.body.document.program).toBe('BSIT');
    });

    it('defaults program to Chair assigned program when Program Chair uploads without program override', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${chairToken}`)
        .field('title', 'Algorithms Manual')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'algorithms.pdf');

      expect(res.status).toBe(201);
      expect(res.body.document.program).toBe('BSCS');
    });

    it('allows Program Chair to upload as GENERAL', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${chairToken}`)
        .field('title', 'Graduation Checklist')
        .field('program', 'GENERAL')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'grad.pdf');

      expect(res.status).toBe(201);
      expect(res.body.document.program).toBe('GENERAL');
    });

    it('rejects Program Chair when attempting to upload to an unauthorized program', async () => {
      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${chairToken}`)
        .field('title', 'Unauthorized Upload')
        .field('program', 'BSCE')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'sample.pdf');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });

    it('rejects Dean when attempting to upload to a program outside their department', async () => {
      const otherDept = await Department.create({ name: 'School of Medicine', code: 'SOM' });
      await Program.create({ name: 'Nursing', code: 'BSN', department: otherDept._id });

      const res = await request(app)
        .post('/api/documents')
        .set('Authorization', `Bearer ${deanToken}`)
        .field('title', 'Medical Guide')
        .field('program', 'BSN')
        .attach('file', Buffer.from('%PDF-1.4 test'), 'guide.pdf');

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Access denied');
    });
  });
});
