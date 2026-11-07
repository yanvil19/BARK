const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');

let prog, otherProg, tag, prof, profCookie, chairCookie;

const answers = () => [
  { text: 'Alpha', isCorrect: true },
  { text: 'Bravo', isCorrect: false },
  { text: 'Charlie', isCorrect: false },
  { text: 'Delta', isCorrect: false },
];

const make = (overrides = {}) => Question.create({
  description: 'Which is correct?',
  rationalization: 'Because it is.',
  answers: answers(),
  program: prog._id,
  createdBy: prof._id,
  tag: tag._id,
  state: 'draft',
  ...overrides,
});

const body = (overrides = {}) => ({
  description: 'Which is correct?',
  rationalization: 'Because it is.',
  answers: answers(),
  tagId: tag._id,
  ...overrides,
});

const list = (query = '') => request(app).get(`/api/questions${query}`).set('Cookie', profCookie);

beforeEach(async () => {
  const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  otherProg = await Program.create({ name: 'Civil Engineering', code: 'CE', department: dept._id });
  ({ user: prof, cookieHeader: profCookie } = await createUserAndToken({
    role: 'professor', email: 'prof@example.com', name: 'Prof Santos', department: dept._id, program: prog._id,
  }));
  ({ cookieHeader: chairCookie } = await createUserAndToken({
    role: 'program_chair', email: 'chair@example.com', name: 'Chair Reyes', department: dept._id, program: prog._id,
  }));
  tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: prof._id });
});

describe('the list My Questions loads', () => {
  it('returns every question, so counts, search and filters cover all of them', async () => {
    for (let i = 0; i < 25; i++) await make({ description: `Question ${i}` });

    const res = await list();

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(25);
  });

  it('returns a set whole, however many other questions there are', async () => {
    for (let i = 0; i < 12; i++) await make();
    for (let i = 0; i < 3; i++) await make({ groupId: 'SET1', groupOrder: i, groupContext: 'Passage' });

    const res = await list();

    expect(res.body.questions.filter((q) => q.groupId === 'SET1')).toHaveLength(3);
  });

  it('holds only the user\'s own questions', async () => {
    const { user: other } = await createUserAndToken({ role: 'professor', email: 'other@example.com', program: prog._id });
    await make({ description: 'Mine' });
    await make({ description: 'Not mine', createdBy: other._id });

    const res = await list();

    expect(res.body.questions.map((q) => q.description)).toEqual(['Mine']);
  });

  it('narrows to one program for a dean\'s filter', async () => {
    await make({ description: 'In CS' });
    await make({ description: 'In CE', program: otherProg._id });

    const res = await list(`?programId=${otherProg._id}`);

    expect(res.body.questions.map((q) => q.description)).toEqual(['In CE']);
  });

  it('shows the subject, program and decrypted text', async () => {
    await make({ description: 'Readable' });

    const [question] = (await list()).body.questions;

    expect(question.description).toBe('Readable');
    expect(question.tag.name).toBe('Algebra');
    expect(question.program.name).toBe('Computer Science');
  });
});

describe('who last edited, as the creator sees it', () => {
  it('names a reviewer who edited the question', async () => {
    const question = await make({ state: 'pending_chair', submittedAt: new Date() });
    const edited = await request(app)
      .patch(`/api/questions/${question._id}/review-edit`)
      .set('Cookie', chairCookie)
      .send(body({ description: 'Reworded by the reviewer' }));
    expect(edited.status).toBe(200);

    const [listed] = (await list()).body.questions;

    expect(listed.lastEditedBy.name).toBe('Chair Reyes');
    expect(listed.lastEditedAt).toBeTruthy();
  });

  it('is empty on a question nobody has edited', async () => {
    await make();

    const [listed] = (await list()).body.questions;

    expect(listed.lastEditedBy).toBeFalsy();
    expect(listed.lastEditedAt).toBeFalsy();
  });

  it('comes back with the creator\'s own save, so the panel needs no reload', async () => {
    const question = await make();

    const res = await request(app)
      .patch(`/api/questions/${question._id}`)
      .set('Cookie', profCookie)
      .send(body({ description: 'Changed' }));

    expect(res.status).toBe(200);
    expect(res.body.question.lastEditedBy.name).toBe('Prof Santos');
  });

  it('comes back with a saved set too', async () => {
    const members = [];
    for (let i = 0; i < 2; i++) members.push(await make({ description: `Member ${i}`, groupId: 'SET1', groupOrder: i, groupContext: 'Passage' }));

    const res = await request(app)
      .put('/api/questions/group/SET1')
      .set('Cookie', profCookie)
      .send({
        questions: members.map((q, i) => body({ _id: q._id, description: `Changed ${i}`, images: [] })),
        groupContext: 'Passage',
        groupContextImages: [],
      });

    expect(res.status).toBe(200);
    expect(res.body.questions.every((q) => q.lastEditedBy?.name === 'Prof Santos')).toBe(true);
  });

  it('comes back when a question is submitted', async () => {
    const question = await make({ lastEditedBy: prof._id, lastEditedAt: new Date() });

    const res = await request(app).post(`/api/questions/${question._id}/submit`).set('Cookie', profCookie);

    expect(res.status).toBe(200);
    expect(res.body.question.lastEditedBy.name).toBe('Prof Santos');
  });
});

describe('reading a reviewer\'s feedback', () => {
  it('marks it read without moving the question up the list', async () => {
    const question = await make({ state: 'returned', revisionNote: 'Fix the wording' });
    const stamp = new Date('2026-01-01T00:00:00Z');
    await Question.collection.updateOne({ _id: question._id }, { $set: { updatedAt: stamp } });

    const res = await request(app).patch(`/api/questions/${question._id}/mark-read`).set('Cookie', profCookie);

    expect(res.status).toBe(200);
    const saved = await Question.findById(question._id);
    expect(saved.feedbackRead).toBe(true);
    expect(saved.updatedAt.getTime()).toBe(stamp.getTime());
  });
});
