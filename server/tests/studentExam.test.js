const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const Question = require('../models/Question');

let dept, prog, studentToken, studentUser, deanUser;

const pastDate = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d; };
const futureDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const studentResult = await createUserAndToken({ role: 'student', department: dept._id, program: prog._id });
  studentToken = studentResult.token;
  studentUser = studentResult.user;
  const deanResult = await createUserAndToken({ role: 'dean', department: dept._id });
  deanUser = deanResult.user;
});

describe('GET /api/student-exams/available', () => {
  it('should return 200 as student', async () => {
    const res = await request(app)
      .get('/api/student-exams/available')
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/student-exams/available');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/student-exams/available')
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/student-exams/my-attempts', () => {
  it('should return 200 with empty array initially', async () => {
    const res = await request(app)
      .get('/api/student-exams/my-attempts')
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.attempts)).toBe(true);
  });
});

describe('POST /api/student-exams/:id/start', () => {
  it('should start an exam and create an attempt', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subj', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({
      title: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id
    });
    const exam = await MockBoardExam.create({
      name: 'Ongoing Exam', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(1), endDateTime: futureDate(1),
      status: 'ongoing', createdBy: deanUser._id,
    });
    const res = await request(app)
      .post(`/api/student-exams/${exam._id}/start`)
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if exam is not ongoing', async () => {
    const exam = await MockBoardExam.create({
      name: 'Draft Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: futureDate(1), endDateTime: futureDate(2),
      status: 'draft', createdBy: deanUser._id,
    });
    const res = await request(app)
      .post(`/api/student-exams/${exam._id}/start`)
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/student-exams/attempt/:attemptId/progress', () => {
  it('should save progress on a started attempt', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subj', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({
      title: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id
    });
    const exam = await MockBoardExam.create({
      name: 'Ongoing', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(1), endDateTime: futureDate(1),
      status: 'ongoing', createdBy: deanUser._id,
    });
    const attempt = await StudentExamAttempt.create({
      exam: exam._id, student: studentUser._id,
      status: 'in_progress', randomizedQuestions: [{ question: q._id, answers: [q.answers[0]._id, q.answers[1]._id] }], answers: {},
    });
    const res = await request(app)
      .patch(`/api/student-exams/attempt/${attempt._id}/progress`)
      .set('Cookie', `nu_board_token=${studentToken}`)
      .send({ answers: { [q._id]: q.answers[0]._id } });
    expect(res.status).toBe(200);
  });
});

describe('POST /api/student-exams/attempt/:attemptId/submit', () => {
  it('should submit a started attempt', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subj', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({
      title: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id
    });
    const exam = await MockBoardExam.create({
      name: 'Ongoing', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(1), endDateTime: futureDate(1),
      status: 'ongoing', createdBy: deanUser._id,
    });
    const attempt = await StudentExamAttempt.create({
      exam: exam._id, student: studentUser._id,
      status: 'in_progress', randomizedQuestions: [{ question: q._id, answers: [q.answers[0]._id, q.answers[1]._id] }], answers: {},
    });
    const res = await request(app)
      .post(`/api/student-exams/attempt/${attempt._id}/submit`)
      .set('Cookie', `nu_board_token=${studentToken}`)
      .send({});
    expect(res.status).toBe(200);
  });
});
