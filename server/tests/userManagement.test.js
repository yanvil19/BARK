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
      .set('Cookie', `nu_board_token=${adminToken}`);
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
      .set('Cookie', `nu_board_token=${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/auth/users/:id', () => {
  it('should update a user name', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}`)
      .set('Cookie', `nu_board_token=${adminToken}`)
      .send({ name: 'Updated Name' });
    expect(res.status).toBe(200);
  });

  it('should return 404 for unknown ID', async () => {
    const fakeId = '000000000000000000000001';
    const res = await request(app)
      .patch(`/api/auth/users/${fakeId}`)
      .set('Cookie', `nu_board_token=${adminToken}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/auth/users/:id/email-toggle', () => {
  it('should toggle email preference', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/email-toggle`)
      .set('Cookie', `nu_board_token=${adminToken}`)
      .send({ receiveEmails: false });
    expect(res.status).toBe(200);
  });

  it('should return 400 if receiveEmails is not boolean', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/email-toggle`)
      .set('Cookie', `nu_board_token=${adminToken}`)
      .send({ receiveEmails: 'yes' });
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/users/:id/deactivate', () => {
  it('should deactivate another user', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/deactivate`)
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if deactivating self', async () => {
    const res = await request(app)
      .patch(`/api/auth/users/${adminUser._id}/deactivate`)
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/auth/users/:id/activate', () => {
  it('should activate a deactivated user', async () => {
    const { user } = await createUserAndToken({ role: 'professor', isActive: false });
    const res = await request(app)
      .patch(`/api/auth/users/${user._id}/activate`)
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/auth/users/:id', () => {
  it('should delete another user', async () => {
    const { user } = await createUserAndToken({ role: 'professor' });
    const res = await request(app)
      .delete(`/api/auth/users/${user._id}`)
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('should return 400 if deleting self', async () => {
    const res = await request(app)
      .delete(`/api/auth/users/${adminUser._id}`)
      .set('Cookie', `nu_board_token=${adminToken}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/users for the registration list', () => {
  const deptA = '0000000000000000000000a1';
  const deptB = '0000000000000000000000b2';
  const progA = '0000000000000000000000a3';
  const progA2 = '0000000000000000000000a5';
  const progB = '0000000000000000000000b4';
  const later = () => new Date(Date.now() + 15 * 60 * 1000);

  // insertMany skips the pre-save hook, which these users don't need
  async function seed() {
    const base = { password: 'not-a-real-hash', isVerified: true };
    await User.insertMany([
      { ...base, name: 'Ana Student', email: 'ana@example.com', role: 'student', department: deptA, program: progA, createdAt: new Date('2026-01-01') },
      { ...base, name: 'Ben Student', email: 'ben@example.com', role: 'student', department: deptA, program: progA, loginLockedUntil: later(), createdAt: new Date('2026-02-01') },
      { ...base, name: 'Cara Alumni', email: 'cara@example.com', role: 'alumni', department: deptA, program: progA, createdAt: new Date('2026-03-01') },
      { ...base, name: 'Dan Student', email: 'dan@example.com', role: 'student', department: deptA, program: progA2, createdAt: new Date('2026-04-01') },
      { ...base, name: 'Eve Student', email: 'eve@example.com', role: 'student', department: deptB, program: progB, loginLockedUntil: later(), createdAt: new Date('2026-05-01') },
      // A lockout that has already run out doesn't count as locked
      { ...base, name: 'Fay Alumni', email: 'fay@example.com', role: 'alumni', department: deptA, program: progA, loginLockedUntil: new Date(Date.now() - 1000), createdAt: new Date('2026-06-01') },
    ]);
  }

  function list(token, query) {
    return request(app).get(`/api/auth/users?${query}`).set('Cookie', `nu_board_token=${token}`);
  }

  const names = (res) => res.body.users.map((user) => user.name);

  it('keeps a chair to their program, whatever program or department is asked for', async () => {
    await seed();
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-list@example.com' });

    const res = await list(token, `role=student,alumni&program=${progB}&department=${deptB}`);
    expect(res.status).toBe(200);
    expect(names(res).sort()).toEqual(['Ana Student', 'Ben Student', 'Cara Alumni', 'Fay Alumni']);
  });

  it('lets a dean narrow to a program, but not leave their department', async () => {
    await seed();
    const { token } = await createUserAndToken({ role: 'dean', department: deptA, email: 'dean-list@example.com' });

    const own = await list(token, `role=student,alumni&program=${progA2}`);
    expect(names(own)).toEqual(['Dan Student']);

    const other = await list(token, `role=student,alumni&department=${deptB}`);
    expect(names(other)).not.toContain('Eve Student');
    expect(other.body.total).toBe(5);

    const otherProgram = await list(token, `role=student,alumni&program=${progB}`);
    expect(otherProgram.body.total).toBe(0);
  });

  it('narrows by type and to locked accounts, and counts each tab', async () => {
    await seed();
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-tabs@example.com' });

    const students = await list(token, 'role=student,alumni&type=student&counts=true');
    expect(names(students).sort()).toEqual(['Ana Student', 'Ben Student']);
    // The counts ignore the type, so every tab keeps its number
    expect(students.body.counts).toEqual({ all: 4, locked: 1, student: 2, alumni: 2 });

    const locked = await list(token, 'role=student,alumni&locked=true');
    expect(names(locked)).toEqual(['Ben Student']);

    // A type outside the listed roles is ignored
    const outside = await list(token, 'role=student,alumni&type=dean');
    expect(outside.body.total).toBe(4);

    // Without counts=true there are none
    expect(locked.body.counts).toBeUndefined();
  });

  it('sorts newest first, or oldest first when asked', async () => {
    await seed();
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-sort@example.com' });

    const newest = await list(token, 'role=student,alumni');
    expect(names(newest)).toEqual(['Fay Alumni', 'Cara Alumni', 'Ben Student', 'Ana Student']);

    const oldest = await list(token, 'role=student,alumni&sort=oldest');
    expect(names(oldest)).toEqual(['Ana Student', 'Ben Student', 'Cara Alumni', 'Fay Alumni']);
  });

  it('still lets the super admin filter by any department', async () => {
    await seed();
    const res = await list(adminToken, `role=student,alumni&department=${deptB}`);
    expect(names(res)).toEqual(['Eve Student']);
  });
});
