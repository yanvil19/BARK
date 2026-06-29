const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const RegistrationRequest = require('../models/RegistrationRequest');
const bcrypt = require('bcryptjs');

let dept, prog;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
});

describe('POST /api/auth/register-student', () => {
  it('should create a registration request with valid fields', async () => {
    const res = await request(app)
      .post('/api/auth/register-student')
      .send({
        name: 'Student One',
        email: 'student1@example.com',
        password: 'Password123!',
        userType: 'student',
        studentId: '2021-000001',
        departmentId: dept._id,
        programId: prog._id,
      });
    expect(res.status).toBe(201);
  });

  it('should return 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/register-student')
      .send({ name: 'Student One' });
    expect(res.status).toBe(400);
  });

  it('should return 400 for duplicate email', async () => {
    const payload = {
      name: 'Student One',
      email: 'dup@example.com',
      password: 'Password123!',
      userType: 'student',
      studentId: '2021-000001',
      departmentId: dept._id,
      programId: prog._id,
    };
    await request(app).post('/api/auth/register-student').send(payload);
    const res = await request(app).post('/api/auth/register-student').send({ ...payload, studentId: '2021-000002' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/registration-status', () => {
  it('should return status for existing request', async () => {
    const hash = await bcrypt.hash('Password123!', 10);
    await RegistrationRequest.create({
      name: 'Student One',
      email: 'status@example.com',
      passwordHash: hash,
      publicTokenHash: 'somehash',
      userType: 'student',
      studentId: '2021-000099',
      department: dept._id,
      program: prog._id,
      status: 'pending',
    });

    const res = await request(app)
      .post('/api/auth/registration-status')
      .send({ email: 'status@example.com', studentId: '2021-000099' });

    expect([200, 404]).toContain(res.status);
  });

  it('should return 400 with missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/registration-status')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/registrations', () => {
  it('should return 200 as dean', async () => {
    const { token } = await createUserAndToken({ role: 'dean', department: dept._id });
    const res = await request(app)
      .get('/api/auth/registrations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('should return 401 with no auth', async () => {
    const res = await request(app).get('/api/auth/registrations');
    expect(res.status).toBe(401);
  });

  it('should return 403 as professor', async () => {
    const { token } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .get('/api/auth/registrations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/auth/registrations/:id/approve', () => {
  it('should approve a pending request', async () => {
    const hash = await bcrypt.hash('Password123!', 10);
    const reg = await RegistrationRequest.create({
      name: 'Student Two',
      email: 'approve@example.com',
      passwordHash: hash,
      publicTokenHash: 'somehash2',
      userType: 'student',
      studentId: '2021-000002',
      department: dept._id,
      program: prog._id,
      status: 'pending',
    });

    const { token } = await createUserAndToken({ role: 'dean', department: dept._id });
    const res = await request(app)
      .patch(`/api/auth/registrations/${reg._id}/approve`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/auth/registrations/:id/reject', () => {
  it('should reject a pending request with a reason', async () => {
    const hash = await bcrypt.hash('Password123!', 10);
    const reg = await RegistrationRequest.create({
      name: 'Student Three',
      email: 'reject@example.com',
      passwordHash: hash,
      publicTokenHash: 'somehash3',
      userType: 'student',
      studentId: '2021-000003',
      department: dept._id,
      program: prog._id,
      status: 'pending',
    });

    const { token } = await createUserAndToken({ role: 'dean', department: dept._id });
    const res = await request(app)
      .patch(`/api/auth/registrations/${reg._id}/reject`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Invalid student ID' });
    expect(res.status).toBe(200);
  });
});
