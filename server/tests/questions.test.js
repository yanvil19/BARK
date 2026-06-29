const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

describe('GET /api/questions', () => {
  it('should return 200 for authenticated professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });

    const res = await request(app)
      .get('/api/questions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('should return 401 for unauthenticated request', async () => {
    const res = await request(app).get('/api/questions');
    expect(res.status).toBe(401);
  });
});

describe('Role-based access on /api/questions', () => {
  it('should block student from accessing questions', async () => {
    const { token } = await createUserAndToken({ role: 'student' });

    const res = await request(app)
      .get('/api/questions')
      .set('Authorization', `Bearer ${token}`);

    // Students should not have access to the question bank
    expect(res.status).toBe(403);
  });
});