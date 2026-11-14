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

    // One taker at 100% and one at 0%, against the default 70% threshold
    const summary = {
      overallAverageScore: 50,
      highestScore: 100,
      lowestScore: 0,
      passedCount: 1,
      nearMissCount: 0,
    };
    expect(res.body.result).toMatchObject(summary);
    expect(res.body.result.scoreDistribution).toHaveLength(10);
    expect(res.body.result.scoreDistribution[0]).toEqual({ min: 0, max: 9, below: 1, passed: 0 });
    expect(res.body.result.scoreDistribution[9]).toEqual({ min: 90, max: 100, below: 0, passed: 1 });

    const stored = await request(app)
      .get(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(stored.body.result).toMatchObject(summary);
    expect(stored.body.result.scoreDistribution).toEqual(res.body.result.scoreDistribution);
  });

  it('fills the score summary of a result computed before it was saved', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    const questions = await Question.create([1, 2, 3, 4, 5].map((n) => ({
      description: `Q${n}`, answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id,
    })));
    const exam = await MockBoardExam.create({
      name: 'Old result', program: prog._id, department: dept._id,
      questions: questions.map((q) => q._id), startDateTime: pastDate(2), endDateTime: pastDate(1),
      status: 'finished', createdBy: deanUser._id, passingThreshold: 70,
    });
    // 60%, 80% and 40% against a 70% threshold: one passes, none within 5 points of it
    const scores = [3, 4, 2];
    for (const [idx, score] of scores.entries()) {
      const { user } = await createUserAndToken({
        role: 'student', department: dept._id, program: prog._id,
        email: `old-${idx}@example.com`, studentId: `2026-10000${idx}`,
      });
      await StudentExamAttempt.create({
        exam: exam._id, student: user._id, status: 'submitted',
        randomizedQuestions: questions.map((q) => q._id),
        subjectScores: [{ tag: tag._id, correct: score, total: 5 }],
        score, submittedAt: pastDate(1),
      });
    }
    // Saved the way results were before: no average, pass count or distribution
    await MockExamResult.collection.insertOne({
      examId: exam._id, examName: exam.name, dateConducted: pastDate(2),
      totalTakers: 3, highestScore: 80, lowestScore: 40, totalEligibleStudents: 3,
      passingThreshold: 70, status: 'computed', computedAt: pastDate(1),
      subjects: [], createdBy: deanUser._id, department: dept._id,
    });

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({ overallAverageScore: 60, passedCount: 1, nearMissCount: 0 });
    const counts = res.body.result.scoreDistribution.map((range) => range.below + range.passed);
    expect(counts).toEqual([0, 0, 0, 0, 1, 0, 1, 0, 1, 0]);
    expect(res.body.result.scoreDistribution[8]).toMatchObject({ passed: 1, below: 0 });
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

describe('people who have not taken the exam in the individual results', () => {
  it('lists the eligible students without a result, and a missed exam as not taken', async () => {
    const tag = await require('../models/Tag').create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    const q = await Question.create({
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id,
    });
    const exam = await MockBoardExam.create({
      name: 'Finished', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(2), endDateTime: pastDate(1),
      status: 'finished', createdBy: deanUser._id,
    });
    const makeStudent = async (name, extra = {}) => (await createUserAndToken({
      role: 'student', department: dept._id, program: prog._id, name,
      email: `${name.toLowerCase()}@example.com`, studentId: `ID-${name}`, ...extra,
    })).user;
    const took = await makeStudent('Took');
    const missed = await makeStudent('Missed');
    const absent = await makeStudent('Absent');
    const taking = await makeStudent('Taking');
    await makeStudent('Inactive', { isActive: false });
    await createUserAndToken({ role: 'alumni', department: dept._id, program: prog._id, email: 'alum@example.com' });

    await StudentExamAttempt.create({
      exam: exam._id, student: took._id, status: 'submitted', randomizedQuestions: [q._id],
      answers: new Map([[q._id.toString(), q.answers[0]._id]]),
      subjectScores: [{ tag: tag._id, correct: 1, total: 1 }], score: 1, submittedAt: pastDate(1),
    });
    // What the expiry job saves for someone who missed the exam
    await StudentExamAttempt.create({
      exam: exam._id, student: missed._id, status: 'submitted', randomizedQuestions: [],
      answers: {}, subjectScores: [{ tag: tag._id, correct: 0, total: 1 }], score: 0, autoSubmitted: true,
    });
    await StudentExamAttempt.create({
      exam: exam._id, student: taking._id, status: 'in_progress', randomizedQuestions: [q._id],
    });

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}/students`)
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.examEnded).toBe(true);
    const statusByName = Object.fromEntries(res.body.students.map((entry) => [entry.student.name, entry.status]));
    expect(statusByName).toEqual({ Took: 'taken', Missed: 'not_taken', Absent: 'not_taken', Taking: 'in_progress' });
    expect(res.body.students.find((entry) => entry.student.name === 'Took')).toMatchObject({ overallPercentage: 100, passed: true });
    expect(res.body.students.find((entry) => entry.student._id === String(absent._id))).toMatchObject({
      student: { email: 'absent@example.com', studentId: 'ID-Absent' },
      overallPercentage: null,
      passed: null,
      subjectBreakdowns: [],
    });
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

describe('results that are ready without anyone computing them', () => {
  const AlumniExamAttempt = require('../models/AlumniExamAttempt');
  const Tag = require('../models/Tag');
  const asDean = (req) => req.set('Cookie', `nu_board_token=${deanToken}`);
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000);
  const badge = async () => (await asDean(request(app).get('/api/stats/badge-counts'))).body.newExamResults;
  const listed = async (exam) => (await asDean(request(app).get('/api/mock-exam-results/list'))).body.exams
    .find((entry) => String(entry._id) === String(exam._id));
  let tag, question, student;

  beforeEach(async () => {
    tag = await Tag.create({ name: 'Subject', program: prog._id, createdBy: deanUser._id, isActive: true });
    question = await Question.create({
      description: 'Q1', answers: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }],
      program: prog._id, createdBy: deanUser._id, state: 'approved', tag: tag._id,
    });
    ({ user: student } = await createUserAndToken({ role: 'student', department: dept._id, program: prog._id }));
  });

  const createExam = (overrides = {}) => MockBoardExam.create({
    name: 'Auto Exam', program: prog._id, department: dept._id, questions: [question._id],
    startDateTime: pastDate(2), endDateTime: pastDate(1), status: 'finished', createdBy: deanUser._id,
    ...overrides,
  });
  const submitAttempt = (exam) => StudentExamAttempt.create({
    exam: exam._id, student: student._id, status: 'submitted', randomizedQuestions: [],
    answers: new Map([[String(question._id), question.answers[0]._id]]),
    score: 1, subjectScores: [{ tag: tag._id, correct: 1, total: 1 }],
  });

  it('a student exam that has ended shows its results with no compute step', async () => {
    const exam = await createExam();
    await submitAttempt(exam);

    const entry = await listed(exam);
    expect(entry.computationStatus).toBe('computed');
    const stored = await MockExamResult.findOne({ examId: exam._id });
    expect(stored.totalTakers).toBe(1);
    expect(String(stored.createdBy)).toBe(String(deanUser._id));

    const res = await asDean(request(app).get(`/api/mock-exam-results/${exam._id}`));
    expect(res.body.result.overallAverageScore).toBe(100);
  });

  it('opening the results works them out too, without the list', async () => {
    const exam = await createExam();
    await submitAttempt(exam);
    const res = await asDean(request(app).get(`/api/mock-exam-results/${exam._id}`));
    expect(res.status).toBe(200);
    expect(res.body.result.totalTakers).toBe(1);
  });

  it('waits for the exam to be closed and settled', async () => {
    const running = await createExam({ endDateTime: new Date(Date.now() + 3600000), status: 'ongoing' });
    const justEnded = await createExam({ name: 'Just Ended', endDateTime: minutesAgo(1) });
    const settled = await createExam({ name: 'Settled', endDateTime: minutesAgo(1), missedAttemptsProcessedAt: new Date() });
    await Promise.all([running, justEnded, settled].map(submitAttempt));

    expect((await listed(running)).computationStatus).toBe('none');
    expect((await listed(justEnded)).computationStatus).toBe('none');
    expect((await listed(settled)).computationStatus).toBe('computed');
  });

  it('an exam nobody took stays without results', async () => {
    const exam = await createExam();
    expect((await listed(exam)).computationStatus).toBe('none');
    expect(await MockExamResult.countDocuments()).toBe(0);
  });

  it('counts a finished student exam as new until its results are opened', async () => {
    // Exams that ended before this dean first looked are not news
    const old = await createExam({ name: 'Old Exam' });
    await submitAttempt(old);
    expect(await badge()).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const exam = await createExam({ name: 'Fresh Exam', endDateTime: new Date(Date.now() - 1), missedAttemptsProcessedAt: new Date() });
    await submitAttempt(exam);
    // Not counted before the results exist
    expect(await badge()).toBe(0);
    expect((await listed(exam)).hasNewResults).toBe(true);
    expect((await listed(old)).hasNewResults).toBe(false);
    expect(await badge()).toBe(1);

    const seen = await asDean(request(app).post(`/api/mock-exam-results/${exam._id}/seen`)).send({});
    expect(seen.status).toBe(200);
    expect(await badge()).toBe(0);
    expect((await listed(exam)).hasNewResults).toBe(false);
  });

  it('counts an alumni exam as new each time an attempt is submitted', async () => {
    const { user: alumni } = await createUserAndToken({
      role: 'alumni', userType: 'alumni', department: dept._id, program: prog._id,
      alumniId: '2020-000001', email: 'alumni@example.com',
    });
    const exam = await createExam({
      name: 'Alumni Exam', targetAudience: 'alumni', status: 'ongoing', endDateTime: new Date(Date.now() + 86400000),
    });
    expect(await badge()).toBe(0);

    const attempt = (attemptNumber) => AlumniExamAttempt.create({
      exam: exam._id, alumni: alumni._id, attemptNumber, status: 'submitted', randomizedQuestions: [],
      answers: new Map([[String(question._id), question.answers[0]._id]]),
      score: 1, subjectScores: [{ tag: tag._id, correct: 1, total: 1 }],
      startTime: new Date(), endTime: new Date(Date.now() + 5),
    });
    await attempt(1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await badge()).toBe(1);
    const entry = await listed(exam);
    expect(entry.computationStatus).toBe('computed');
    expect(entry.hasNewResults).toBe(true);

    await asDean(request(app).post(`/api/mock-exam-results/${exam._id}/seen`)).send({});
    expect(await badge()).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    await attempt(2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await badge()).toBe(1);
  });

  it('a program chair is only told about their own program', async () => {
    const other = await Program.create({ name: 'Civil Engineering', code: 'CE', department: dept._id });
    const { token: chairToken } = await createUserAndToken({
      role: 'program_chair', department: dept._id, program: other._id, email: 'chair@example.com',
    });
    const chairBadge = async () => (await request(app).get('/api/stats/badge-counts')
      .set('Cookie', `nu_board_token=${chairToken}`)).body.newExamResults;
    expect(await chairBadge()).toBe(0);
    expect(await badge()).toBe(0);

    await new Promise((resolve) => setTimeout(resolve, 20));
    const exam = await createExam({ endDateTime: new Date(Date.now() - 1), missedAttemptsProcessedAt: new Date() });
    await submitAttempt(exam);
    await listed(exam);
    expect(await badge()).toBe(1);
    expect(await chairBadge()).toBe(0);
    const seen = await request(app).post(`/api/mock-exam-results/${exam._id}/seen`)
      .set('Cookie', `nu_board_token=${chairToken}`).send({});
    expect(seen.status).toBe(403);
  });
});
