const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

describe('POST /api/auth/login', () => {
  it('should return 200, return a temporary demo token, and set an httpOnly cookie with valid credentials', async () => {
    const { user } = await createUserAndToken({ email: 'login@example.com', password: 'TestPassword123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'TestPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('token');
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith('nu_board_token='))).toBe(true);
    expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
    expect(setCookie.some((c) => c.includes('Secure'))).toBe(true);
    expect(setCookie.some((c) => c.includes('SameSite=None'))).toBe(true);
  });

  it('should return 401 with wrong password', async () => {
    await createUserAndToken({ email: 'wrong@example.com', password: 'TestPassword123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
  });

  it('should return 400 if email or password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nopassword@example.com' });

    expect(res.status).toBe(400);
  });

  it('should return 403 if account is deactivated', async () => {
    await createUserAndToken({ email: 'deactivated@example.com', password: 'TestPassword123!', isActive: false });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'deactivated@example.com', password: 'TestPassword123!' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('deactivated');
  });
});

describe('GET /api/auth/me', () => {
  it('should return current user when authenticated', async () => {
    const { token } = await createUserAndToken({ email: 'me@example.com' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nu_board_token=${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'me@example.com');
  });

  it('should return current user when authenticated with a temporary demo bearer token', async () => {
    const { token } = await createUserAndToken({ email: 'me-bearer@example.com' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'me-bearer@example.com');
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 when the user account is deactivated', async () => {
    const { token } = await createUserAndToken({ email: 'me-deactivated@example.com', isActive: false });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nu_board_token=${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('deactivated');
  });
});

describe('PATCH /api/auth/me/board-exam-countdown', () => {
  const inDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  it('lets a student set and clear their board exam countdown', async () => {
    const { token } = await createUserAndToken({ role: 'student', email: 'countdown@example.com' });
    const targetAt = inDays(30);

    const setRes = await request(app)
      .patch('/api/auth/me/board-exam-countdown')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ label: '  Criminology Licensure Exam  ', targetAt });
    expect(setRes.status).toBe(200);
    expect(setRes.body.boardExamCountdown).toEqual({ label: 'Criminology Licensure Exam', targetAt: targetAt.toISOString() });

    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `nu_board_token=${token}`);
    expect(meRes.body.boardExamCountdown.targetAt).toBe(targetAt.toISOString());

    const clearRes = await request(app)
      .patch('/api/auth/me/board-exam-countdown')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ label: 'Ignored', targetAt: null });
    expect(clearRes.status).toBe(200);
    expect(clearRes.body.boardExamCountdown).toEqual({ label: '', targetAt: null });
  });

  it('rejects a date that has already passed', async () => {
    const { token } = await createUserAndToken({ role: 'alumni', email: 'countdown-past@example.com' });

    const res = await request(app)
      .patch('/api/auth/me/board-exam-countdown')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ label: 'Old exam', targetAt: inDays(-1) });
    expect(res.status).toBe(400);
  });

  it('is only available to students and alumni', async () => {
    const { token } = await createUserAndToken({ role: 'professor', email: 'countdown-prof@example.com' });

    const res = await request(app)
      .patch('/api/auth/me/board-exam-countdown')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ targetAt: inDays(30) });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('should clear the auth cookie with matching cross-site cookie options', async () => {
    const res = await request(app).post('/api/auth/logout');

    expect(res.status).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith('nu_board_token='))).toBe(true);
    expect(setCookie.some((c) => c.includes('Max-Age=0'))).toBe(true);
    expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
    expect(setCookie.some((c) => c.includes('Secure'))).toBe(true);
    expect(setCookie.some((c) => c.includes('SameSite=None'))).toBe(true);
  });
});
