const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');

let dept, prog, deanToken, deanUser;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const result = await createUserAndToken({ role: 'dean', department: dept._id, program: prog._id });
  deanToken = result.token;
  deanUser = result.user;
});

describe('GET /api/calendar/dean', () => {
  it('should return 200 as dean', async () => {
    const res = await request(app)
      .get('/api/calendar/dean')
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/calendar/dean');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/calendar/dean')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/calendar/student', () => {
  it('should return 200 as student', async () => {
    const { token } = await createUserAndToken({ role: 'student', department: dept._id, program: prog._id });
    const res = await request(app)
      .get('/api/calendar/student')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should return 200 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
    const res = await request(app)
      .get('/api/calendar/student')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should return 200 as program_chair', async () => {
    const { token } = await createUserAndToken({ role: 'program_chair', department: dept._id, program: prog._id });
    const res = await request(app)
      .get('/api/calendar/student')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/calendar/student');
    expect(res.status).toBe(401);
  });

  it('should return 403 as dean', async () => {
    const res = await request(app)
      .get('/api/calendar/student')
      .set('Authorization', `Bearer ${deanToken}`);
    expect(res.status).toBe(403);
  });
});
