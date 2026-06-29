const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');

let adminToken;

beforeEach(async () => {
  const { token } = await createUserAndToken({ role: 'super_admin' });
  adminToken = token;
});

describe('GET /api/admin/catalog/departments', () => {
  it('should return 200 as super_admin', async () => {
    const res = await request(app)
      .get('/api/admin/catalog/departments')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/admin/catalog/departments');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/admin/catalog/departments')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/catalog/departments', () => {
  it('should create a department with valid fields', async () => {
    const res = await request(app)
      .post('/api/admin/catalog/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Engineering', code: 'ENG' });
    expect(res.status).toBe(201);
    expect(res.body.department).toHaveProperty('name', 'Engineering');
  });

  it('should return 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/admin/catalog/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Engineering' }); // Missing code
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/admin/catalog/departments/:id', () => {
  it('should update a department', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const res = await request(app)
      .patch(`/api/admin/catalog/departments/${dept._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Engineering Updated' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/admin/catalog/departments/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/catalog/departments/:id', () => {
  it('should delete a department with no programs', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const res = await request(app)
      .delete(`/api/admin/catalog/departments/${dept._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if programs exist under it', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
    const res = await request(app)
      .delete(`/api/admin/catalog/departments/${dept._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/admin/catalog/programs', () => {
  it('should return 200 as super_admin', async () => {
    const res = await request(app)
      .get('/api/admin/catalog/programs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/catalog/programs', () => {
  it('should create a program with valid dept', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const res = await request(app)
      .post('/api/admin/catalog/programs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Computer Science', code: 'CS', departmentId: dept._id });
    expect(res.status).toBe(201);
  });

  it('should return 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/admin/catalog/programs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Computer Science', code: 'CS' }); // Missing department
    expect(res.status).toBe(400);
  });

  it('should return 404 if department not found', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .post('/api/admin/catalog/programs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Computer Science', code: 'CS', departmentId: fakeId });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/admin/catalog/programs/:id', () => {
  it('should update a program', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
    const res = await request(app)
      .patch(`/api/admin/catalog/programs/${prog._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CS Updated' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/admin/catalog/programs/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/catalog/programs/:id', () => {
  it('should delete a program', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    const prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
    const res = await request(app)
      .delete(`/api/admin/catalog/programs/${prog._id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });
});
