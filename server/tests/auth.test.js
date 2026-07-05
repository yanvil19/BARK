const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

describe('POST /api/auth/login', () => {
  it('should return 200 and set an httpOnly cookie with valid credentials', async () => {
    const { user } = await createUserAndToken({ email: 'login@example.com', password: 'TestPassword123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'TestPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).not.toHaveProperty('token');
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie.some((c) => c.startsWith('nu_board_token='))).toBe(true);
    expect(setCookie.some((c) => c.includes('HttpOnly'))).toBe(true);
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