const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ImportUsage = require('../models/ImportUsage');
const GeminiCooldown = require('../models/GeminiCooldown');
const geminiService = require('../services/geminiService');
const fileExtractionService = require('../services/fileExtractionService');
const { getGeminiModels } = require('../config/geminiModels');
const { nextPacificMidnight, startOfPacificDay } = require('../utils/pacificTime');

const { cooldownFor } = geminiService;

// ── The model list ──────────────────────────────────────────────────────────

describe('Gemini model list', () => {
  it('reads the numbered models in number order, gaps allowed, with their own or the shared limits', () => {
    const models = getGeminiModels({
      GEMINI_MODEL_3: 'third',
      GEMINI_MODEL_1: 'first',
      GEMINI_MODEL_1_RPM: '10',
      GEMINI_MODEL_1_RPD: '250',
      GEMINI_MODEL_7: ' seventh ',
      GEMINI_RPM_LIMIT: '5',
      GEMINI_MODEL: 'ignored when numbered models are set',
    });
    expect(models).toEqual([
      { position: 1, name: 'first', rpm: 10, rpd: 250 },
      { position: 3, name: 'third', rpm: 5, rpd: 200 },
      { position: 7, name: 'seventh', rpm: 5, rpd: 200 },
    ]);
  });

  it('uses GEMINI_MODEL when no numbered model is set', () => {
    expect(getGeminiModels({ GEMINI_MODEL: 'solo', GEMINI_RPD_LIMIT: '50' })).toEqual([
      { position: 1, name: 'solo', rpm: 8, rpd: 50 },
    ]);
    expect(getGeminiModels({})[0].name).toBe('gemini-2.5-flash');
  });

  it('stops on an empty model, a limit that is not a whole number, or a model listed twice', () => {
    expect(() => getGeminiModels({ GEMINI_MODEL_1: '' })).toThrow(/GEMINI_MODEL_1 is empty/);
    expect(() => getGeminiModels({ GEMINI_MODEL_1: 'a', GEMINI_MODEL_1_RPM: 'ten' })).toThrow(/GEMINI_MODEL_1_RPM must be a whole number/);
    expect(() => getGeminiModels({ GEMINI_MODEL_1: 'a', GEMINI_MODEL_1_RPD: '-1' })).toThrow(/whole number/);
    expect(() => getGeminiModels({ GEMINI_MODEL_1: 'a', GEMINI_MODEL_2: 'a' })).toThrow(/set twice/);
    expect(() => getGeminiModels({ GEMINI_RPM_LIMIT: '1.5' })).toThrow(/GEMINI_RPM_LIMIT/);
  });
});

describe('Pacific time day', () => {
  it('finds midnight Pacific time in winter, in summer and on the days the clocks change', () => {
    expect(startOfPacificDay(new Date('2026-11-04T12:00:00Z')).toISOString()).toBe('2026-11-04T08:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-11-04T12:00:00Z')).toISOString()).toBe('2026-11-05T08:00:00.000Z');
    expect(startOfPacificDay(new Date('2026-07-15T06:59:00Z')).toISOString()).toBe('2026-07-14T07:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-03-08T12:00:00Z')).toISOString()).toBe('2026-03-09T07:00:00.000Z');
    expect(nextPacificMidnight(new Date('2026-11-01T12:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });
});

// ── Cooldowns ───────────────────────────────────────────────────────────────

function googleError(status, details = []) {
  return Object.assign(new Error(`[${status}] Google error`), { status, errorDetails: details });
}
const quotaFailure = (quotaId) => ({ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId }] });
const retryInfo = (retryDelay) => ({ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay });
const minuteQuota = () => googleError(429, [quotaFailure('GenerateRequestsPerMinutePerProjectPerModel-FreeTier'), retryInfo('30s')]);
const dailyQuota = () => googleError(429, [quotaFailure('GenerateRequestsPerDayPerProjectPerModel-FreeTier'), retryInfo('1s')]);

describe('How long a model is skipped', () => {
  const now = new Date('2026-11-04T12:00:00Z').getTime();

  it('waits as long as Google asks after a per-minute quota', () => {
    const cooldown = cooldownFor(minuteQuota(), now);
    expect(cooldown.reason).toBe('minute');
    expect(cooldown.until.getTime()).toBe(now + 30 * 1000);
  });

  it('waits for the daily reset after a daily quota, whatever wait Google gives', () => {
    const cooldown = cooldownFor(dailyQuota(), now);
    expect(cooldown.reason).toBe('day');
    expect(cooldown.until.toISOString()).toBe('2026-11-05T08:00:00.000Z');
  });

  it('waits a minute when Google gives no details, and an hour for a model that does not exist', () => {
    expect(cooldownFor(googleError(429), now).until.getTime()).toBe(now + 60 * 1000);
    const missing = cooldownFor(googleError(404), now);
    expect(missing.reason).toBe('unavailable');
    expect(missing.until.getTime()).toBe(now + 60 * 60 * 1000);
  });
});

// ── Falling back to the next model ──────────────────────────────────────────

const MODEL_KEYS = ['GEMINI_MODEL_1', 'GEMINI_MODEL_2', 'GEMINI_MODEL_3', 'GEMINI_MODEL_1_RPM', 'GEMINI_MODEL_2_RPD', 'GEMINI_RPM_LIMIT', 'GEMINI_RPD_LIMIT'];
const ORIGINAL_ENV = Object.fromEntries(MODEL_KEYS.map((key) => [key, process.env[key]]));
let profCookie;
let handlers; // model name → jest.fn() standing in for generateContent

const reply = (value) => ({ response: { text: () => JSON.stringify(value) } });

// A good reply: the count and the one question together
const ONE_QUESTION = {
  question_count: 1,
  questions: [{
    question_number: 1,
    question_text: 'Which organ filters blood?',
    options: { A: 'Heart', B: 'Kidney', C: 'Lung', D: 'Liver', E: null },
    correct_answer: 'B',
    rationalization: '',
    confidence: 'high',
    set_id: null,
    shared_passage: null,
  }],
};

function mockModels(byModel) {
  handlers = {};
  for (const [name, results] of Object.entries(byModel)) {
    handlers[name] = jest.fn();
    for (const result of results) {
      if (result instanceof Error) handlers[name].mockRejectedValueOnce(result);
      else handlers[name].mockResolvedValueOnce(reply(result));
    }
  }
  jest.spyOn(geminiService.client, 'getGenerativeModel').mockImplementation(({ model }) => ({
    generateContent: handlers[model] || jest.fn().mockRejectedValue(new Error(`no mock for ${model}`)),
  }));
}

function uploadFile() {
  return request(app)
    .post('/api/import/extract')
    .set('Cookie', profCookie)
    .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'questions.pdf', contentType: 'application/pdf' });
}

beforeEach(async () => {
  process.env.GEMINI_MODEL_1 = 'model-a';
  process.env.GEMINI_MODEL_2 = 'model-b';
  process.env.GEMINI_MODEL_3 = 'model-c';
  process.env.GEMINI_RPM_LIMIT = '60';
  process.env.GEMINI_RPD_LIMIT = '1000';

  const dept = await Department.create({ name: 'Health', code: 'HS' });
  const prog = await Program.create({ name: 'Nursing', code: 'BSN', department: dept._id });
  const prof = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
  profCookie = `nu_board_token=${prof.token}`;

  jest.spyOn(fileExtractionService, 'extractFromFile').mockResolvedValue([
    'Question 1. Which organ filters blood?',
    'A. Heart', 'B. Kidney', 'C. Lung', 'D. Liver',
    'Answer: B',
    'Rationalization: The kidneys filter blood in their nephrons.',
  ].join('\n'));
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const key of MODEL_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = ORIGINAL_ENV[key];
  }
});

describe('Falling back to the next model', () => {
  it('uses the next model when one is out of quota, and skips it while it cools down', async () => {
    mockModels({ 'model-a': [minuteQuota()], 'model-b': [ONE_QUESTION, ONE_QUESTION] });

    const first = await uploadFile();
    expect(first.status).toBe(200);
    expect(handlers['model-a']).toHaveBeenCalledTimes(1);
    expect(handlers['model-b']).toHaveBeenCalledTimes(1);

    const cooldown = await GeminiCooldown.findOne({ model: 'model-a' });
    expect(cooldown.reason).toBe('minute');
    expect(cooldown.until.getTime() - Date.now()).toBeGreaterThan(25 * 1000);
    expect(await ImportUsage.countDocuments({ model: 'model-a', outcome: 'rate_limited' })).toBe(1);
    expect(await ImportUsage.countDocuments({ model: 'model-b', outcome: 'success' })).toBe(1);

    // While model-a cools down it is not asked at all
    const second = await uploadFile();
    expect(second.status).toBe(200);
    expect(handlers['model-a']).toHaveBeenCalledTimes(1);
    expect(handlers['model-b']).toHaveBeenCalledTimes(2);
  });

  it('skips a model until the daily reset after its daily quota', async () => {
    mockModels({ 'model-a': [dailyQuota()], 'model-b': [ONE_QUESTION] });
    expect((await uploadFile()).status).toBe(200);

    const cooldown = await GeminiCooldown.findOne({ model: 'model-a' });
    expect(cooldown.reason).toBe('day');
    expect(cooldown.until.toISOString()).toBe(nextPacificMidnight(Date.now()).toISOString());
  });

  it("skips a model whose own limit on this server is used up, without asking it", async () => {
    process.env.GEMINI_MODEL_1_RPM = '1';
    await ImportUsage.create({ kind: 'gemini_call', model: 'model-a', outcome: 'success' });
    mockModels({ 'model-a': [ONE_QUESTION], 'model-b': [ONE_QUESTION] });

    expect((await uploadFile()).status).toBe(200);
    expect(handlers['model-a']).not.toHaveBeenCalled();
    expect(handlers['model-b']).toHaveBeenCalledTimes(1);
  });

  it('moves on from a model that does not exist', async () => {
    mockModels({ 'model-a': [googleError(404)], 'model-b': [ONE_QUESTION] });
    expect((await uploadFile()).status).toBe(200);
    expect((await GeminiCooldown.findOne({ model: 'model-a' })).reason).toBe('unavailable');
  });

  it('retries a passing error once on the same model, then moves on', async () => {
    mockModels({
      'model-a': [googleError(503), googleError(503)],
      'model-b': [ONE_QUESTION],
    });
    expect((await uploadFile()).status).toBe(200);
    expect(handlers['model-a']).toHaveBeenCalledTimes(2);
    expect(handlers['model-b']).toHaveBeenCalledTimes(1);
    expect(await GeminiCooldown.countDocuments()).toBe(0);
  }, 15000);

  it('does not try other models for an error they would all give', async () => {
    mockModels({ 'model-a': [googleError(400)], 'model-b': [ONE_QUESTION] });
    const res = await uploadFile();
    expect(res.status).toBe(503);
    expect(handlers['model-b']).not.toHaveBeenCalled();
  });

  it('says the service is busy when every model is cooling down', async () => {
    mockModels({ 'model-a': [minuteQuota()], 'model-b': [minuteQuota()], 'model-c': [dailyQuota()] });
    const res = await uploadFile();
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/busy/);

    // The next import is turned away before any model is asked
    const again = await uploadFile();
    expect(again.status).toBe(429);
    expect(handlers['model-a']).toHaveBeenCalledTimes(1);
  });

  it('says the daily limit is reached when every model is out for the day', async () => {
    mockModels({ 'model-a': [dailyQuota()], 'model-b': [dailyQuota()], 'model-c': [dailyQuota()] });
    const res = await uploadFile();
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/daily limit/);
  });
});

// ── System Metrics ──────────────────────────────────────────────────────────

describe('Gemini models on the System Metrics page', () => {
  it('shows each model in order with its usage, status and when it is available again', async () => {
    const admin = await createUserAndToken({ role: 'super_admin', email: 'ai-metrics@example.com' });
    process.env.GEMINI_MODEL_2_RPD = '2';

    const now = Date.now();
    await ImportUsage.create([
      { kind: 'gemini_call', model: 'model-a', outcome: 'success', createdAt: new Date(now - 5 * 1000) },
      { kind: 'gemini_call', model: 'model-a', outcome: 'rate_limited', createdAt: new Date(now - 2 * 1000) },
      { kind: 'gemini_call', model: 'model-b', outcome: 'success', createdAt: new Date(now - 2 * 60 * 1000) },
      { kind: 'gemini_call', model: 'model-b', outcome: 'success', createdAt: new Date(now - 3 * 60 * 1000) },
    ]);
    const until = new Date(now + 40 * 1000);
    await GeminiCooldown.create({ model: 'model-a', reason: 'minute', until, message: "Google's per-minute limit for this model was reached." });

    const res = await request(app).get('/api/stats/system-metrics?range=1h').set('Cookie', admin.cookieHeader);
    expect(res.status).toBe(200);

    const { ai } = res.body;
    expect(ai.dailyResetTimeZone).toBe('America/Los_Angeles');
    expect(new Date(ai.dailyResetAt).getTime()).toBe(nextPacificMidnight(now).getTime());
    expect(ai.activeModel).toBe('model-c');

    const [a, b, c] = ai.models;
    expect(a).toMatchObject({
      position: 1,
      name: 'model-a',
      status: 'cooling_down',
      source: 'google',
      inUse: false,
      limits: { perMinute: 60, perDay: 1000 },
      usage: { lastMinute: 2, blockedToday: 1 },
    });
    expect(new Date(a.availableAt).getTime()).toBe(until.getTime());

    expect(b).toMatchObject({ name: 'model-b', status: 'daily_limit', source: 'limit', limits: { perDay: 2 }, usage: { lastMinute: 0 } });
    expect(new Date(b.availableAt).getTime()).toBe(nextPacificMidnight(now).getTime());

    expect(c).toMatchObject({ name: 'model-c', status: 'available', inUse: true, availableAt: null });

    // model-a: 1000 − 2 used = 998 left; model-b is at its daily limit: 0; model-c: 1000
    expect(ai.totals).toEqual({
      perMinute: 180,
      perDay: 2002,
      lastMinute: 2,
      today: 4,
      blockedToday: 1,
      remainingToday: 1998,
      requestsPerImport: 1,
      importsLeftToday: 1998,
      availableModels: 1,
    });
  });

  it('adds up the daily capacity of the models, leaving out one that is turned off', async () => {
    const admin = await createUserAndToken({ role: 'super_admin', email: 'ai-totals@example.com' });
    process.env.GEMINI_MODEL_1_RPM = '0'; // model-a off
    process.env.GEMINI_MODEL_2_RPD = '21';
    await ImportUsage.create({ kind: 'gemini_call', model: 'model-c', outcome: 'success' });

    const res = await request(app).get('/api/stats/system-metrics?range=1h').set('Cookie', admin.cookieHeader);
    const { totals } = res.body.ai;
    expect(totals.perDay).toBe(21 + 1000);
    expect(totals.remainingToday).toBe(21 + 999);
    expect(totals.importsLeftToday).toBe(21 + 999);
    expect(totals.availableModels).toBe(2);
  });
});
