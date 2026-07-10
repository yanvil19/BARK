const request = require('supertest');
const app = require('../app');
const Department = require('../models/Department');
const Program = require('../models/Program');

describe('GET /api/catalog/departments', () => {
  it('should return 200 with empty array when none exist', async () => {
    const res = await request(app).get('/api/catalog/departments');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.departments)).toBe(true);
    expect(res.body.departments.length).toBe(0);
  });

  it('should return 200 with departments after seeding', async () => {
    await Department.create({ name: 'Engineering', code: 'ENG' });
    const res = await request(app).get('/api/catalog/departments');
    expect(res.status).toBe(200);
    expect(res.body.departments.length).toBeGreaterThan(0);
  });
});

describe('GET /api/catalog/programs', () => {
  it('should return 200 with empty array when none exist', async () => {
    const res = await request(app).get('/api/catalog/programs');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.programs)).toBe(true);
  });

  it('should return programs after seeding', async () => {
    const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
    await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
    const res = await request(app).get('/api/catalog/programs');
    expect(res.status).toBe(200);
    expect(res.body.programs.length).toBeGreaterThan(0);
  });

  it('should filter programs by departmentId', async () => {
    const dept1 = await Department.create({ name: 'Engineering', code: 'ENG' });
    const dept2 = await Department.create({ name: 'Business', code: 'BUS' });
    await Program.create({ name: 'Computer Science', code: 'CS', department: dept1._id });
    await Program.create({ name: 'Accounting', code: 'ACC', department: dept2._id });

    const res = await request(app).get(`/api/catalog/programs?departmentId=${dept1._id}`);
    expect(res.status).toBe(200);
    expect(res.body.programs.every(p => p.department === dept1._id.toString() || p.department?._id === dept1._id.toString())).toBe(true);
  });
});
