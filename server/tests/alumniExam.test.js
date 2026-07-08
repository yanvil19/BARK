const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const MockBoardExam = require('../models/MockBoardExam');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const Question = require('../models/Question');
const Tag = require('../models/Tag');

let dept, prog, deanUser, deanToken, alumniUser, alumniToken, studentToken, tag, question;

const futureDate = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

async function createQuestion() {
  tag = await Tag.create({
    name: 'Alumni Subject',
    program: prog._id,
    createdBy: deanUser._id,
    isActive: true,
  });

  question = await Question.create({
    title: 'Q1',
    answers: [
      { text: 'Correct', isCorrect: true },
      { text: 'Wrong', isCorrect: false },
    ],
    program: prog._id,
    createdBy: deanUser._id,
    state: 'approved',
    tag: tag._id,
  });

  return question;
}

async function createAlumniExam(overrides = {}) {
  if (!question) await createQuestion();
  return MockBoardExam.create({
    name: 'Alumni Practice Exam',
    program: prog._id,
    department: dept._id,
    subjectTags: [tag._id],
    questions: [question._id],
    targetAudience: 'alumni',
    status: 'published',
    createdBy: deanUser._id,
    passingThreshold: 70,
    ...overrides,
  });
}

async function submitAlumniAttempt(examId, token, answerId) {
  const start = await request(app)
    .post(`/api/alumni-exams/${examId}/start`)
    .set('Cookie', `nu_board_token=${token}`);
  expect(start.status).toBe(200);

  const submit = await request(app)
    .post(`/api/alumni-exams/attempt/${start.body.attemptId}/submit`)
    .set('Cookie', `nu_board_token=${token}`)
    .send({ answers: { [question._id]: answerId } });
  expect(submit.status).toBe(200);
  return submit;
}

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const deanResult = await createUserAndToken({
    role: 'dean',
    department: dept._id,
    program: prog._id,
    email: 'dean@example.com',
  });
  deanUser = deanResult.user;
  deanToken = deanResult.token;

  const alumniResult = await createUserAndToken({
    role: 'alumni',
    userType: 'alumni',
    department: dept._id,
    program: prog._id,
    alumniId: '2020-000001',
    email: 'alumni@example.com',
  });
  alumniUser = alumniResult.user;
  alumniToken = alumniResult.token;

  const studentResult = await createUserAndToken({
    role: 'student',
    userType: 'student',
    department: dept._id,
    program: prog._id,
    studentId: '2026-000001',
    email: 'student@example.com',
  });
  studentToken = studentResult.token;

  await createQuestion();
});

describe('alumni exam availability', () => {
  it('returns published alumni exams immediately without a schedule', async () => {
    const exam = await createAlumniExam({
      startDateTime: futureDate(1),
      endDateTime: futureDate(2),
    });

    expect(exam.startDateTime).toBeNull();
    expect(exam.endDateTime).toBeNull();

    const res = await request(app)
      .get('/api/alumni-exams/available')
      .set('Cookie', `nu_board_token=${alumniToken}`);

    expect(res.status).toBe(200);
    expect(res.body.exams).toHaveLength(1);
    expect(res.body.exams[0]._id).toBe(String(exam._id));
    expect(res.body.exams[0].examCardStatus).toBe('available');
  });

  it('keeps student and alumni exam visibility separated', async () => {
    const alumniExam = await createAlumniExam();
    const studentExam = await MockBoardExam.create({
      name: 'Student Scheduled Exam',
      program: prog._id,
      department: dept._id,
      subjectTags: [tag._id],
      questions: [question._id],
      targetAudience: 'student',
      startDateTime: futureDate(1),
      endDateTime: futureDate(2),
      status: 'published',
      createdBy: deanUser._id,
    });

    const alumniRes = await request(app)
      .get('/api/alumni-exams/available')
      .set('Cookie', `nu_board_token=${alumniToken}`);
    expect(alumniRes.status).toBe(200);
    expect(alumniRes.body.exams.map((exam) => exam._id)).toContain(String(alumniExam._id));
    expect(alumniRes.body.exams.map((exam) => exam._id)).not.toContain(String(studentExam._id));

    const studentRes = await request(app)
      .get('/api/student-exams/available')
      .set('Cookie', `nu_board_token=${studentToken}`);
    expect(studentRes.status).toBe(200);
    expect(studentRes.body.exams.map((exam) => exam._id)).not.toContain(String(alumniExam._id));
  });
});

describe('alumni exam attempts', () => {
  it('allows unlimited submitted attempts with incrementing attemptNumber', async () => {
    const exam = await createAlumniExam();

    const startOne = await request(app)
      .post(`/api/alumni-exams/${exam._id}/start`)
      .set('Cookie', `nu_board_token=${alumniToken}`);
    expect(startOne.status).toBe(200);
    expect(startOne.body.attemptNumber).toBe(1);

    const submitOne = await request(app)
      .post(`/api/alumni-exams/attempt/${startOne.body.attemptId}/submit`)
      .set('Cookie', `nu_board_token=${alumniToken}`)
      .send({ answers: { [question._id]: question.answers[0]._id } });
    expect(submitOne.status).toBe(200);
    expect(submitOne.body.score).toBe(1);
    expect(submitOne.body.passed).toBe(true);

    const startTwo = await request(app)
      .post(`/api/alumni-exams/${exam._id}/start`)
      .set('Cookie', `nu_board_token=${alumniToken}`);
    expect(startTwo.status).toBe(200);
    expect(startTwo.body.attemptNumber).toBe(2);

    const submitTwo = await request(app)
      .post(`/api/alumni-exams/attempt/${startTwo.body.attemptId}/submit`)
      .set('Cookie', `nu_board_token=${alumniToken}`)
      .send({ answers: { [question._id]: question.answers[1]._id } });
    expect(submitTwo.status).toBe(200);
    expect(submitTwo.body.score).toBe(0);

    const attempts = await AlumniExamAttempt.find({
      alumni: alumniUser._id,
      exam: exam._id,
      status: 'submitted',
    }).sort({ attemptNumber: 1 });
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.attemptNumber)).toEqual([1, 2]);
  });

  it('returns alumni attempt history immediately without result release gating', async () => {
    const exam = await createAlumniExam();
    const start = await request(app)
      .post(`/api/alumni-exams/${exam._id}/start`)
      .set('Cookie', `nu_board_token=${alumniToken}`);

    await request(app)
      .post(`/api/alumni-exams/attempt/${start.body.attemptId}/submit`)
      .set('Cookie', `nu_board_token=${alumniToken}`)
      .send({ answers: { [question._id]: question.answers[0]._id } });

    const res = await request(app)
      .get(`/api/alumni-exams/${exam._id}/my-attempts`)
      .set('Cookie', `nu_board_token=${alumniToken}`);

    expect(res.status).toBe(200);
    expect(res.body.attempts).toHaveLength(1);
    expect(res.body.attempts[0]).toMatchObject({
      attemptNumber: 1,
      rawScore: 1,
      totalScore: 1,
      passed: true,
      status: 'passed',
    });
    expect(res.body.attempts[0].resultsReleased).toBeUndefined();
  });

  it('does not expose alumni attempt data to faculty-facing endpoints', async () => {
    const exam = await createAlumniExam();
    await AlumniExamAttempt.create({
      alumni: alumniUser._id,
      exam: exam._id,
      attemptNumber: 1,
      status: 'submitted',
      score: 1,
      randomizedQuestions: [{ question: question._id, answers: [question.answers[0]._id] }],
      answers: { [question._id]: question.answers[0]._id },
    });

    const alumniAttemptsAsDean = await request(app)
      .get(`/api/alumni-exams/${exam._id}/my-attempts`)
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(alumniAttemptsAsDean.status).toBe(403);

    const facultyList = await request(app)
      .get('/api/mock-board-exams')
      .set('Cookie', `nu_board_token=${deanToken}`);
    expect(facultyList.status).toBe(200);
    expect(JSON.stringify(facultyList.body)).not.toContain('attemptNumber');
    expect(JSON.stringify(facultyList.body)).not.toContain(String(alumniUser._id));
  });

  it('shows aggregate alumni attempt count on the board exams faculty list', async () => {
    const exam = await createAlumniExam();
    await submitAlumniAttempt(exam._id, alumniToken, question.answers[0]._id);
    await submitAlumniAttempt(exam._id, alumniToken, question.answers[1]._id);

    const facultyList = await request(app)
      .get('/api/mock-board-exams')
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(facultyList.status).toBe(200);
    const listedExam = facultyList.body.exams.find((item) => String(item._id) === String(exam._id));
    expect(listedExam.alumniSubmissionCount).toBe(2);
  });

  it("returns an alumni report using each alumni's highest score", async () => {
    const exam = await createAlumniExam();
    const secondAlumni = await createUserAndToken({
      role: 'alumni',
      userType: 'alumni',
      department: dept._id,
      program: prog._id,
      alumniId: '2020-000002',
      email: 'alumni2@example.com',
    });

    await submitAlumniAttempt(exam._id, alumniToken, question.answers[1]._id);
    await submitAlumniAttempt(exam._id, alumniToken, question.answers[0]._id);
    await submitAlumniAttempt(exam._id, secondAlumni.token, question.answers[1]._id);

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}`)
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.result).toMatchObject({
      targetAudience: 'alumni',
      totalTakers: 2,
      totalAttempts: 3,
      overallAverageScore: 50,
      status: 'computed',
    });
    expect(res.body.result.subjects[0].questions[0]).toMatchObject({
      label: 'Q1',
      correctRate: 50,
      unansweredCount: 0,
    });
    expect(res.body.result.subjects[0].questions[0].answerCounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Correct', count: 1, isCorrect: true }),
        expect.objectContaining({ text: 'Wrong', count: 1, isCorrect: false }),
      ])
    );
  });

  it("returns individual alumni results using each alumni's highest attempt", async () => {
    const exam = await createAlumniExam();
    await submitAlumniAttempt(exam._id, alumniToken, question.answers[1]._id);
    await submitAlumniAttempt(exam._id, alumniToken, question.answers[0]._id);

    const res = await request(app)
      .get(`/api/mock-exam-results/${exam._id}/students`)
      .set('Cookie', `nu_board_token=${deanToken}`);

    expect(res.status).toBe(200);
    expect(res.body.audience).toBe('alumni');
    expect(res.body.students).toHaveLength(1);
    expect(res.body.students[0]).toMatchObject({
      attemptNumber: 2,
      attemptCount: 2,
      overallPercentage: 100,
      passed: true,
      student: {
        studentId: '2020-000001',
      },
    });
    expect(res.body.students[0].subjectBreakdowns[0]).toMatchObject({
      correct: 1,
      total: 1,
      percentage: 100,
    });
  });
});

describe('mock board alumni exam creation', () => {
  it('allows publishing alumni exams without startDateTime and endDateTime', async () => {
    const res = await request(app)
      .post('/api/mock-board-exams')
      .set('Cookie', `nu_board_token=${deanToken}`)
      .send({
        name: 'Published Alumni Exam',
        programId: prog._id,
        subjectTagIds: [tag._id],
        questionIds: [question._id],
        status: 'published',
        targetAudience: 'alumni',
      });

    expect(res.status).toBe(201);
    expect(res.body.exam.targetAudience).toBe('alumni');
    expect(res.body.exam.startDateTime).toBeNull();
    expect(res.body.exam.endDateTime).toBeNull();
  });
});
