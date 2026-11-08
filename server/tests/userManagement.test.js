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

  it('returns every account at once with all=true, newest first, with only the list fields', async () => {
    await seed();
    // More than one page's worth (the paged limit is 100)
    await User.insertMany(Array.from({ length: 120 }, (_, i) => ({
      name: `Bulk ${i}`, email: `bulk-${i}@example.com`, password: 'not-a-real-hash', isVerified: true,
      role: 'student', department: deptA, program: progA, createdAt: new Date(Date.UTC(2025, 0, 1, 0, i)),
    })));
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-all@example.com' });

    const res = await list(token, 'role=student,alumni&all=true');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(124);
    expect(res.body.users).toHaveLength(124);
    expect(names(res).slice(0, 4)).toEqual(['Fay Alumni', 'Cara Alumni', 'Ben Student', 'Ana Student']);
    expect(res.body.users[4].name).toBe('Bulk 119');
    // Still only the chair's program
    expect(names(res)).not.toContain('Eve Student');
    // The list fields, and nothing private
    const ben = res.body.users.find((user) => user.name === 'Ben Student');
    expect(ben.loginLockedUntil).toBeTruthy();
    expect(ben.password).toBeUndefined();
    expect(ben.passwordResetOTP).toBeUndefined();
  });

  it('pages as before without all=true', async () => {
    await seed();
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-paged@example.com' });

    const res = await list(token, 'role=student,alumni&page=2&limit=3');
    expect(res.body.total).toBe(4);
    expect(res.body.pages).toBe(2);
    expect(names(res)).toEqual(['Ana Student']);
  });

  it('still lets the super admin filter by any department', async () => {
    await seed();
    const res = await list(adminToken, `role=student,alumni&department=${deptB}`);
    expect(names(res)).toEqual(['Eve Student']);
  });
});

describe('GET /api/auth/users/:id/activity', () => {
  const MockBoardExam = require('../models/MockBoardExam');
  const StudentExamAttempt = require('../models/StudentExamAttempt');
  const AlumniExamAttempt = require('../models/AlumniExamAttempt');
  const mongoose = require('mongoose');

  const deptA = '0000000000000000000000c1';
  const deptB = '0000000000000000000000c2';
  const progA = '0000000000000000000000c3';
  const progB = '0000000000000000000000c4';
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

  function activity(token, id) {
    return request(app).get(`/api/auth/users/${id}/activity`).set('Cookie', `nu_board_token=${token}`);
  }

  async function learner(fields) {
    const base = { password: 'not-a-real-hash', isVerified: true, department: deptA, program: progA };
    const [user] = await User.insertMany([{ ...base, ...fields }]);
    return user;
  }

  // Written straight to the collections: these tests only need the fields the panel reads
  async function exam(name) {
    const _id = new mongoose.Types.ObjectId();
    await MockBoardExam.collection.insertOne({ _id, name });
    return _id;
  }

  it('records the sign-in time when a login succeeds', async () => {
    const { user } = await createUserAndToken({ email: 'signin-time@example.com', password: 'TestPassword123!' });
    expect(user.lastLoginAt).toBeNull();

    const before = Date.now();
    const res = await request(app).post('/api/auth/login').send({ email: 'signin-time@example.com', password: 'TestPassword123!' });
    expect(res.status).toBe(200);

    const saved = await User.findById(user._id).select('lastLoginAt');
    expect(saved.lastLoginAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('leaves the sign-in time alone when the password is wrong', async () => {
    const { user } = await createUserAndToken({ email: 'signin-wrong@example.com', password: 'TestPassword123!' });
    await request(app).post('/api/auth/login').send({ email: 'signin-wrong@example.com', password: 'Wrong123!' });

    const saved = await User.findById(user._id).select('lastLoginAt');
    expect(saved.lastLoginAt).toBeNull();
  });

  it('gives the last visit length and the latest exam a student took', async () => {
    const student = await learner({ name: 'Ana', email: 'ana-activity@example.com', role: 'student', lastLoginAt: minutesAgo(200), last_active_at: minutesAgo(115) });
    const older = await exam('Mock Board 1');
    const newer = await exam('Mock Board 2');
    await StudentExamAttempt.collection.insertMany([
      { student: student._id, exam: older, status: 'submitted', startTime: minutesAgo(3000), endTime: minutesAgo(2900) },
      { student: student._id, exam: newer, status: 'submitted', startTime: minutesAgo(180), endTime: minutesAgo(120) },
    ]);
    const { token } = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-activity@example.com' });

    const res = await activity(token, student._id);
    expect(res.status).toBe(200);
    expect(Math.round(res.body.sessionMs / 60000)).toBe(85);
    expect(res.body.online).toBe(false);
    expect(res.body.lastExam).toMatchObject({ name: 'Mock Board 2', status: 'submitted', examId: String(newer) });
  });

  it('counts someone with a recent heartbeat as online, and reads alumni attempts', async () => {
    const alumnus = await learner({ name: 'Cara', email: 'cara-activity@example.com', role: 'alumni', lastLoginAt: minutesAgo(30), last_active_at: minutesAgo(1) });
    const examId = await exam('Alumni Review');
    await AlumniExamAttempt.collection.insertOne({ alumni: alumnus._id, exam: examId, attemptNumber: 2, status: 'in_progress', startTime: minutesAgo(10) });
    const { token } = await createUserAndToken({ role: 'dean', department: deptA, email: 'dean-activity@example.com' });

    const res = await activity(token, alumnus._id);
    expect(res.status).toBe(200);
    expect(res.body.online).toBe(true);
    expect(Math.round(res.body.sessionMs / 60000)).toBe(29);
    expect(res.body.lastExam).toMatchObject({ name: 'Alumni Review', status: 'in_progress', attemptNumber: 2 });
  });

  it('has nothing to show for someone who has not signed in or taken an exam', async () => {
    const student = await learner({ name: 'New', email: 'new-activity@example.com', role: 'student' });
    const res = await activity(adminToken, student._id);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lastLoginAt: null, lastActiveAt: null, sessionMs: null, online: false, lastExam: null });
  });

  it('keeps deans and chairs to their own students and alumni', async () => {
    const outside = await learner({ name: 'Eve', email: 'eve-activity@example.com', role: 'student', department: deptB, program: progB });
    const otherProgram = await learner({ name: 'Dan', email: 'dan-activity@example.com', role: 'student', program: progB });
    const staff = await learner({ name: 'Prof', email: 'prof-activity@example.com', role: 'professor' });
    const dean = await createUserAndToken({ role: 'dean', department: deptA, email: 'dean-scope@example.com' });
    const chair = await createUserAndToken({ role: 'program_chair', department: deptA, program: progA, email: 'chair-scope@example.com' });

    expect((await activity(dean.token, outside._id)).status).toBe(403);
    expect((await activity(dean.token, staff._id)).status).toBe(403);
    expect((await activity(dean.token, otherProgram._id)).status).toBe(200);
    expect((await activity(chair.token, otherProgram._id)).status).toBe(403);
    expect((await activity(adminToken, outside._id)).status).toBe(200);
  });

  it('is closed to other roles and answers 404 for an unknown id', async () => {
    const student = await learner({ name: 'Ana', email: 'ana-closed@example.com', role: 'student' });
    const professor = await createUserAndToken({ role: 'professor', email: 'prof-closed@example.com' });

    expect((await activity(professor.token, student._id)).status).toBe(403);
    expect((await activity(adminToken, 'not-an-id')).status).toBe(404);
    expect((await activity(adminToken, new mongoose.Types.ObjectId())).status).toBe(404);
  });
});
