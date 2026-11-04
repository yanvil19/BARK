const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ImportUsage = require('../models/ImportUsage');
const ImportLock = require('../models/ImportLock');
const geminiService = require('../services/geminiService');
const fileExtractionService = require('../services/fileExtractionService');
const { acquireImportLock, releaseImportLock } = require('../services/importStateService');

// The text "read" from the uploaded file
const DOCUMENT_TEXT = [
  'Question 1. Which organ filters blood?',
  'A. Heart', 'B. Kidney', 'C. Lung', 'D. Liver',
  'Answer: B',
  'Rationalization: The <b>kidneys</b> filter blood in their nephrons.',
  '',
  'Question 2. Which is a fossil fuel?',
  'A. Wind', 'B. Solar', 'C. Coal', 'D. Hydro',
  'Answer: C',
].join('\n');

// What the AI returns: question 1 copies the document's rationalization (with
// different spacing and no final period); question 2 has one the AI made up.
const EXTRACTED = [
  {
    question_number: 1,
    question_text: 'Which organ filters blood?',
    options: { A: 'Heart', B: 'Kidney', C: 'Lung', D: 'Liver', E: null },
    correct_answer: 'B',
    rationalization: 'The  <b>kidneys</b>  filter blood in their nephrons',
    confidence: 'high',
    set_id: null,
    shared_passage: null,
  },
  {
    question_number: 2,
    question_text: 'Which is a fossil fuel?',
    options: { A: 'Wind', B: 'Solar', C: 'Coal', D: 'Hydro', E: null },
    correct_answer: 'C',
    rationalization: 'Coal formed from plants buried millions of years ago.',
    confidence: 'high',
    set_id: null,
    shared_passage: null,
  },
];

// The one reply: the count and the questions together
const REPLY = { question_count: 2, questions: EXTRACTED };

// One model, set by GEMINI_MODEL (the fallback across several models is tested
// in geminiModels.test.js)
const MODEL = 'gemini-test-flash';
const LIMIT_ENV_KEYS = ['GEMINI_MODEL', 'GEMINI_RPM_LIMIT', 'GEMINI_RPD_LIMIT', 'IMPORT_USER_HOURLY_LIMIT', 'IMPORT_USER_DAILY_LIMIT', 'IMPORT_MAX_QUESTIONS'];
const ORIGINAL_ENV = Object.fromEntries(LIMIT_ENV_KEYS.map((key) => [key, process.env[key]]));
let prog, profCookie, otherCookie, prof;
let generateContent, getGenerativeModel;

function geminiReplies(...replies) {
  generateContent = jest.fn();
  replies.forEach((reply) => {
    if (reply instanceof Error) generateContent.mockRejectedValueOnce(reply);
    else generateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify(reply) } });
  });
  getGenerativeModel = jest.spyOn(geminiService.client, 'getGenerativeModel').mockImplementation(() => ({ generateContent }));
}

// The system prompt and the text sent with the first Gemini request
const sentPrompt = () => getGenerativeModel.mock.calls[0][0].systemInstruction;
const sentText = () => generateContent.mock.calls[0][0].contents[0].parts[0].text;

function uploadFile(cookie, { tags } = {}) {
  const req = request(app)
    .post('/api/import/extract')
    .set('Cookie', cookie);
  if (tags !== undefined) req.field('tags', tags);
  return req.attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'questions.pdf', contentType: 'application/pdf' });
}

// A document with this many template questions
function documentWith(count) {
  return Array.from({ length: count }, (_, i) => [
    `Question ${i + 1}. Which number comes after ${i}?`,
    `A. ${i + 1}`, `B. ${i + 2}`, `C. ${i + 3}`, `D. ${i + 4}`,
    'Answer: A',
  ].join('\n')).join('\n\n');
}

beforeEach(async () => {
  for (const key of Object.keys(process.env)) {
    if (/^GEMINI_MODEL_\d+/.test(key)) delete process.env[key];
  }
  process.env.GEMINI_MODEL = MODEL;
  process.env.GEMINI_RPM_LIMIT = '60';
  process.env.GEMINI_RPD_LIMIT = '1000';

  const dept = await Department.create({ name: 'Health', code: 'HS' });
  prog = await Program.create({ name: 'Nursing', code: 'BSN', department: dept._id });

  const result = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
  prof = result.user;
  profCookie = `nu_board_token=${result.token}`;
  const other = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
  otherCookie = `nu_board_token=${other.token}`;

  jest.spyOn(fileExtractionService, 'extractFromFile').mockResolvedValue(DOCUMENT_TEXT);
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of LIMIT_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

describe('Import: one request', () => {
  it('counts and extracts the questions in one Gemini request', async () => {
    geminiReplies(REPLY);

    const res = await uploadFile(profCookie, { tags: JSON.stringify([{ name: 'Anatomy' }]) });
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.detectedCount).toBe(2);
    expect(res.body.stats).toEqual({ total: 2, ready: 1, needsReview: 1, invalid: 0 });

    // One request, with the limit in the prompt and the subjects before the text
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sentPrompt()).toMatch(/at most 40 questions/);
    expect(sentText()).toMatch(/^\[AVAILABLE TAGS[^\]]*\]: Anatomy\n\nQuestion 1\./);

    // The import and the one Gemini request are counted
    expect(await ImportUsage.countDocuments({ kind: 'import', user: prof._id })).toBe(1);
    expect(await ImportUsage.countDocuments({ kind: 'gemini_call', model: MODEL, outcome: 'success' })).toBe(1);
    expect(res.body.limits.hourly.used).toBe(1);
    expect(res.body.limits.maxQuestions).toBe(40);
  });

  it('keeps a rationalization from the document and drops one the AI wrote', async () => {
    geminiReplies(REPLY);
    const res = await uploadFile(profCookie);

    const [first, second] = res.body.questions;
    expect(first.rationalization).toBe('The  <b>kidneys</b>  filter blood in their nephrons');
    expect(first.status).toBe('READY');

    expect(second.rationalization).toBe('');
    expect(second.status).toBe('NEEDS_REVIEW');
    expect(second.flags.map((f) => f.message).join(' ')).toMatch(/not in your document/);
  });

  it('still reads a reply that is only the array of questions', async () => {
    geminiReplies(EXTRACTED);
    const res = await uploadFile(profCookie);
    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(2);
    expect(res.body.detectedCount).toBe(2);
  });

  it('turns away a file with more questions than the limit, and counts it as an upload', async () => {
    process.env.IMPORT_MAX_QUESTIONS = '1';
    geminiReplies({ question_count: 2, questions: [] });

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contains 2 questions \(maximum allowed is 1\)/);
    expect(sentPrompt()).toMatch(/at most 1 questions/);
    expect(res.body.limits.hourly.used).toBe(1);
    expect(await ImportUsage.countDocuments({ kind: 'import', user: prof._id })).toBe(1);
  });

  it('goes by the questions returned when the AI says there are fewer', async () => {
    process.env.IMPORT_MAX_QUESTIONS = '1';
    geminiReplies({ question_count: 1, questions: EXTRACTED });

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contains 2 questions/);
  });

  it('accepts a file with exactly the limit', async () => {
    process.env.IMPORT_MAX_QUESTIONS = '2';
    geminiReplies(REPLY);
    expect((await uploadFile(profCookie)).status).toBe(200);
  });

  it('turns away a file that clearly has too many questions without asking Gemini', async () => {
    fileExtractionService.extractFromFile.mockResolvedValue(documentWith(51));
    geminiReplies(REPLY);

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contains about 51 questions \(maximum allowed is 40\)/);
    expect(generateContent).not.toHaveBeenCalled();

    // Nothing was sent to Gemini, so it does not use up an upload
    expect(await ImportUsage.countDocuments()).toBe(0);
    expect(res.body.limits.hourly.used).toBe(0);
  });

  it('leaves a file near the limit for Gemini to count', async () => {
    fileExtractionService.extractFromFile.mockResolvedValue(documentWith(45));
    geminiReplies({ question_count: 45, questions: [] });

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/contains 45 questions/);
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('says so when the document has no questions, without using up an upload', async () => {
    geminiReplies({ question_count: 0, questions: [] });
    const res = await uploadFile(profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No multiple choice questions/);
    expect(await ImportUsage.countDocuments({ kind: 'import' })).toBe(0);
  });

  it('ignores a tags field that is not a JSON list', async () => {
    geminiReplies(REPLY);
    const res = await uploadFile(profCookie, { tags: 'Anatomy' });
    expect(res.status).toBe(200);
    expect(sentText()).not.toMatch(/AVAILABLE TAGS/);
  });

  it('asks for a file', async () => {
    const res = await request(app).post('/api/import/extract').set('Cookie', profCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No file/);
  });

  it('no longer has the old count, upload, status and submit endpoints', async () => {
    const count = await request(app).post('/api/import/validate-count').set('Cookie', profCookie);
    const upload = await request(app).post('/api/import/upload').set('Cookie', profCookie);
    const status = await request(app).get('/api/import/status/import_1').set('Cookie', profCookie);
    const submit = await request(app).post('/api/import/submit').set('Cookie', profCookie).send({ questions: [] });
    expect([count.status, upload.status, status.status, submit.status]).toEqual([404, 404, 404, 404]);
  });
});

describe('Import limits', () => {
  it('counts every Gemini request, retries included', async () => {
    const unavailable = Object.assign(new Error('Service Unavailable'), { status: 503 });
    geminiReplies(unavailable, REPLY);

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(await ImportUsage.countDocuments({ kind: 'gemini_call' })).toBe(2);
  }, 15000);

  it('stops before calling Gemini when the per-minute limit is used up', async () => {
    process.env.GEMINI_RPM_LIMIT = '1';
    await ImportUsage.create({ kind: 'gemini_call', model: MODEL });
    geminiReplies(REPLY);

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/busy/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('stops a retry that would go over the limit', async () => {
    process.env.GEMINI_RPM_LIMIT = '1';
    const unavailable = Object.assign(new Error('Service Unavailable'), { status: 503 });
    geminiReplies(unavailable, REPLY);

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(429);
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(await ImportUsage.countDocuments({ kind: 'gemini_call' })).toBe(1);
  }, 15000);

  it('keeps the per-user limit in the database', async () => {
    process.env.IMPORT_USER_HOURLY_LIMIT = '2';
    await ImportUsage.create([{ kind: 'import', user: prof._id }, { kind: 'import', user: prof._id }]);

    const limits = await request(app).get('/api/import/limits').set('Cookie', profCookie);
    expect(limits.body.limits.isLimitReached).toBe(true);
    expect(limits.body.limits.hourly.used).toBe(2);

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(429);
    expect(res.body.limits.isLimitReached).toBe(true);

    // Another user is not affected
    const other = await request(app).get('/api/import/limits').set('Cookie', otherCookie);
    expect(other.body.limits.isLimitReached).toBe(false);
  });
});

describe('One import at a time', () => {
  it('turns away a second import while one is in progress, and releases the lock after', async () => {
    const lockId = await acquireImportLock(prof._id);
    expect(lockId).toBeTruthy();
    expect(await acquireImportLock(prof._id)).toBeNull();

    geminiReplies(REPLY);
    const blocked = await uploadFile(profCookie);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/already have an import/);

    await releaseImportLock(prof._id, lockId);
    const allowed = await uploadFile(profCookie);
    expect(allowed.status).toBe(200);

    // The request released its own lock when it finished
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await ImportLock.countDocuments({ user: prof._id })).toBe(0);
  });

  it('takes over a lock that has expired', async () => {
    await ImportLock.init();
    await ImportLock.create({ user: prof._id, lockId: 'stale', expiresAt: new Date(Date.now() - 1000) });
    const lockId = await acquireImportLock(prof._id);
    expect(lockId).toBeTruthy();
    expect(lockId).not.toBe('stale');
  });
});

describe('Rough question count without the AI', () => {
  it('counts the lines that start an "A" option, formatted or not', () => {
    const text = [
      'Question 1. First?', 'A. yes', 'B. no',
      'Question 2. Second?', '<b>A)</b> yes', 'B) no',
      'Question 3. Third?', '  (A) yes', '(B) no',
      'Question 4. Fourth?', 'a. lower case is not counted', '1. nor are numbered options',
      'A.M. and Aspirin are not options either',
    ].join('\n');
    expect(fileExtractionService.estimateQuestionCount(text)).toBe(3);
    expect(fileExtractionService.estimateQuestionCount('')).toBe(0);
  });
});
