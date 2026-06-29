const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');

let dept, prog, profToken, profUser, chairToken, chairUser;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });

  const profResult = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
  profToken = profResult.token;
  profUser = profResult.user;

  const chairResult = await createUserAndToken({ role: 'program_chair', department: dept._id, program: prog._id });
  chairToken = chairResult.token;
  chairUser = chairResult.user;
});

const validQuestion = () => ({
  title: 'What is 1+1?',
  description: 'This is a description',
  answers: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }],
  program: null, // set in test after prog is created
});

describe('POST /api/questions', () => {
  it('should create a draft question as professor', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${profToken}`)
      .send({ ...validQuestion(), program: prog._id });
    expect(res.status).toBe(201);
    expect(res.body.question).toHaveProperty('state', 'draft');
  });

  it('should return 400 with no title', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${profToken}`)
      .send({ description: 'No title provided', answers: [{ text: '2', isCorrect: true }], program: prog._id });
    expect(res.status).toBe(400);
  });

  it('should return 403 as student', async () => {
    const { token } = await createUserAndToken({ role: 'student' });
    const res = await request(app)
      .post('/api/questions')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validQuestion(), program: prog._id });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/questions/:id', () => {
  it('should update a draft question', async () => {
    const q = await Question.create({
      title: 'Original', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'draft',
    });
    const res = await request(app)
      .patch(`/api/questions/${q._id}`)
      .set('Authorization', `Bearer ${profToken}`)
      .send({ title: 'Updated Title' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown question', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/questions/${fakeId}`)
      .set('Authorization', `Bearer ${profToken}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should return 403 for wrong owner', async () => {
    const q = await Question.create({
      title: 'Original', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: chairUser._id, state: 'draft',
    });
    const res = await request(app)
      .patch(`/api/questions/${q._id}`)
      .set('Authorization', `Bearer ${profToken}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/questions/:id', () => {
  it('should delete a draft question', async () => {
    const q = await Question.create({
      title: 'To Delete', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'draft',
    });
    const res = await request(app)
      .delete(`/api/questions/${q._id}`)
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if question is not in draft state', async () => {
    const q = await Question.create({
      title: 'Approved Q', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'approved',
    });
    const res = await request(app)
      .delete(`/api/questions/${q._id}`)
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/questions/:id/submit', () => {
  it('should submit a complete question for review', async () => {
    const tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: profUser._id });
    const q = await Question.create({
      title: 'What is 1+1?',
      description: 'Test description',
      answers: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }, { text: '4', isCorrect: false }, { text: '5', isCorrect: false }],
      tag: tag._id, program: prog._id, createdBy: profUser._id, state: 'draft',
    });
    const res = await request(app)
      .post(`/api/questions/${q._id}/submit`)
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(200);
  });
});

describe('GET /api/questions/approvals', () => {
  it('should return 200 as program_chair', async () => {
    const res = await request(app)
      .get('/api/questions/approvals')
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 403 as professor', async () => {
    const res = await request(app)
      .get('/api/questions/approvals')
      .set('Authorization', `Bearer ${profToken}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/questions/:id/review', () => {
  it('should approve a pending question as program_chair', async () => {
    const q = await Question.create({
      title: 'Pending Q', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'pending_chair',
    });
    const res = await request(app)
      .post(`/api/questions/${q._id}/review`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ action: 'approve' });
    expect(res.status).toBe(200);
  });

  it('should return 400 for invalid action', async () => {
    const q = await Question.create({
      title: 'Pending Q', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'pending_chair',
    });
    const res = await request(app)
      .post(`/api/questions/${q._id}/review`)
      .set('Authorization', `Bearer ${chairToken}`)
      .send({ action: 'invalid_action' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/questions/:id/lock and unlock', () => {
  it('should lock a question', async () => {
    const q = await Question.create({
      title: 'Lock Me', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'draft',
    });
    const res = await request(app)
      .patch(`/api/questions/${q._id}/lock`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
  });

  it('should unlock a question', async () => {
    const q = await Question.create({
      title: 'Unlock Me', answers: [{ text: '2', isCorrect: true }],
      program: prog._id, createdBy: profUser._id, state: 'draft',
    });
    const res = await request(app)
      .patch(`/api/questions/${q._id}/unlock`)
      .set('Authorization', `Bearer ${chairToken}`);
    expect(res.status).toBe(200);
  });
});
