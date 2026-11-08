const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const User = require('../models/User');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const ExamAiOverview = require('../models/ExamAiOverview');
const AuditLog = require('../models/AuditLog');
const geminiService = require('../services/geminiService');
const { encryptText } = require('../services/encryptionService');
const { checkOverviewContent } = require('../services/examOverviewContent');

const { EXAM_AI_OVERVIEW_LIMIT } = ExamAiOverview;

// Text that must never reach Gemini: the questions, their answers and the takers
const SECRET_STEM = 'Which valve keeps blood from flowing back into the left atrium';
const SECRET_ANSWER = 'The mitral valve closes during systole';
const TAKER_NAME = 'Juana Dela Cruz';

const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

let dept;
let prog;
let deanUser;
let deanCookie;
let cardiology;
let pharmacology;
let questions;
let userCount = 0;

let generateContent;
let getGenerativeModel;

// Gemini answers each request with the next reply (an Error is thrown instead)
function mockGemini(...replies) {
  generateContent = jest.fn();
  replies.forEach((reply) => {
    if (reply instanceof Error) generateContent.mockRejectedValueOnce(reply);
    else generateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify(reply) } });
  });
  getGenerativeModel = jest.spyOn(geminiService.client, 'getGenerativeModel')
    .mockImplementation(() => ({ generateContent }));
}

const sentText = (call = 0) => generateContent.mock.calls[call][0].contents[0].parts[0].text;
const sentInstruction = (call = 0) => getGenerativeModel.mock.calls[call][0].systemInstruction;

function geminiError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const goodReply = (overrides = {}) => ({
  summary: 'Most takers passed. Q4 should be checked before results are released.',
  findings: [
    { tone: 'problem', title: 'Check Q4 key', text: 'More takers chose answer b than the keyed answer on Q4.', questions: [4], topics: ['Pharmacology'] },
    { tone: 'good', title: 'Cardiology is strong', text: 'Cardiology was the strongest topic.', questions: [], topics: ['cardiology'] },
  ],
  topicsNote: 'Cardiology was stronger than Pharmacology.',
  questionsToReview: [{ question: 4, flag: 'check_key', reason: 'Answer b was chosen more often than the key.' }],
  progressNote: 'Scores went up since the last exam.',
  supportNote: 'A few takers need support in Pharmacology.',
  nextSteps: ['Check the answer key of Q4.', 'Review Pharmacology with the class.'],
  ...overrides,
});

async function makeQuestions() {
  const base = { program: prog._id, createdBy: deanUser._id, state: 'approved' };
  return Question.create([1, 2, 3, 4].map((n) => ({
    ...base,
    tag: n <= 2 ? cardiology._id : pharmacology._id,
    description: encryptText(`${SECRET_STEM} ${n}`),
    answers: [
      { text: encryptText(`${SECRET_ANSWER} ${n}`), isCorrect: true },
      { text: encryptText(`Second choice ${n}`), isCorrect: false },
      { text: encryptText(`Third choice ${n}`), isCorrect: false },
    ],
  })));
}

async function makeExam(name, { startedDaysAgo = 3, audience = 'student', program = prog } = {}) {
  return MockBoardExam.create({
    name,
    program: program._id,
    department: dept._id,
    questions: questions.map((question) => question._id),
    startDateTime: daysAgo(startedDaysAgo),
    endDateTime: daysAgo(startedDaysAgo - 1),
    status: 'finished',
    targetAudience: audience,
    passingThreshold: 70,
    createdBy: deanUser._id,
  });
}

async function makeUsers(role, count, program = prog) {
  const users = Array.from({ length: count }, () => {
    userCount += 1;
    return {
      name: `${TAKER_NAME} ${userCount}`,
      email: `taker-${userCount}@example.com`,
      password: 'already-hashed',
      role,
      isVerified: true,
      isActive: true,
      department: dept._id,
      program: program._id,
      ...(role === 'student' ? { studentId: `2026-${String(userCount).padStart(6, '0')}` } : {}),
    };
  });
  return User.insertMany(users);
}

// What a taker chose on each question: an answer index, or null for blank
function scoreAnswers(choices) {
  const answers = {};
  const perTag = new Map();
  let score = 0;
  choices.forEach((choice, index) => {
    const question = questions[index];
    const tagId = String(question.tag);
    const sum = perTag.get(tagId) || { tag: question.tag, correct: 0, total: 0 };
    sum.total += 1;
    if (choice !== null) {
      answers[String(question._id)] = question.answers[choice]._id;
      if (question.answers[choice].isCorrect) {
        score += 1;
        sum.correct += 1;
      }
    }
    perTag.set(tagId, sum);
  });
  return { answers, score, subjectScores: [...perTag.values()] };
}

// Most takers get Q1 to Q3 right, and most choose answer b on Q4 (the key may be wrong)
const STUDENT_CHOICES = [
  [0, 0, 0, 1],
  [0, 0, 0, 1],
  [0, 0, 0, 1],
  [0, 0, 1, 1],
  [0, 0, 0, 0],
  [0, 1, 0, 1],
  [0, 0, null, 2],
  [1, 0, 0, 1],
];

async function addStudentAttempts(exam, choicesList = STUDENT_CHOICES) {
  const students = await makeUsers('student', choicesList.length);
  await StudentExamAttempt.create(students.map((student, index) => ({
    exam: exam._id,
    student: student._id,
    status: 'submitted',
    randomizedQuestions: questions.map((question) => question._id),
    submittedAt: exam.endDateTime,
    ...scoreAnswers(choicesList[index]),
  })));
}

function compute(exam) {
  return request(app).post(`/api/mock-exam-results/${exam._id}/compute`).set('Cookie', deanCookie).send({});
}

async function studentExamWithResults(name, options = {}) {
  const exam = await makeExam(name, options);
  await addStudentAttempts(exam, options.choices);
  const computed = await compute(exam);
  expect(computed.status).toBe(200);
  return exam;
}

async function addAlumniAttempt(exam, alumni, attemptNumber, choices) {
  return AlumniExamAttempt.create({
    alumni: alumni._id,
    exam: exam._id,
    attemptNumber,
    status: 'submitted',
    randomizedQuestions: questions.map((question) => ({
      question: question._id,
      answers: question.answers.map((answer) => answer._id),
    })),
    endTime: new Date(),
    ...scoreAnswers(choices),
  });
}

const getOverview = (exam, cookie = deanCookie, query = '') => request(app)
  .get(`/api/mock-exam-results/${exam._id}/ai-overview${query}`)
  .set('Cookie', cookie);

const generate = (exam, cookie = deanCookie) => request(app)
  .post(`/api/mock-exam-results/${exam._id}/ai-overview`)
  .set('Cookie', cookie)
  .send({});

beforeEach(async () => {
  dept = await Department.create({ name: 'Health Sciences', code: 'HS' });
  prog = await Program.create({ name: 'Nursing', code: 'BSN', department: dept._id });
  const dean = await createUserAndToken({ role: 'dean', department: dept._id, program: prog._id, email: 'dean@example.com' });
  deanUser = dean.user;
  deanCookie = dean.cookieHeader;
  cardiology = await Tag.create({ name: 'Cardiology', program: prog._id, createdBy: deanUser._id, isActive: true });
  pharmacology = await Tag.create({ name: 'Pharmacology', program: prog._id, createdBy: deanUser._id, isActive: true });
  questions = await makeQuestions();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AI overview of a student exam', () => {
  it('starts with no overview and all generations left', async () => {
    const exam = await studentExamWithResults('Mock 1');
    const res = await getOverview(exam);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      limit: EXAM_AI_OVERVIEW_LIMIT,
      used: 0,
      remaining: EXAM_AI_OVERVIEW_LIMIT,
      generating: null,
      versions: [],
      overview: null,
    });
  });

  it('generates an overview from figures worked out on the server', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(goodReply());

    const res = await generate(exam);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ used: 1, remaining: EXAM_AI_OVERVIEW_LIMIT - 1, generating: null });
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.versions[0].createdBy).toEqual({ name: 'Test User', role: 'dean' });

    const { overview } = res.body;
    expect(overview).toMatchObject({ version: 1, isLatest: true, isStale: false, newAttempts: 0 });
    expect(overview.facts.exam).toMatchObject({ name: 'Mock 1', audience: 'student', program: 'Nursing', threshold: 70, questionCount: 4 });
    // 4 takers at 75% or more pass; the other 4 have exactly 50%, so none is below 50
    expect(overview.facts.summary).toMatchObject({ takers: 8, passed: 4, passRate: 50, missed: 0, belowFifty: 0 });
    expect(overview.facts.previous).toBeNull();
    expect(overview.facts.trend).toEqual([]);
    expect(overview.facts.topics.map((topic) => topic.name).sort()).toEqual(['Cardiology', 'Pharmacology']);

    // Q4: 6 of 8 chose answer b over the keyed answer a
    const q4 = overview.facts.questions.find((question) => question.number === 4);
    expect(q4).toMatchObject({ key: 'a', correct: 13, topWrong: { answer: 'b', percent: 75 } });
    expect(q4.signals[0]).toBe('check_key');

    // Topic names are matched to the exact ones, and the progress note is dropped without a trend
    expect(overview.content.findings[1].topics).toEqual(['Cardiology']);
    expect(overview.content.questionsToReview).toEqual([
      { question: 4, flag: 'check_key', reason: 'Answer b was chosen more often than the key.' },
    ]);
    expect(overview.content.progressNote).toBe('');

    const stored = await ExamAiOverview.findOne({ exam: exam._id }).lean();
    expect(stored).toMatchObject({ version: 1, status: 'ready' });
    expect(stored.basedOn.computedAt).toBeTruthy();

    const audit = await AuditLog.findOne({ action: 'mock_exam_ai_overview_generated' }).lean();
    expect(audit).toMatchObject({ targetType: 'MockBoardExam', details: { examName: 'Mock 1', version: 1 } });
  });

  it('never sends question text, answer text or names to Gemini', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(goodReply());
    expect((await generate(exam)).status).toBe(201);

    const sent = `${sentInstruction()}\n${sentText()}`;
    expect(sent).not.toContain(SECRET_STEM);
    expect(sent).not.toContain(SECRET_ANSWER);
    expect(sent).not.toContain('Second choice');
    expect(sent).not.toContain(TAKER_NAME);
    expect(sent).not.toContain('@example.com');
    expect(sent).toContain('"number":4');
  });

  it('compares with the program\'s earlier exam', async () => {
    await studentExamWithResults('Mock 0', {
      startedDaysAgo: 30,
      choices: [[0, 0, 1, 1], [0, 1, 1, 1], [1, 1, 0, 1], [0, 0, 0, 0]],
    });
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(goodReply());

    const { body } = await generate(exam);
    const { facts } = body.overview;
    expect(facts.previous).toMatchObject({ name: 'Mock 0', takers: 4 });
    expect(facts.previous.averageChange).toBe(facts.summary.average - facts.previous.average);
    expect(facts.trend.map((entry) => entry.name)).toEqual(['Mock 0', 'Mock 1']);
    expect(facts.trend[1].current).toBe(true);
    expect(facts.topics.every((topic) => topic.previous !== null)).toBe(true);
    expect(body.overview.content.progressNote).toBe('Scores went up since the last exam.');
  });

  it('is out of date once the results are computed again', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(goodReply());
    await generate(exam);

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await compute(exam)).status).toBe(200);
    const res = await getOverview(exam);
    expect(res.body.overview.isStale).toBe(true);
  });

  it('counts students who missed the exam as not taken, apart from the low scores', async () => {
    const exam = await makeExam('Mock 1');
    await addStudentAttempts(exam);
    // The expiry job's empty attempt for a student who never took the exam
    const [absent] = await makeUsers('student', 1);
    await StudentExamAttempt.create({
      exam: exam._id, student: absent._id, status: 'submitted', autoSubmitted: true,
      randomizedQuestions: questions.map((question) => question._id), answers: {}, score: 0,
      submittedAt: exam.endDateTime,
    });
    expect((await compute(exam)).status).toBe(200);
    mockGemini(goodReply());

    const { body } = await generate(exam);
    // As on the results page, the missed attempt counts as a 0% taker
    expect(body.overview.facts.summary).toMatchObject({ takers: 9, missed: 1, belowFifty: 0, notTaken: 1 });
    expect(body.overview.facts.groups.belowFifty.count).toBe(0);
    expect(body.overview.facts.groups.notTaken.count).toBe(1);
  });

  it('needs computed results', async () => {
    const exam = await makeExam('Mock 1');
    mockGemini(goodReply());
    const res = await generate(exam);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('no_results');
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('AI overview of an alumni exam', () => {
  it('counts each alumni\'s highest attempt and notices new attempts', async () => {
    const exam = await makeExam('Alumni Mock', { audience: 'alumni' });
    const alumni = await makeUsers('alumni', 3);
    await addAlumniAttempt(exam, alumni[0], 1, [0, 1, 1, 1]);
    await addAlumniAttempt(exam, alumni[0], 2, [0, 0, 0, 1]);
    await addAlumniAttempt(exam, alumni[1], 1, [0, 0, 0, 0]);
    await addAlumniAttempt(exam, alumni[2], 1, [1, 1, 0, 1]);
    mockGemini(goodReply());

    const res = await generate(exam);
    expect(res.status).toBe(201);
    const { facts } = res.body.overview;
    expect(facts.exam.audience).toBe('alumni');
    expect(facts.summary).toMatchObject({ takers: 3, eligible: 3, notTaken: 0, missed: 0 });
    expect(facts.retakes).toEqual({ retakers: 1, improved: 1 });
    expect(facts.basis.attempts).toBe(4);

    await addAlumniAttempt(exam, alumni[2], 2, [0, 0, 0, 0]);
    const later = await getOverview(exam);
    expect(later.body.overview).toMatchObject({ isStale: true, newAttempts: 1 });
  });

  it('needs at least one attempt', async () => {
    const exam = await makeExam('Alumni Mock', { audience: 'alumni' });
    mockGemini(goodReply());
    const res = await generate(exam);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'no_results', message: 'No alumni have taken this exam yet.' });
  });
});

describe('AI overview generations and versions', () => {
  it('keeps each generation as a version that can still be read', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(goodReply(), goodReply({ summary: 'A second look at the results.' }));

    expect((await generate(exam)).status).toBe(201);
    const second = await generate(exam);
    expect(second.status).toBe(201);
    expect(second.body.versions.map((entry) => entry.version)).toEqual([2, 1]);
    expect(second.body.overview).toMatchObject({ version: 2, isLatest: true });
    expect(second.body.overview.content.summary).toBe('A second look at the results.');

    const first = await getOverview(exam, deanCookie, '?version=1');
    expect(first.status).toBe(200);
    expect(first.body.overview).toMatchObject({ version: 1, isLatest: false });
    expect(first.body.overview.content.summary).toBe(goodReply().summary);

    expect((await getOverview(exam, deanCookie, '?version=5')).status).toBe(404);
    expect((await getOverview(exam, deanCookie, '?version=abc')).status).toBe(404);
  });

  it(`allows ${EXAM_AI_OVERVIEW_LIMIT} generations per exam, shared by everyone`, async () => {
    const exam = await studentExamWithResults('Mock 1');
    await ExamAiOverview.create(Array.from({ length: EXAM_AI_OVERVIEW_LIMIT - 1 }, (_, index) => ({
      exam: exam._id, department: dept._id, version: index + 1, status: 'ready', createdBy: deanUser._id,
      facts: {}, content: { summary: 'Earlier.' },
    })));
    const chair = await createUserAndToken({ role: 'program_chair', department: dept._id, program: prog._id, email: 'chair@example.com' });
    mockGemini(goodReply());

    const last = await generate(exam, chair.cookieHeader);
    expect(last.status).toBe(201);
    expect(last.body).toMatchObject({ used: EXAM_AI_OVERVIEW_LIMIT, remaining: 0 });
    expect(last.body.overview.createdBy).toEqual({ name: 'Test User', role: 'program_chair' });

    const over = await generate(exam);
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('limit');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('gives back the generation when the AI fails', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(geminiError(400, 'API key not valid'));

    const failed = await generate(exam);
    expect(failed.status).toBe(502);
    expect(failed.body.message).toMatch(/wasn't counted/);
    expect(await ExamAiOverview.countDocuments({ exam: exam._id })).toBe(0);

    const state = await getOverview(exam);
    expect(state.body).toMatchObject({ used: 0, remaining: EXAM_AI_OVERVIEW_LIMIT });
  });

  it('gives back the generation when the AI is busy', async () => {
    const exam = await studentExamWithResults('Mock 1');
    mockGemini(geminiError(429, 'RESOURCE_EXHAUSTED'));

    const busy = await generate(exam);
    expect(busy.status).toBe(429);
    expect(busy.body).toMatchObject({ code: 'ai_busy' });
    expect(busy.body.message).toMatch(/Try again in a minute/);
    expect(await ExamAiOverview.countDocuments({ exam: exam._id })).toBe(0);
  });

  it('tries again when the answer cannot be used', async () => {
    const exam = await studentExamWithResults('Mock 1');
    // The first answer's only summary sentence uses a number that is not in the facts
    mockGemini(goodReply({ summary: 'The average rose by 987 points.' }), goodReply());

    const res = await generate(exam);
    expect(res.status).toBe(201);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(res.body.overview.content.summary).toBe(goodReply().summary);
  });

  it('allows one generation at a time and frees a stuck one', async () => {
    const exam = await studentExamWithResults('Mock 1');
    const running = await ExamAiOverview.create({
      exam: exam._id, department: dept._id, version: 1, status: 'generating', createdBy: deanUser._id,
    });
    mockGemini(goodReply());

    const blocked = await generate(exam);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('generating');
    const state = await getOverview(exam);
    expect(state.body.generating).toMatchObject({ version: 1 });
    expect(state.body.used).toBe(1);

    await ExamAiOverview.updateOne({ _id: running._id }, { createdAt: new Date(Date.now() - 11 * 60 * 1000) });
    const freed = await generate(exam);
    expect(freed.status).toBe(201);
    expect(freed.body.overview.version).toBe(1);
  });
});

describe('AI overview access', () => {
  it('lets a program chair see only their program\'s exams', async () => {
    const exam = await studentExamWithResults('Mock 1');
    const otherProgram = await Program.create({ name: 'Medical Technology', code: 'BSMT', department: dept._id });
    const otherChair = await createUserAndToken({ role: 'program_chair', department: dept._id, program: otherProgram._id, email: 'other-chair@example.com' });
    const chair = await createUserAndToken({ role: 'program_chair', department: dept._id, program: prog._id, email: 'chair@example.com' });
    mockGemini(goodReply());

    expect((await getOverview(exam, otherChair.cookieHeader)).status).toBe(404);
    expect((await generate(exam, otherChair.cookieHeader)).status).toBe(404);
    expect((await getOverview(exam, chair.cookieHeader)).status).toBe(200);
  });

  it('is closed to other departments and roles', async () => {
    const exam = await studentExamWithResults('Mock 1');
    const otherDept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const otherDean = await createUserAndToken({ role: 'dean', department: otherDept._id, email: 'other-dean@example.com' });
    const professor = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id, email: 'prof@example.com' });

    expect((await getOverview(exam, otherDean.cookieHeader)).status).toBe(404);
    expect((await getOverview(exam, professor.cookieHeader)).status).toBe(403);
    expect((await request(app).get(`/api/mock-exam-results/${exam._id}/ai-overview`)).status).toBe(401);
    expect((await request(app).get('/api/mock-exam-results/not-an-id/ai-overview').set('Cookie', deanCookie)).status).toBe(404);
  });
});

describe('checkOverviewContent', () => {
  const facts = {
    exam: { threshold: 70 },
    summary: { takers: 42, average: 68, passRate: 55 },
    previous: { averageChange: -4 },
    topics: [{ name: 'Cardiology', score: 74 }],
    questions: [
      { number: 12, signals: ['shared_mistake', 'often_skipped'] },
      { number: 27, signals: [] },
    ],
    trend: [],
  };

  it('keeps only sentences whose numbers are in the facts', () => {
    const content = checkOverviewContent({
      summary: 'The average was 68%. It fell by 4 points. About 61 takers improved.',
      findings: [
        { tone: 'watch', title: 'Pass rate', text: 'The pass rate was 55%.', questions: [12, 99], topics: ['CARDIOLOGY', 'Unknown'] },
        { tone: 'good', title: 'Made up', text: 'Scores rose by 23 points.', questions: [], topics: [] },
        { tone: 'loud', title: 'Bad tone', text: 'Fine.', questions: [], topics: [] },
      ],
      topicsNote: '**Cardiology** scored 74. <b>Nothing</b> else.',
      questionsToReview: [
        { question: 12, flag: 'check_key', reason: 'Answer c drew 31% of takers.' },
        { question: 12, flag: 'shared_mistake', reason: 'Repeated.' },
        { question: 27, flag: 'too_hard', reason: 'No signals.' },
        { question: 99, flag: 'too_hard', reason: 'Not a question.' },
      ],
      progressNote: 'Up by 2 points.',
      supportNote: 'The 42 takers need support.',
      nextSteps: ['Review Q12.', 'Hold 15 review sessions.'],
    }, facts);

    expect(content.summary).toBe('The average was 68%. It fell by 4 points.');
    expect(content.findings).toEqual([
      { tone: 'watch', title: 'Pass rate', text: 'The pass rate was 55%.', questions: [12], topics: ['Cardiology'] },
    ]);
    expect(content.topicsNote).toBe('Cardiology scored 74. Nothing else.');
    // check_key is not one of Q12's signals, so its own first signal is used; the reason's 31 is not a fact
    expect(content.questionsToReview).toEqual([{ question: 12, flag: 'shared_mistake', reason: '' }]);
    expect(content.progressNote).toBe('');
    expect(content.supportNote).toBe('The 42 takers need support.');
    expect(content.nextSteps).toEqual(['Review Q12.']);
  });

  it('rejects an answer without a usable summary', () => {
    expect(() => checkOverviewContent(null, facts)).toThrow(/not the expected JSON/);
    expect(() => checkOverviewContent([], facts)).toThrow(/not the expected JSON/);
    expect(() => checkOverviewContent({ summary: 'Up 999 points.' }, facts)).toThrow(/not the expected JSON/);
  });
});
