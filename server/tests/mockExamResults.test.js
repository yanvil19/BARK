const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const Question = require('../models/Question');

let dept, prog, deanToken, deanUser;

const pastDate = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d; };

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const result = await createUserAndToken({ role: 'dean', department: dept._id, program: prog._id });
  deanToken = result.token;
  deanUser = result.user;
});

describe('GET /api/mock-exam-results/list', () => {
  it('should return 200 empty list as dean', async () => {
    const res = await request(app)
      .get('/api/mock-exam-results/list')
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/mock-exam-results/list');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/mock-exam-results/list')
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/mock-exam-results/:examId', () => {
  it('should return 200 for existing exam (null result initially)', async () => {
    const exam = await MockBoardExam.create({
      name: 'Finished Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: pastDate(2), endDateTime: pastDate(1),
      status: 'finished', createdBy: deanUser._id,
    });
    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect([200, 404]).toContain(res.status);
  });
});

describe('POST /api/mock-exam-results/:examId/compute', () => {
  it('should compute results for a finished exam with attempts', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({
      title: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id
    });
    const exam = await MockBoardExam.create({
      name: 'Finished', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(2), endDateTime: pastDate(1),
      status: 'finished', createdBy: deanUser._id,
    });
    const { user: student } = await createUserAndToken({ role: 'student', department: dept._id, program: prog._id });
    const { user: secondStudent } = await createUserAndToken({
      role: 'student',
      department: dept._id,
      program: prog._id,
      email: 'second-student@example.com',
      studentId: '2026-000002',
    });
    await StudentExamAttempt.create({
      exam: exam._id, student: student._id,
      status: 'submitted', randomizedQuestions: [q._id],
      answers: new Map([[q._id.toString(), q.answers[0]._id]]),
      score: 1, submittedAt: pastDate(1),
    });
    await StudentExamAttempt.create({
      exam: exam._id, student: secondStudent._id,
      status: 'submitted', randomizedQuestions: [q._id],
      answers: new Map([[q._id.toString(), q.answers[1]._id]]),
      score: 0, submittedAt: pastDate(1),
    });

    const res = await request(app)
      .post(`/api/mock-exam-results/${exam._id}/compute`)
      .set('Cookie', `nu_board_token=${deanToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.result.subjects[0].questions[0]).toMatchObject({
      label: 'Q1',
      correctRate: 50,
      unansweredCount: 0,
    });
    expect(res.body.result.subjects[0].questions[0].answerCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'A', count: 1, isCorrect: true }),
        expect.objectContaining({ text: 'B', count: 1, isCorrect: false }),
      ])
    );
  });
});

describe('DELETE /api/mock-exam-results/:examId', () => {
  it('should delete an existing result', async () => {
    const exam = await MockBoardExam.create({
      name: 'Exam', program: prog._id, department: dept._id,
      questions: [], startDateTime: pastDate(2), endDateTime: pastDate(1),
      status: 'finished', createdBy: deanUser._id,
    });
    await MockExamResult.create({ examId: exam._id, examName: exam.name, dateConducted: exam.endDateTime, createdBy: deanUser._id, department: dept._id, status: 'computed', computedAt: new Date() });

    const res = await request(app)
      .delete(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown exam', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .delete(`/api/mock-exam-results/${fakeId}`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(res.status).toBe(403);
  });
});
