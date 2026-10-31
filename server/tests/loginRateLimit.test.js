const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../app');
const User = require('../models/User');
const {
  FAILED_LIMIT,
  UNSUCCESSFUL_LIMIT,
  resetLoginRateLimitForTests,
} = require('../middleware/loginIpRateLimit');

// Every request from supertest comes from the same address, like students on one campus network
const PASSWORD = 'Password123!';
let passwordHash;

beforeAll(async () => {
  // A low cost keeps hundreds of logins fast; bcrypt reads the cost from the hash
  passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
  resetLoginRateLimitForTests();
});

async function createUsers(count, prefix) {
  const users = Array.from({ length: count }, (_, i) => ({
    name: `Login Test ${i}`,
    email: `${prefix}-${i}@example.com`,
    password: passwordHash,
    role: 'professor',
    isVerified: true,
  }));
  // insertMany skips the pre-save hook, so the password stays the hash above
  await User.insertMany(users);
  return users.map((user) => user.email);
}

function login(email, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

describe('POST /api/auth/login limit per network', () => {
  it('lets 200 people on one network sign in at the same time', async () => {
    const emails = await createUsers(200, 'crowd');
    const responses = await Promise.all(emails.map((email) => login(email)));
    expect(responses.filter((res) => res.status !== 200)).toEqual([]);

    // Successful logins don't use up the allowance
    const again = await login(emails[0]);
    expect(again.status).toBe(200);
  });

  it('blocks a network after too many wrong passwords, even for a correct one', async () => {
    // One wrong password per account, so no single account gets locked
    const emails = await createUsers(FAILED_LIMIT + 1, 'spray');
    for (const email of emails.slice(0, FAILED_LIMIT)) {
      const res = await login(email, 'wrong-password');
      expect(res.status).toBe(401);
    }

    const res = await login(emails[FAILED_LIMIT]);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/failed login attempts from this network/);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('caps attempts that have not succeeded, so a burst cannot all get through', async () => {
    const [email] = await createUsers(1, 'burst');
    for (let i = 0; i < UNSUCCESSFUL_LIMIT; i += 1) {
      const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email', password: 'x' });
      expect(res.status).toBe(400);
    }

    const res = await login(email);
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/signing in from this network right now/);
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
