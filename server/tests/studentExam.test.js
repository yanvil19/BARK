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

  it('includes who published each exam and when, falling back to the creator', async () => {
    const { user: chair } = await createUserAndToken({
      role: 'program_chair', name: 'Chair Person', department: dept._id, program: prog._id, email: 'chair@example.com',
    });
    const publishedAt = pastDate(1);
    const tracked = { program: prog._id, department: dept._id, questions: [], status: 'published', createdBy: deanUser._id };
    await MockBoardExam.create({
      ...tracked, name: 'Tracked', startDateTime: futureDate(1), endDateTime: futureDate(2),
      publishedBy: chair._id, publishedAt,
    });
    const legacy = await MockBoardExam.create({
      ...tracked, name: 'Legacy', startDateTime: futureDate(3), endDateTime: futureDate(4),
    });

    const res = await request(app)
      .get('/api/student-exams/available')
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.exams.map((exam) => [exam.name, exam]));
    expect(byName.Tracked.publishedByName).toBe('Chair Person');
    expect(byName.Tracked.publishedAt).toBe(publishedAt.toISOString());
    expect(byName.Tracked).not.toHaveProperty('createdBy');
    expect(byName.Legacy.publishedByName).toBe('Test User');
    expect(byName.Legacy.publishedAt).toBe(legacy.createdAt.toISOString());
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
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
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
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
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
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
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

describe('an exam taken with points, question timers and one-way navigation', () => {
  let tag, q1, q2, q3;

  beforeEach(async () => {
    tag = await require('../models/Tag').create({ name: 'Rules Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    const make = (description) => Question.create({
      description, answers: [{ text: 'Right', isCorrect: true }, { text: 'Wrong', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id,
    });
    q1 = await make('R1');
    q2 = await make('R2');
    q3 = await make('R3');
  });

  const right = (question) => String(question.answers[0]._id);
  const wrong = (question) => String(question.answers[1]._id);
  const asStudent = (req) => req.set('Cookie', `nu_board_token=${studentToken}`);

  const createExam = (overrides = {}) => MockBoardExam.create({
    name: 'Rules Exam', program: prog._id, department: dept._id,
    questions: [q1._id, q2._id, q3._id], startDateTime: pastDate(1), endDateTime: futureDate(1),
    status: 'ongoing', createdBy: deanUser._id, passingThreshold: 70,
    ...overrides,
  });

  // Starts the attempt and returns it with the questions in the order the taker got them
  async function start(exam) {
    const res = await asStudent(request(app).post(`/api/student-exams/${exam._id}/start`));
    expect(res.status).toBe(200);
    const byId = new Map([q1, q2, q3].map((question) => [String(question._id), question]));
    return { body: res.body, order: res.body.questions.map((question) => byId.get(String(question._id))) };
  }
  const save = (attemptId, body) => asStudent(request(app).patch(`/api/student-exams/attempt/${attemptId}/progress`)).send(body);
  const submit = (attemptId, body = {}) => asStudent(request(app).post(`/api/student-exams/attempt/${attemptId}/submit`)).send(body);

  it('sends the rules and the starting place, and never the right answers', async () => {
    const exam = await createExam({
      scoringMode: 'custom', defaultQuestionPoints: 2, questionTimerEnabled: true, defaultQuestionSeconds: 60,
      oneWayNavigation: true, oneWayBackAllowed: true,
      itemSettings: [
        { question: q1._id, points: 5, timeLimitSeconds: 30 },
        { question: q2._id, points: 2, timeLimitSeconds: 60 },
        { question: q3._id, points: 2, timeLimitSeconds: 60 },
      ],
    });
    const { body } = await start(exam);

    expect(body.rules).toMatchObject({
      scoringMode: 'custom', questionTimerEnabled: true, oneWayNavigation: true, oneWayBackAllowed: true,
    });
    expect(body.rules.itemSettings).toHaveLength(3);
    expect(body.state.currentIdx).toBe(-1);
    expect(body.state.furthestIdx).toBe(0);
    expect(body.state.timeLeftMs[String(q1._id)]).toBe(30000);
    expect(body.state.timeLeftMs[String(q2._id)]).toBe(60000);
    expect(JSON.stringify(body)).not.toMatch(/isCorrect/);
  });

  it('marks by points, and passes or fails on the share of points', async () => {
    const exam = await createExam({
      scoringMode: 'custom', defaultQuestionPoints: 1, resultsReleaseDate: pastDate(1),
      itemSettings: [
        { question: q1._id, points: 8 },
        { question: q2._id, points: 1 },
        { question: q3._id, points: 1 },
      ],
    });
    const { body } = await start(exam);
    // One right answer of three, but it is worth 8 of the 10 points
    const res = await submit(body.attemptId, {
      answers: { [q1._id]: right(q1), [q2._id]: wrong(q2), [q3._id]: wrong(q3) },
    });
    expect(res.status).toBe(200);

    const attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(attempt.score).toBe(1);
    expect(attempt.pointsEarned).toBe(8);
    expect(attempt.pointsTotal).toBe(10);

    const mine = await asStudent(request(app).get('/api/student-exams/my-attempts'));
    expect(mine.status).toBe(200);
    expect(mine.body.attempts[0]).toMatchObject({ rawScore: 8, totalScore: 10, totalItems: 3, status: 'passed' });
  });

  it('keeps 1 point a question while custom points are off', async () => {
    const exam = await createExam({ itemSettings: [{ question: q1._id, points: 8 }] });
    const { body } = await start(exam);
    await submit(body.attemptId, { answers: { [q1._id]: right(q1) } });
    const attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(attempt.pointsEarned).toBe(1);
    expect(attempt.pointsTotal).toBe(3);
  });

  it('one way: an answer is final once its question is left, and no question is skipped', async () => {
    const exam = await createExam({ oneWayNavigation: true });
    const { body, order } = await start(exam);
    const [first, second, third] = order;

    // Moving on without an answer is refused: the taker stays on question 1
    let res = await save(body.attemptId, { answers: {}, state: { currentIdx: 2, furthestIdx: 2 } });
    expect(res.status).toBe(200);
    let attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(attempt.runState.furthestIdx).toBe(0);
    expect(attempt.runState.currentIdx).toBe(0);

    // Question 1 answered and left
    await save(body.attemptId, { answers: { [first._id]: wrong(first) }, state: { currentIdx: 1, furthestIdx: 1 } });
    attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(attempt.runState.furthestIdx).toBe(1);

    // Changing it afterwards does nothing; question 2, still open, can be answered and changed
    await save(body.attemptId, {
      answers: { [first._id]: right(first), [second._id]: wrong(second) },
      state: { currentIdx: 1, furthestIdx: 1 },
    });
    await save(body.attemptId, { answers: { [second._id]: right(second) }, state: { currentIdx: 1, furthestIdx: 1 } });
    attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(String(attempt.answers.get(String(first._id)))).toBe(wrong(first));
    expect(String(attempt.answers.get(String(second._id)))).toBe(right(second));

    // The last stop reached never goes back, and a refresh returns to it
    await save(body.attemptId, { answers: {}, state: { currentIdx: 0, furthestIdx: 0 } });
    const again = await start(exam);
    expect(again.body.state.furthestIdx).toBe(1);
    expect(again.body.answers[String(second._id)]).toBe(right(second));

    // Handing in can't rewrite a closed answer either
    await submit(body.attemptId, { answers: { [first._id]: right(first), [third._id]: right(third) }, state: { currentIdx: 3, furthestIdx: 3 } });
    attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(String(attempt.answers.get(String(first._id)))).toBe(wrong(first));
    // Questions 2 and 3 are right; question 1 stays as it was left
    expect(attempt.score).toBe(2);
  });

  it('question timers: time left only goes down, survives a refresh, and locks at zero', async () => {
    const exam = await createExam({ questionTimerEnabled: true, defaultQuestionSeconds: 60 });
    const { body, order } = await start(exam);
    const [first, second] = order;
    const id = (question) => String(question._id);

    await save(body.attemptId, {
      answers: { [first._id]: wrong(first) },
      state: { currentIdx: 0, furthestIdx: 0, timeLeftMs: { [id(first)]: 20000 }, spentMs: { [id(first)]: 40000 } },
    });
    // A screen can't hand time back
    await save(body.attemptId, { state: { currentIdx: 1, furthestIdx: 1, timeLeftMs: { [id(first)]: 55000 } } });
    let attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(attempt.runState.timeLeftMs.get(id(first))).toBe(20000);
    expect(attempt.runState.spentMs.get(id(first))).toBe(40000);

    // Out of time: the answer it had is kept
    await save(body.attemptId, { state: { currentIdx: 1, furthestIdx: 1, timeLeftMs: { [id(first)]: 0 } } });
    await save(body.attemptId, { answers: { [first._id]: right(first) }, state: { currentIdx: 1, furthestIdx: 1 } });
    attempt = await StudentExamAttempt.findById(body.attemptId);
    expect(String(attempt.answers.get(id(first)))).toBe(wrong(first));

    // Away with question 2 open: the time away comes off question 2
    await StudentExamAttempt.updateOne(
      { _id: body.attemptId },
      { $set: { 'runState.savedAt': new Date(Date.now() - 15000), 'runState.currentIdx': 1 } }
    );
    const again = await start(exam);
    expect(again.body.state.currentIdx).toBe(1);
    expect(again.body.state.timeLeftMs[id(first)]).toBe(0);
    expect(again.body.state.timeLeftMs[id(second)]).toBeLessThanOrEqual(45000);
    expect(again.body.state.timeLeftMs[id(second)]).toBeGreaterThan(40000);
  });
});
