const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');

let prog, prof, profCookie, tagA, tagB, otherProgramTag;

const fullAnswers = () => [
  { text: 'Alpha', isCorrect: true },
  { text: 'Bravo', isCorrect: false },
  { text: 'Charlie', isCorrect: false },
  { text: 'Delta', isCorrect: false },
];

const member = (tagId, overrides = {}) => ({
  description: 'Based on the passage, which is correct?',
  rationalization: 'Because the passage says so.',
  answers: fullAnswers(),
  tagId,
  ...overrides,
});

beforeEach(async () => {
  const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const otherProg = await Program.create({ name: 'Information Technology', code: 'IT', department: dept._id });

  ({ user: prof, cookieHeader: profCookie } = await createUserAndToken({
    role: 'professor', department: dept._id, program: prog._id,
  }));

  tagA = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: prof._id });
  tagB = await Tag.create({ name: 'Geometry', program: prog._id, createdBy: prof._id });
  otherProgramTag = await Tag.create({ name: 'Networking', program: otherProg._id, createdBy: prof._id });
});

describe('question groups have one subject', () => {
  it('rejects creating a group whose questions have different subjects', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member(tagB._id)], groupContext: 'Passage' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('All questions in a group must have the same subject');
    expect(await Question.countDocuments()).toBe(0);
  });

  it('rejects a group where only some questions have a subject', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member('')] });

    expect(res.status).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('creates a group when every question has the same subject', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member(tagA._id), member(tagA._id)] });

    expect(res.status).toBe(201);
    const saved = await Question.find({ groupId: res.body.groupId });
    expect(saved).toHaveLength(3);
    expect(saved.every((q) => String(q.tag) === String(tagA._id))).toBe(true);
  });

  it('allows a draft group with no subject yet', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(''), member('')] });

    expect(res.status).toBe(201);
  });

  it('rejects a subject from another program', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(otherProgramTag._id), member(otherProgramTag._id)] });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Subject does not belong to this program');
  });

  it('updates the subject of the whole group, and rejects mixed subjects', async () => {
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member(tagA._id)] });
    const [first, second] = created.body.questions;

    const mixed = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id, { _id: first._id }), member(tagB._id, { _id: second._id })] });
    expect(mixed.status).toBe(400);
    expect(mixed.body.message).toBe('All questions in a group must have the same subject');

    const moved = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({ questions: [member(tagB._id, { _id: first._id }), member(tagB._id, { _id: second._id })] });
    expect(moved.status).toBe(200);
    const saved = await Question.find({ groupId: created.body.groupId });
    expect(saved.every((q) => String(q.tag) === String(tagB._id))).toBe(true);
  });

  it('keeps a subject that was deactivated after the group was saved', async () => {
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member(tagA._id)] });
    await Tag.updateOne({ _id: tagA._id }, { isActive: false });
    const [first, second] = created.body.questions;

    const res = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id, { _id: first._id, description: 'Edited' }), member(tagA._id, { _id: second._id })] });
    expect(res.status).toBe(200);
  });

  it('will not submit a group saved earlier with mixed subjects', async () => {
    const shared = { rationalization: 'Because.', program: prog._id, createdBy: prof._id, state: 'draft', groupId: 'legacy-group', answers: fullAnswers() };
    await Question.create({ ...shared, description: 'Part one', tag: tagA._id, groupOrder: 0 });
    await Question.create({ ...shared, description: 'Part two', tag: tagB._id, groupOrder: 1 });

    const res = await request(app).post('/api/questions/group/legacy-group/submit').set('Cookie', profCookie);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/same subject/);
    const states = (await Question.find({ groupId: 'legacy-group' })).map((q) => q.state);
    expect(states).toEqual(['draft', 'draft']);
  });

  it('will not change the subject of one grouped question on its own', async () => {
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({ questions: [member(tagA._id), member(tagA._id)] });
    const questionId = created.body.questions[0]._id;

    const changed = await request(app)
      .patch(`/api/questions/${questionId}`)
      .set('Cookie', profCookie)
      .send({ tagId: tagB._id });
    expect(changed.status).toBe(400);
    expect(changed.body.message).toMatch(/whole group/);

    const unchanged = await request(app)
      .patch(`/api/questions/${questionId}`)
      .set('Cookie', profCookie)
      .send({ tagId: tagA._id, description: 'Edited text' });
    expect(unchanged.status).toBe(200);
  });

  it('encrypts groupContext in the database and decrypts it when fetched', async () => {
    const rawPassage = 'A 45-year-old patient presents with acute chest pain.';
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({
        questions: [member(tagA._id), member(tagA._id)],
        groupContext: rawPassage,
      });

    expect(created.status).toBe(201);
    expect(created.body.questions[0].groupContext).toBe(rawPassage);
    expect(created.body.questions[1].groupContext).toBe(rawPassage);

    // Verify in MongoDB: raw groupContext is encrypted (not plain text)
    const rawDocs = await Question.find({ groupId: created.body.groupId }).lean();
    expect(rawDocs).toHaveLength(2);
    rawDocs.forEach((doc) => {
      expect(doc.groupContext).not.toBe(rawPassage);
      expect(typeof doc.groupContext).toBe('string');
      // AES-128-GCM base64 format (IV + authTag + ciphertext)
      expect(doc.groupContext).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    // Verify GET /api/questions/group/:groupId decrypts the passage
    const fetched = await request(app)
      .get(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie);

    expect(fetched.status).toBe(200);
    expect(fetched.body.questions[0].groupContext).toBe(rawPassage);
    expect(fetched.body.questions[1].groupContext).toBe(rawPassage);

    // Verify PUT /api/questions/group/:groupId re-encrypts updated passage
    const updatedPassage = 'Updated clinical case study description.';
    const [first, second] = created.body.questions;
    const updated = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({
        questions: [
          member(tagA._id, { _id: first._id }),
          member(tagA._id, { _id: second._id }),
        ],
        groupContext: updatedPassage,
      });

    expect(updated.status).toBe(200);
    expect(updated.body.questions[0].groupContext).toBe(updatedPassage);

    const updatedRawDocs = await Question.find({ groupId: created.body.groupId }).lean();
    updatedRawDocs.forEach((doc) => {
      expect(doc.groupContext).not.toBe(updatedPassage);
      expect(doc.groupContext).not.toBe(rawDocs[0].groupContext); // new IV/ciphertext
      expect(doc.groupContext).toMatch(/^[A-Za-z0-9+/=]+$/);
    });
  });
});

