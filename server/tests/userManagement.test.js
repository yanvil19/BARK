const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const User = require('../models/User');

let adminToken;
let adminUser;

beforeEach(async () => {
  const result = await createUserAndToken({ role: 'super_admin' });
  adminToken = result.token;
  adminUser = result.user;
});

describe('GET /api/auth/users', () => {
  it('should return 200 with user list as super_admin', async () => {
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/auth/users');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/auth/users/:id', () => {
  it('should update a user name', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/auth/users/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/auth/users/:id/email-toggle', () => {
  it('should toggle email preference', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/email-toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiveEmails: false });
    expect(res.status).toBe(200);
  });

  it('should return 400 if receiveEmails is not boolean', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/email-toggle`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ receiveEmails: 'yes' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/users/:id/deactivate', () => {
  it('should deactivate another user', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if deactivating self', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${adminUser._id}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/users/:id/activate', () => {
  it('should activate a deactivated user', async () => {
    const { user } = await createUserAndToken({ role: 'professor', isActive: false });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/auth/users/:id', () => {
  it('should delete another user', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .delete(`/api/auth/users/${user._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if deleting self', async () => {
    const res = await request(app)
      .delete(`/api/auth/users/${adminUser._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
