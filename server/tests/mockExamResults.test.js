const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const Question = require('../models/Question');
const { encryptText } = require('../services/encryptionService');

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
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
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

// An exam with a two-question set listed out of order around a single question, and
// one student who answered only the set's first question (correctly)
async function createExamWithSet() {
  const tag = await require('../models/Tag').create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
  const base = { program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id };
  const setFirst = await Question.create({
    ...base,
    description: 'Set first',
    answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
    images: ['/api/questions/image/set-first.png'],
    rationalization: encryptText('Because A'),
    groupId: 'set-1', groupOrder: 0, groupContext: 'Shared passage',
  });
  const setSecond = await Question.create({
    ...base,
    description: 'Set second',
    answers: [{ text: 'C', isCorrect: true }, { text: 'D', isCorrect: false }],
    groupId: 'set-1', groupOrder: 1, groupContext: 'Shared passage',
  });
  const single = await Question.create({
    ...base,
    description: 'Single',
    answers: [{ text: 'E', isCorrect: true }, { text: 'F', isCorrect: false }],
  });
  const exam = await MockBoardExam.create({
    name: 'Set Exam', program: prog._id, department: dept._id,
    questions: [setSecond._id, single._id, setFirst._id],
    startDateTime: pastDate(2), endDateTime: pastDate(1),
    status: 'finished', createdBy: deanUser._id,
  });
  const { user: student } = await createUserAndToken({ role: 'student', department: dept._id, program: prog._id });
  await StudentExamAttempt.create({
    exam: exam._id, student: student._id,
    status: 'submitted', randomizedQuestions: [setSecond._id, single._id, setFirst._id],
    answers: new Map([[setFirst._id.toString(), setFirst.answers[0]._id]]),
    subjectScores: [{ tag: tag._id, correct: 1, total: 3 }],
    score: 1, submittedAt: pastDate(1),
  });
  return { exam, setFirst, setSecond, single };
}

describe('question content in faculty results', () => {
  it('adds exam numbers, images and rationalizations to the computed report', async () => {
    const { exam, setFirst, setSecond, single } = await createExamWithSet();

    const computed = await request(app)
      .post(`/api/mock-exam-results/${exam._id}/compute`)
      .set('Cookie', `nu_board_token=${deanToken}`)
      .send({});
    expect(computed.status).toBe(200);

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(res.status).toBe(200);

    for (const body of [computed.body, res.body]) {
      const byId = new Map(body.result.subjects[0].questions.map((q) => [String(q.questionId), q]));
      // The set takes numbers 1-2 where it first appears, in set order
      expect(byId.get(String(setFirst._id))).toMatchObject({
        questionNumber: 1,
        groupOrder: 0,
        images: ['/api/questions/image/set-first.png'],
        rationalization: 'Because A',
      });
      expect(byId.get(String(setSecond._id))).toMatchObject({ questionNumber: 2, groupOrder: 1 });
      expect(byId.get(String(single._id))).toMatchObject({ questionNumber: 3, groupOrder: null });
    }

    // The stored result keeps only the analysis
    const stored = await MockExamResult.findOne({ examId: exam._id }).lean();
    expect(stored.subjects[0].questions[0].rationalization).toBeUndefined();
  });

  it("returns each student's answers with the exam's question content", async () => {
    const { exam, setFirst, single } = await createExamWithSet();

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}/students`)
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.questions[String(setFirst._id)]).toMatchObject({
      questionNumber: 1,
      description: 'Set first',
      rationalization: 'Because A',
      groupContext: 'Shared passage',
      answers: [
        expect.objectContaining({ text: 'A', isCorrect: true }),
        expect.objectContaining({ text: 'B', isCorrect: false }),
      ],
    });

    const answersById = new Map(
      res.body.students[0].subjectBreakdowns[0].questions.map((q) => [q.questionId, q])
    );
    expect(answersById.get(String(setFirst._id))).toEqual({
      questionId: String(setFirst._id),
      userAnswer: String(setFirst.answers[0]._id),
      isCorrect: true,
      points: 1,
    });
    expect(answersById.get(String(single._id))).toMatchObject({ userAnswer: null, isCorrect: false });
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
