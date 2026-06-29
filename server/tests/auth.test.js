const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

describe('POST /api/auth/login', () => {
  it('should return 200 and a token with valid credentials', async () => {
    const { user } = await createUserAndToken({ email: 'login@example.com', password: 'TestPassword123!' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'TestPassword123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
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
});

describe('GET /api/auth/me', () => {
  it('should return current user when authenticated', async () => {
    const { token } = await createUserAndToken({ email: 'me@example.com' });

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('email', 'me@example.com');
  });

  it('should return 401 when no token is provided', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});