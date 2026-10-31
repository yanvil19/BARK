const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const requestMetrics = require('../services/requestMetrics');
const AuditLog = require('../models/AuditLog');
const RequestMetric = require('../models/RequestMetric');

let adminCookie;
let adminUser;

beforeEach(async () => {
  requestMetrics.resetForTests();
  const { user, cookieHeader } = await createUserAndToken({ role: 'super_admin', email: 'metrics-admin@example.com' });
  adminUser = user;
  adminCookie = cookieHeader;
});

function getMetrics(range = '1h') {
  return request(app).get(`/api/stats/system-metrics?range=${range}`).set('Cookie', adminCookie);
}

describe('GET /api/stats/system-metrics access', () => {
  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/stats/system-metrics');
    expect(res.status).toBe(401);
  });

  it('returns 403 for non super admins', async () => {
    const { cookieHeader } = await createUserAndToken({ role: 'dean', email: 'metrics-dean@example.com' });
    const res = await request(app).get('/api/stats/system-metrics').set('Cookie', cookieHeader);
    expect(res.status).toBe(403);
  });

  it('rejects an unknown range', async () => {
    const res = await getMetrics('30d');
    expect(res.status).toBe(400);
  });

  it('returns every section for each range', async () => {
    for (const [range, expectedPoints] of [['1h', 60], ['24h', 96], ['7d', 84]]) {
      const res = await getMetrics(range);
      expect(res.status).toBe(200);
      expect(res.body.requests.range).toBe(range);
      expect(res.body.requests.series).toHaveLength(expectedPoints);
      expect(res.body).toHaveProperty('users.now');
      expect(res.body).toHaveProperty('server.uptimeSec');
      expect(res.body).toHaveProperty('server.database.state', 'connected');
      expect(res.body).toHaveProperty('server.cpu.capacityCores');
      expect(res.body.activity.days).toHaveLength(14);
    }
  });
});

describe('request recording', () => {
  it('stores route patterns instead of raw URLs', async () => {
    const examId = new mongoose.Types.ObjectId().toString();
    await request(app).get(`/api/mock-board-exams/${examId}?secret=abc`); // 401 from protect
    await request(app).get('/api/does-not-exist'); // 404

    const res = await getMetrics();
    expect(res.status).toBe(200);

    const routes = res.body.requests.routes.map((r) => r.route);
    expect(routes).toContain('GET /api/mock-board-exams/:id');
    expect(routes).toContain(requestMetrics.NO_ROUTE_KEY);
    expect(JSON.stringify(res.body.requests.routes)).not.toContain(examId);
    expect(JSON.stringify(res.body.requests.routes)).not.toContain('secret');

    const examRoute = res.body.requests.routes.find((r) => r.route === 'GET /api/mock-board-exams/:id');
    expect(examRoute).toMatchObject({ method: 'GET', path: '/api/mock-board-exams/:id', count: 1, clientErrors: 1 });

    const { totals } = res.body.requests;
    expect(totals.count).toBe(2);
    expect(totals.clientErrors).toBe(2);
    expect(totals.serverErrors).toBe(0);
    expect(totals.p95Ms).not.toBeNull();

    const pointsWithTraffic = res.body.requests.series.filter((point) => point.count > 0);
    expect(pointsWithTraffic.length).toBeGreaterThan(0);
  });

  it('skips health checks and uptime pings', async () => {
    await request(app).get('/health');
    await request(app).get('/');

    const res = await getMetrics();
    expect(res.body.requests.totals.count).toBe(0);
  });

  it('adds repeated flushes of the same minute into one document', async () => {
    const now = Date.now();
    requestMetrics.record('GET /api/example', 200, 12, now);
    await requestMetrics.flush();
    requestMetrics.record('GET /api/example', 500, 40, now);
    await requestMetrics.flush();

    const docs = await RequestMetric.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].count).toBe(2);
    expect(docs[0].serverErrors).toBe(1);
    expect(docs[0].maxMs).toBe(40);
    expect(docs[0].routes['GET /api/example'].count).toBe(2);
  });

  it('counts 429 responses on their own as well as with client errors', async () => {
    requestMetrics.record('POST /api/auth/login', 429, 4);
    requestMetrics.record('POST /api/auth/login', 429, 4);
    requestMetrics.record('POST /api/auth/login', 401, 80);

    const res = await getMetrics();
    const { totals, routes, series } = res.body.requests;
    expect(totals).toMatchObject({ rateLimited: 2, clientErrors: 3 });
    expect(totals.rateLimitedRate).toBeCloseTo(2 / 3);
    expect(routes.find((r) => r.route === 'POST /api/auth/login')).toMatchObject({ count: 3, clientErrors: 3, rateLimited: 2 });
    expect(series.reduce((sum, point) => sum + point.rateLimited, 0)).toBe(2);
  });

  it('records the 429s the login limit sends', async () => {
    const { BASE_FAILED_LIMIT, resetLoginRateLimitForTests } = require('../middleware/loginIpRateLimit');
    resetLoginRateLimitForTests();
    // Unknown emails count as failed logins; the limit lets this many through, then blocks the next one
    for (let i = 0; i <= BASE_FAILED_LIMIT; i += 1) {
      await request(app).post('/api/auth/login').send({ email: `nobody-${i}@example.com`, password: 'x' });
    }
    resetLoginRateLimitForTests();

    const res = await getMetrics();
    const loginRoute = res.body.requests.routes.find((r) => r.route === 'POST /api/auth/login');
    expect(loginRoute.rateLimited).toBe(1);
  });

  it('keeps route keys containing dots readable', async () => {
    requestMetrics.record('GET /api/files/:name.pdf', 200, 5);
    const res = await getMetrics();
    expect(res.body.requests.routes.map((r) => r.route)).toContain('GET /api/files/:name.pdf');
  });

  it('leaves out minutes older than the selected range', async () => {
    requestMetrics.record('GET /api/old', 200, 5, Date.now() - 3 * 60 * 60 * 1000);
    requestMetrics.record('GET /api/new', 200, 5);

    const res = await getMetrics('1h');
    const routes = res.body.requests.routes.map((r) => r.route);
    expect(routes).toEqual(['GET /api/new']);

    const day = await getMetrics('24h');
    expect(day.body.requests.routes.map((r) => r.route)).toEqual(
      expect.arrayContaining(['GET /api/old', 'GET /api/new'])
    );
  });
});

describe('CPU use', () => {
  it('adds CPU time to the current minute and reports the latest reading', async () => {
    requestMetrics.sampleCpu();
    const busyUntil = Date.now() + 60;
    while (Date.now() < busyUntil) {
      // keep the CPU busy so there is something to measure
    }
    requestMetrics.sampleCpu();

    const res = await getMetrics();
    const readings = res.body.requests.series.filter((point) => point.cpuPct !== null);
    expect(readings).toHaveLength(1);
    expect(readings[0].cpuPct).toBeGreaterThan(0);
    expect(readings[0].cpuPeakPct).toBeGreaterThan(0);
    expect(res.body.requests.totals.cpuAvgPct).toBeGreaterThan(0);
    expect(res.body.requests.totals.cpuPeakPct).toBeGreaterThan(0);
    expect(res.body.server.cpu.percent).toBeGreaterThan(0);
  });

  it('reports no reading for minutes without one', async () => {
    requestMetrics.record('GET /api/example', 200, 5);
    const res = await getMetrics();
    expect(res.body.requests.series.every((point) => point.cpuPct === null)).toBe(true);
    expect(res.body.requests.totals.cpuAvgPct).toBeNull();
    expect(res.body.server.cpu.percent).toBeNull();
  });
});

describe('active users and activity', () => {
  it('counts users seen in the last five minutes by role', async () => {
    await createUserAndToken({ role: 'student', email: 'active-student@example.com', last_active_at: new Date() });
    await createUserAndToken({
      role: 'student',
      email: 'idle-student@example.com',
      last_active_at: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const res = await getMetrics();
    expect(res.body.users.now).toBe(1);
    expect(res.body.users.byRole).toEqual({ student: 1 });
    expect(res.body.users.last24h).toBe(2);
  });

  it('counts audit log entries per day', async () => {
    await AuditLog.create({
      admin: adminUser._id,
      action: 'user_created',
      targetType: 'User',
      targetId: adminUser._id,
    });

    const res = await getMetrics();
    const { adminActions, examAttempts } = res.body.activity;
    expect(adminActions[adminActions.length - 1]).toBe(1);
    expect(examAttempts.student.every((n) => n === 0)).toBe(true);
  });
});

describe('percentileFromHist', () => {
  const { percentileFromHist } = requestMetrics;

  it('returns null with no samples', () => {
    expect(percentileFromHist({}, 0.95, 0)).toBeNull();
  });

  it('interpolates inside the bucket the percentile falls in', () => {
    // 100 samples between 10ms and 25ms
    expect(percentileFromHist({ b1: 100 }, 0.5, 25)).toBe(17.5);
  });

  it('never reports more than the slowest request', () => {
    expect(percentileFromHist({ b4: 10 }, 0.99, 120)).toBe(120);
    expect(percentileFromHist({ b10: 3 }, 0.95, 15000)).toBeLessThanOrEqual(15000);
  });
});
