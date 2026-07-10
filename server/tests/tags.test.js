const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');

let dept, prog, chairToken, chairUser;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const result = await createUserAndToken({ role: 'program_chair', department: dept._id, program: prog._id });
  chairToken = result.token;
  chairUser = result.user;
});

describe('GET /api/tags', () => {
  it('should return 200 for professor with program', async () => {
    const { token } = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
    const res = await request(app)
      .get(`/api/tags?program=${prog._id}`)
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/tags');
    expect(res.status).toBe(401);
  });

  it('should return 403 as student', async () => {
    const { token } = await createUserAndToken({ role: 'student' });
    const res = await request(app)
      .get('/api/tags')
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/tags', () => {
  it('should create a tag as program_chair', async () => {
    const res = await request(app)
      .post('/api/tags')
      .set('Cookie', `nu_board_token=${chairToken}`)
      .send({ name: 'Algebra', program: prog._id });
    expect(res.status).toBe(201);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor', program: prog._id });
    const res = await request(app)
      .post('/api/tags')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ name: 'Algebra', program: prog._id });
    expect(res.status).toBe(403);
  });

  it('should return 409 for duplicate tag name in same program', async () => {
    await Tag.create({ name: 'Algebra', program: prog._id, createdBy: chairUser._id });
    const res = await request(app)
      .post('/api/tags')
      .set('Cookie', `nu_board_token=${chairToken}`)
      .send({ name: 'Algebra', program: prog._id });
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/tags/:id', () => {
  it('should update a tag', async () => {
    const tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: chairUser._id });
    const res = await request(app)
      .patch(`/api/tags/${tag._id}`)
      .set('Cookie', `nu_board_token=${chairToken}`)
      .send({ name: 'Advanced Algebra' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown tag', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/tags/${fakeId}`)
      .set('Cookie', `nu_board_token=${chairToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/tags/:id', () => {
  it('should delete a tag with no questions', async () => {
    const tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: chairUser._id });
    const res = await request(app)
      .delete(`/api/tags/${tag._id}`)
      .set('Cookie', `nu_board_token=${chairToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if tag has questions', async () => {
    const tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: chairUser._id });
    await Question.create({
      title: 'What is 1+1?',
      answers: [{ text: '2', isCorrect: true }, { text: '3', isCorrect: false }],
      tag: tag._id,
      program: prog._id,
      createdBy: chairUser._id,
      state: 'draft',
    });
    const res = await request(app)
      .delete(`/api/tags/${tag._id}`)
      .set('Cookie', `nu_board_token=${chairToken}`);
    expect(res.status).toBe(400);
  });
});
