const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');
const Question = require('../models/Question');

let dept, prog, deanToken, deanUser;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const result = await createUserAndToken({ role: 'dean', department: dept._id, program: prog._id });
  deanToken = result.token;
  deanUser = result.user;
});

const futureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

describe('GET /api/mock-board-exams/public', () => {
  it('should return 200 with empty array when none published', async () => {
    const res = await request(app).get('/api/mock-board-exams/public');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.exams)).toBe(true);
  });

  it('should return published exams after seeding', async () => {
    await MockBoardExam.create({
      name: 'Public Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(1), endDateTime: futureDate(2),
      status: 'published', createdBy: deanUser._id,
    });
    const res = await request(app).get('/api/mock-board-exams/public');
    expect(res.status).toBe(200);
    expect(res.body.exams.length).toBeGreaterThan(0);
  });
});

describe('GET /api/mock-board-exams', () => {
  it('should return 200 as dean', async () => {
    const res = await request(app)
      .get('/api/mock-board-exams')
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/mock-board-exams');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/mock-board-exams')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/mock-board-exams/approved-questions', () => {
  it('should return 200 as dean', async () => {
    const res = await request(app)
      .get(`/api/mock-board-exams/approved-questions?program=${prog._id}`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/mock-board-exams/:id', () => {
  it('should return 200 for existing exam', async () => {
    const exam = await MockBoardExam.create({
      name: 'Test Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(1), endDateTime: futureDate(2),
      status: 'draft', createdBy: deanUser._id,
    });
    const res = await request(app)
      .get(`/api/mock-board-exams/${exam._id}`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .get(`/api/mock-board-exams/${fakeId}`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/mock-board-exams', () => {
  it('should create a draft exam', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({ title: 'Q1', answers: [{ text: '1', isCorrect: true }], program: prog._id, state: 'approved', createdBy: deanUser._id, tag: tag._id });
    const res = await request(app)
      .post('/api/mock-board-exams')
      .set('Authorization', `Bearer ${deanToken}`)
      .send({
        name: 'New Draft Exam',
        programId: prog._id,
        department: dept._id,
        subjectTagIds: [tag._id],
        questionIds: [q._id],
        startDateTime: futureDate(1),
        endDateTime: futureDate(2),
        status: 'draft',
      });
    expect(res.status).toBe(201);
  });

  it('should return 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/mock-board-exams')
      .set('Authorization', `Bearer ${deanToken}`)
      .send({ name: 'Incomplete Exam' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/mock-board-exams/:id', () => {
  it('should update exam name', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subject 2', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({ title: 'Q2', answers: [{ text: '1', isCorrect: true }], program: prog._id, state: 'approved', createdBy: deanUser._id, tag: tag._id });
    const exam = await MockBoardExam.create({
      name: 'Old Name', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: futureDate(1), endDateTime: futureDate(2),
      status: 'draft', createdBy: deanUser._id,
    });
    const res = await request(app)
      .patch(`/api/mock-board-exams/${exam._id}`)
      .set('Authorization', `Bearer ${deanToken}`)
      .send({ 
        name: 'New Name',
        programId: prog._id,
        subjectTagIds: [tag._id],
        questionIds: [q._id]
      });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/mock-board-exams/${fakeId}`)
      .set('Authorization', `Bearer ${deanToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/mock-board-exams/:id/archive', () => {
  it('should archive a finished exam', async () => {
    const exam = await MockBoardExam.create({
      name: 'Finished Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(-2), endDateTime: futureDate(-1),
      status: 'finished', createdBy: deanUser._id,
    });
    const res = await request(app)
      .patch(`/api/mock-board-exams/${exam._id}/archive`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/mock-board-exams/:id', () => {
  it('should delete a draft exam', async () => {
    const exam = await MockBoardExam.create({
      name: 'Delete Me', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(1), endDateTime: futureDate(2),
      status: 'draft', createdBy: deanUser._id,
    });
    const res = await request(app)
      .delete(`/api/mock-board-exams/${exam._id}`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/mock-board-exams/${fakeId}`)
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/mock-board-exams/:id/release-results', () => {
  it('should set a release date', async () => {
    const exam = await MockBoardExam.create({
      name: 'Release Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(-2), endDateTime: futureDate(-1),
      status: 'finished', createdBy: deanUser._id,
    });
    const res = await request(app)
      .patch(`/api/mock-board-exams/${exam._id}/release-results`)
      .set('Authorization', `Bearer ${deanToken}`)
      .send({ resultsReleaseDate: futureDate(1) });
    expect(res.status).toBe(200);
  });
});
