const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');

// These tests verify that admin-only routes are protected from non-admin roles
const adminRoutes = [
  { method: 'get', path: '/api/admin/catalog/departments' },
  { method: 'get', path: '/api/admin/settings' },
  { method: 'get', path: '/api/stats/program-chair/stats' },
];

describe('Admin route protection', () => {
  it('should return 401 on all admin routes when unauthenticated', async () => {
    for (const route of adminRoutes) {
      const res = await request(app)[route.method](route.path);
      expect(res.status).toBe(401);
    }
  });

  it('should return 403 on admin routes when role is student', async () => {
    const { token } = await createUserAndToken({ role: 'student' });

    for (const route of adminRoutes) {
      const res = await request(app)
        [route.method](route.path)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    }
  });

  it('should return 403 on admin routes when role is professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });

    for (const route of adminRoutes) {
      const res = await request(app)
        [route.method](route.path)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
    }
  });
});