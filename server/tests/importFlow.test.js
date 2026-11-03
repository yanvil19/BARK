const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ImportSession = require('../models/ImportSession');
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

const LIMIT_ENV_KEYS = ['GEMINI_RPM_LIMIT', 'GEMINI_RPD_LIMIT', 'IMPORT_USER_HOURLY_LIMIT', 'IMPORT_USER_DAILY_LIMIT'];
const ORIGINAL_ENV = Object.fromEntries(LIMIT_ENV_KEYS.map((key) => [key, process.env[key]]));
let prog, profCookie, otherCookie, prof;
let generateContent;

function geminiReplies(...replies) {
  generateContent = jest.fn();
  replies.forEach((reply) => {
    if (reply instanceof Error) generateContent.mockRejectedValueOnce(reply);
    else generateContent.mockResolvedValueOnce({ response: { text: () => JSON.stringify(reply) } });
  });
  jest.spyOn(geminiService.client, 'getGenerativeModel').mockImplementation(() => ({ generateContent }));
}

function uploadFile(cookie) {
  return request(app)
    .post('/api/import/validate-count')
    .set('Cookie', cookie)
    .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'questions.pdf', contentType: 'application/pdf' });
}

beforeEach(async () => {
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

describe('Import: count, then extract', () => {
  it('keeps the file text in an encrypted session and extracts from it', async () => {
    geminiReplies({ question_count: 2 }, EXTRACTED);

    const counted = await uploadFile(profCookie);
    expect(counted.status).toBe(200);
    expect(counted.body.questionCount).toBe(2);

    const session = await ImportSession.findOne({ token: counted.body.token });
    expect(session).not.toBeNull();
    expect(session.text).not.toContain('Which organ');

    const extracted = await request(app)
      .post('/api/import/extract')
      .set('Cookie', profCookie)
      .send({ token: counted.body.token, tags: [{ name: 'Anatomy' }] });
    expect(extracted.status).toBe(200);
    expect(extracted.body.questions).toHaveLength(2);

    // The session is used up, the import and both Gemini requests are counted
    expect(await ImportSession.countDocuments()).toBe(0);
    expect(await ImportUsage.countDocuments({ kind: 'import', user: prof._id })).toBe(1);
    expect(await ImportUsage.countDocuments({ kind: 'gemini_call' })).toBe(2);
    expect(extracted.body.limits.hourly.used).toBe(1);
  });

  it('keeps a rationalization from the document and drops one the AI wrote', async () => {
    geminiReplies({ question_count: 2 }, EXTRACTED);
    const counted = await uploadFile(profCookie);
    const res = await request(app)
      .post('/api/import/extract')
      .set('Cookie', profCookie)
      .send({ token: counted.body.token });

    const [first, second] = res.body.questions;
    expect(first.rationalization).toBe('The  <b>kidneys</b>  filter blood in their nephrons');
    expect(first.status).toBe('READY');

    expect(second.rationalization).toBe('');
    expect(second.status).toBe('NEEDS_REVIEW');
    expect(second.flags.map((f) => f.message).join(' ')).toMatch(/not in your document/);
  });

  it('does not let another user use the session', async () => {
    geminiReplies({ question_count: 2 }, EXTRACTED);
    const counted = await uploadFile(profCookie);

    const res = await request(app)
      .post('/api/import/extract')
      .set('Cookie', otherCookie)
      .send({ token: counted.body.token });
    expect(res.status).toBe(404);
    expect(await ImportSession.countDocuments()).toBe(1);
  });

  it('rejects a token that is not a string', async () => {
    const res = await request(app)
      .post('/api/import/extract')
      .set('Cookie', profCookie)
      .send({ token: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it('no longer has the old upload, status and submit endpoints', async () => {
    const upload = await request(app).post('/api/import/upload').set('Cookie', profCookie);
    const status = await request(app).get('/api/import/status/import_1').set('Cookie', profCookie);
    const submit = await request(app).post('/api/import/submit').set('Cookie', profCookie).send({ questions: [] });
    expect([upload.status, status.status, submit.status]).toEqual([404, 404, 404]);
  });
});

describe('Import limits', () => {
  it('counts every Gemini request, retries included', async () => {
    const unavailable = Object.assign(new Error('Service Unavailable'), { status: 503 });
    geminiReplies(unavailable, { question_count: 2 });

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(200);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(await ImportUsage.countDocuments({ kind: 'gemini_call' })).toBe(2);
  }, 15000);

  it('stops before calling Gemini when the per-minute limit is used up', async () => {
    process.env.GEMINI_RPM_LIMIT = '1';
    await ImportUsage.create({ kind: 'gemini_call' });
    geminiReplies({ question_count: 2 });

    const res = await uploadFile(profCookie);
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/busy/);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('stops a retry that would go over the limit', async () => {
    process.env.GEMINI_RPM_LIMIT = '1';
    const unavailable = Object.assign(new Error('Service Unavailable'), { status: 503 });
    geminiReplies(unavailable, { question_count: 2 });

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

    geminiReplies({ question_count: 2 });
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
