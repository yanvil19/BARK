const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

let adminToken;

beforeEach(async () => {
  const { token } = await createUserAndToken({ role: 'super_admin' });
  adminToken = token;
});

describe('GET /api/admin/settings', () => {
  it('should return 200 with settings as super_admin', async () => {
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.settings).toHaveProperty('emailCooldownDays');
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/admin/settings');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/admin/settings')
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/settings', () => {
  it('should update emailCooldownDays', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `nu_board_token=${adminToken}`)
      .send({ emailCooldownDays: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('emailCooldownDays', 5);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app)
      .patch('/api/admin/settings')
      .send({ emailCooldownDays: 5 });
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch('/api/admin/settings')
      .set('Cookie', `nu_board_token=${token}`)
      .send({ emailCooldownDays: 5 });
    expect(res.status).toBe(403);
  });
});
