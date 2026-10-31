const { EventEmitter } = require('node:events');
const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../app');
const User = require('../models/User');
const { createUserAndToken } = require('./helpers');
const {
  BASE_FAILED_LIMIT,
  IN_PROGRESS_LIMIT,
  loginIpRateLimiter,
  resetLoginRateLimitForTests,
} = require('../middleware/loginIpRateLimit');
const {
  PER_EMAIL_LIMIT,
  PER_IP_LIMIT,
  resetForgotPasswordLimitsForTests,
} = require('../middleware/forgotPasswordRateLimit');

// Every request from supertest comes from the same address, like students in one computer lab
const PASSWORD = 'Password123!';
let passwordHash;

beforeAll(async () => {
  // A low cost keeps hundreds of logins fast; bcrypt reads the cost from the hash
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  resetLoginRateLimitForTests();
  resetForgotPasswordLimitsForTests();
});

async function createUsers(count, prefix, overrides = {}) {
  const users = Array.from({ length: count }, (_, i) => ({
    name: `Login Test ${i}`,
    email: `${prefix}-${i}@example.com`,
    password: passwordHash,
    role: 'professor',
    isVerified: true,
    ...overrides,
  }));
  // insertMany skips the pre-save hook, so the password stays the hash above
  const docs = await User.insertMany(users);
  return docs.map((user) => user.email);
}

function login(email, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

async function failOnce(emails) {
  for (const email of emails) {
    const res = await login(email, 'wrong-password');
    expect(res.status).toBe(401);
  }
}

describe('POST /api/auth/login limit per network', () => {
  it('lets 200 people on one network sign in at the same time', async () => {
    const emails = await createUsers(200, 'crowd');
    const responses = await Promise.all(emails.map((email) => login(email)));
    expect(responses.filter((res) => res.status !== 200)).toEqual([]);

    const again = await login(emails[0]);
    expect(again.status).toBe(200);
  });

  it('blocks a network after too many wrong passwords, even for a correct one', async () => {
    // One wrong password per account, so no single account gets locked
    const emails = await createUsers(BASE_FAILED_LIMIT + 1, 'spray');
    await failOnce(emails.slice(0, BASE_FAILED_LIMIT));

    const res = await login(emails[BASE_FAILED_LIMIT]);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/failed login attempts from this network/);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('counts unknown emails as failures too', async () => {
    const [email] = await createUsers(1, 'unknown');
    for (let i = 0; i < BASE_FAILED_LIMIT; i += 1) {
      const res = await login(`nobody-${i}@example.com`);
      expect(res.status).toBe(401);
    }
    expect((await login(email)).status).toBe(429);
  });

  it('allows one more failure for each different account that signed in from the network', async () => {
    const signedIn = await createUsers(60, 'lab-ok');
    const typos = await createUsers(100, 'lab-typo');

    for (const email of signedIn) expect((await login(email)).status).toBe(200);
    // 100 wrong passwords is past the base limit, but within 50 + 60
    await failOnce(typos);

    expect((await login(signedIn[0])).status).toBe(200);
    expect((await login(typos[0])).status).toBe(200);
  });

  it('does not raise the allowance when the same account signs in again and again', async () => {
    const [own, ...others] = await createUsers(BASE_FAILED_LIMIT + 2, 'repeat');
    for (let i = 0; i < 20; i += 1) expect((await login(own)).status).toBe(200);

    // The allowance is the base limit plus one, for the one account that signed in
    await failOnce(others);

    const res = await login(own);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/failed login attempts from this network/);
  });

  it('frees the place of a rejected attempt as soon as it is answered', async () => {
    const [email] = await createUsers(1, 'rejected');
    for (let i = 0; i < IN_PROGRESS_LIMIT + 5; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
      expect(res.status).toBe(400);
    }

    expect((await login(email)).status).toBe(200);
  });

  it('still locks a single account after repeated wrong passwords', async () => {
    const [email] = await createUsers(1, 'guess');
    const statuses = [];
    for (let i = 0; i < 5; i += 1) statuses.push((await login(email, 'wrong-password')).status);
    expect(statuses).toEqual([401, 401, 401, 401, 429]);

    const res = await login(email);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/account is temporarily locked/);
  });
});

describe('login requests in progress per network', () => {
  // A response that stays open until the test finishes it, like a login still checking a password
  function pendingExchange(ip = '203.0.113.7') {
    const res = new EventEmitter();
    res.headers = {};
    res.setHeader = (name, value) => { res.headers[name.toLowerCase()] = value; };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return { req: { ip }, res };
  }

  function start(exchange) {
    const next = jest.fn();
    loginIpRateLimiter(exchange.req, exchange.res, next);
    return next;
  }

  it('caps requests still being checked, so a burst cannot all get through', () => {
    const open = Array.from({ length: IN_PROGRESS_LIMIT }, () => pendingExchange());
    for (const exchange of open) expect(start(exchange)).toHaveBeenCalled();

    const blocked = pendingExchange();
    expect(start(blocked)).not.toHaveBeenCalled();
    expect(blocked.res.statusCode).toBe(429);
    expect(blocked.res.body.message).toMatch(/signing in from this network right now/);
    expect(blocked.res.headers['retry-after']).toBe('10');

    // Another network is not affected
    expect(start(pendingExchange('198.51.100.9'))).toHaveBeenCalled();

    // A finished request, or one whose client went away, frees its place once
    open[0].res.emit('finish');
    open[0].res.emit('close');
    expect(start(pendingExchange())).toHaveBeenCalled();
    expect(start(pendingExchange())).not.toHaveBeenCalled();
    open[1].res.emit('close');
    expect(start(pendingExchange())).toHaveBeenCalled();
  });
});

describe('POST /api/auth/forgot-password limits', () => {
  function forgot(email) {
    return request(app).post('/api/auth/forgot-password').send({ email });
  }

  it('limits each email on its own, so others on the same network can still ask', async () => {
    for (let i = 0; i < PER_EMAIL_LIMIT; i += 1) expect((await forgot('Student@Example.com')).status).toBe(200);

    // Matched after lowercasing and trimming, like the lookup itself
    const blocked = await forgot(' student@example.com ');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/this email/);

    expect((await forgot('classmate@example.com')).status).toBe(200);
  });

  it('caps one network across many emails', async () => {
    for (let i = 0; i < PER_IP_LIMIT; i += 1) expect((await forgot(`person-${i}@example.com`)).status).toBe(200);

    const blocked = await forgot('one-more@example.com');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toMatch(/this network/);
  });
});

describe('PATCH /api/auth/users/:id/unlock', () => {
  const lockedFields = {
    loginFailedAttempts: 5,
    loginLockedUntil: new Date(Date.now() + 15 * 60 * 1000),
    loginLastFailedAt: new Date(),
  };
  const deptA = '0000000000000000000000a1';
  const deptB = '0000000000000000000000b2';
  const progA = '0000000000000000000000a3';
  const progB = '0000000000000000000000b4';

  async function lockedStudent(email, overrides = {}) {
    const [created] = await createUsers(1, email, {
      role: 'student',
      department: deptA,
      program: progA,
      ...lockedFields,
      ...overrides,
    });
    return User.findOne({ email: created });
  }

  function unlock(userId, token) {
    return request(app).patch(`/api/auth/users/${userId}/unlock`).set('Cookie', `nu_board_token=${token}`);
  }

  it('lets the super admin unlock an account, which can then sign in', async () => {
    const student = await lockedStudent('admin-unlock');
    expect((await login(student.email)).status).toBe(429);

    const { token } = await createUserAndToken({ role: 'super_admin', email: 'sa-unlock@example.com' });
    const res = await unlock(student._id, token);
    expect(res.status).toBe(200);

    const saved = await User.findById(student._id);
    expect(saved.loginFailedAttempts).toBe(0);
    expect(saved.loginLockedUntil).toBeNull();
    expect((await login(student.email)).status).toBe(200);
  });

  it('lets a dean unlock students in their department only', async () => {
    const { token } = await createUserAndToken({ role: 'dean', department: deptA, email: 'dean-unlock@example.com' });
    const own = await lockedStudent('dean-own');
    const other = await lockedStudent('dean-other', { department: deptB, program: progB });

    expect((await unlock(own._id, token)).status).toBe(200);
    expect((await unlock(other._id, token)).status).toBe(403);
    expect((await User.findById(other._id)).loginLockedUntil).not.toBeNull();
  });

  it('lets a program chair unlock students in their program only, and not staff', async () => {
    const { token } = await createUserAndToken({
      role: 'program_chair', department: deptA, program: progA, email: 'pc-unlock@example.com',
    });
    const own = await lockedStudent('pc-own');
    const otherProgram = await lockedStudent('pc-other', { program: progB });
    const professor = await lockedStudent('pc-prof', { role: 'professor' });

    expect((await unlock(own._id, token)).status).toBe(200);
    expect((await unlock(otherProgram._id, token)).status).toBe(403);
    expect((await unlock(professor._id, token)).status).toBe(403);
  });

  it('is not available to professors or students', async () => {
    const student = await lockedStudent('no-access');
    const { token } = await createUserAndToken({ role: 'professor', email: 'prof-unlock@example.com' });
    expect((await unlock(student._id, token)).status).toBe(403);
  });

  it('returns 404 for an unknown or malformed id', async () => {
    const { token } = await createUserAndToken({ role: 'super_admin', email: 'sa-404@example.com' });
    expect((await unlock('000000000000000000000001', token)).status).toBe(404);
    expect((await unlock('not-an-id', token)).status).toBe(404);
  });
});
