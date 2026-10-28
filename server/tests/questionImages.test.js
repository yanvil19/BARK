const request = require('supertest');
const {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const AppSettings = require('../models/AppSettings');
const MockBoardExam = require('../models/MockBoardExam');
const imageService = require('../services/questionImageService');

// Small valid PNG header; the content only needs to round-trip through encryption
const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');

let r2Store;
let dept, prog, otherProg, tag;
let prof, profCookie, otherProf, otherProfCookie, chair, chairCookie;

const pastDate = (days) => { const d = new Date(); d.setDate(d.getDate() - days); return d; };
const futureDate = (days) => { const d = new Date(); d.setDate(d.getDate() + days); return d; };

// In-memory stand-in for the R2 bucket so tests never reach real storage
function mockR2() {
  r2Store = new Map();
  return jest.spyOn(imageService.r2, 'send').mockImplementation(async (command) => {
    const { Key, Body, Metadata } = command.input;
    if (command instanceof PutObjectCommand) {
      r2Store.set(Key, { Body, Metadata });
      return {};
    }
    const stored = r2Store.get(Key);
    if (command instanceof DeleteObjectCommand) {
      r2Store.delete(Key);
      return {};
    }
    if (!stored) {
      const err = new Error('NotFound');
      err.name = 'NotFound';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
    if (command instanceof HeadObjectCommand) return { Metadata: stored.Metadata };
    if (command instanceof GetObjectCommand) {
      return {
        Metadata: stored.Metadata,
        Body: (async function* body() { yield stored.Body; })(),
      };
    }
    throw new Error(`Unexpected R2 command ${command.constructor.name}`);
  });
}

async function uploadImage(cookie) {
  const res = await request(app)
    .post('/api/questions/upload-image')
    .set('Cookie', cookie)
    .attach('images', PNG_BYTES, { filename: 'figure.png', contentType: 'image/png' });
  expect(res.status).toBe(200);
  return res.body.urls[0];
}

const objectKey = (url) => `question-images/${url.split('/').pop()}`;

function fullAnswers(overrides = {}) {
  return [
    { text: 'Alpha', isCorrect: true, ...overrides },
    { text: 'Bravo', isCorrect: false },
    { text: 'Charlie', isCorrect: false },
    { text: 'Delta', isCorrect: false },
  ];
}

async function createDraft(cookie, body) {
  return request(app)
    .post('/api/questions')
    .set('Cookie', cookie)
    .send({ description: 'Which figure is correct?', rationalization: 'Because.', tagId: tag._id, ...body });
}

beforeEach(async () => {
  mockR2();

  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  otherProg = await Program.create({ name: 'Civil Engineering', code: 'CE', department: dept._id });

  ({ user: prof, cookieHeader: profCookie } = await createUserAndToken({
    role: 'professor', email: 'prof@example.com', department: dept._id, program: prog._id,
  }));
  ({ user: otherProf, cookieHeader: otherProfCookie } = await createUserAndToken({
    role: 'professor', email: 'other-prof@example.com', department: dept._id, program: prog._id,
  }));
  ({ user: chair, cookieHeader: chairCookie } = await createUserAndToken({
    role: 'program_chair', email: 'chair@example.com', department: dept._id, program: prog._id,
  }));

  tag = await Tag.create({ name: 'Subject', program: prog._id, createdBy: chair._id, isActive: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('image URL helpers', () => {
  it('maps proxy and legacy R2 URLs to the stored file name', () => {
    expect(imageService.getImageFilename('/api/questions/image/abc-123.png')).toBe('abc-123.png');
    expect(imageService.getImageFilename('https://bucket.r2.dev/question-images/old.jpg')).toBe('old.jpg');
    expect(imageService.getImageFilename('https://example.com/other/path.png')).toBeNull();
  });
});

describe('POST /api/questions/upload-image', () => {
  it('stores the image encrypted with the uploader recorded', async () => {
    const url = await uploadImage(profCookie);

    expect(url).toMatch(/^\/api\/questions\/image\/[0-9a-f-]{36}\.png$/);
    const stored = r2Store.get(objectKey(url));
    expect(stored.Metadata).toEqual({ uploadedby: String(prof._id), contenttype: 'image/png' });
    expect(Buffer.compare(stored.Body, PNG_BYTES)).not.toBe(0);
  });
});

describe('GET /api/questions/image/:key', () => {
  it('lets the uploader view an unsaved upload, without caching', async () => {
    const url = await uploadImage(profCookie);

    const res = await request(app).get(url).set('Cookie', profCookie);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(res.body, PNG_BYTES)).toBe(0);
  });

  it('hides an unsaved upload from other users', async () => {
    const url = await uploadImage(profCookie);

    const res = await request(app).get(url).set('Cookie', otherProfCookie);
    expect(res.status).toBe(404);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('follows the question state and program for answer images', async () => {
    const url = await uploadImage(profCookie);
    const created = await createDraft(profCookie, { answers: fullAnswers({ image: url }) });
    expect(created.status).toBe(201);
    const questionId = created.body.question._id;

    const { cookieHeader: studentCookie } = await createUserAndToken({
      role: 'student', email: 'student@example.com', department: dept._id, program: prog._id,
    });
    const { cookieHeader: outsiderCookie } = await createUserAndToken({
      role: 'student', email: 'outsider@example.com', department: dept._id, program: otherProg._id,
    });

    // Draft: only the author
    expect((await request(app).get(url).set('Cookie', profCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', chairCookie)).status).toBe(403);
    expect((await request(app).get(url).set('Cookie', studentCookie)).status).toBe(403);

    // Pending review: the reviewing chair can see it, other faculty and students cannot
    await Question.updateOne({ _id: questionId }, { state: 'pending_chair' });
    expect((await request(app).get(url).set('Cookie', chairCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', otherProfCookie)).status).toBe(403);
    expect((await request(app).get(url).set('Cookie', studentCookie)).status).toBe(403);

    // Approved: visible within the program only
    await Question.updateOne({ _id: questionId }, { state: 'approved' });
    expect((await request(app).get(url).set('Cookie', studentCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', otherProfCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', outsiderCookie)).status).toBe(403);
  });
});

describe('DELETE /api/questions/image/:key', () => {
  it('lets the uploader discard an unsaved upload', async () => {
    const url = await uploadImage(profCookie);

    const res = await request(app).delete(url).set('Cookie', profCookie);
    expect(res.status).toBe(200);
    expect(r2Store.has(objectKey(url))).toBe(false);
  });

  it('refuses to delete someone else\'s upload or an image a question uses', async () => {
    const url = await uploadImage(profCookie);

    expect((await request(app).delete(url).set('Cookie', otherProfCookie)).status).toBe(404);

    await createDraft(profCookie, { images: [url] });
    expect((await request(app).delete(url).set('Cookie', profCookie)).status).toBe(409);
    expect(r2Store.has(objectKey(url))).toBe(true);
  });
});

describe('answer images on save', () => {
  it('saves one image per answer next to its text', async () => {
    const url = await uploadImage(profCookie);
    const res = await createDraft(profCookie, { answers: fullAnswers({ image: url }) });

    expect(res.status).toBe(201);
    expect(res.body.question.answers[0]).toMatchObject({ text: 'Alpha', image: url });
    expect(res.body.question.answers[1].image).toBeNull();
  });

  it('rejects images uploaded by someone else or from outside storage', async () => {
    const url = await uploadImage(profCookie);

    const stolen = await createDraft(otherProfCookie, { answers: fullAnswers({ image: url }) });
    expect(stolen.status).toBe(400);

    const external = await createDraft(profCookie, { images: ['https://example.com/cat.png'] });
    expect(external.status).toBe(400);
  });

  it('enforces the separate answer image limit', async () => {
    await AppSettings.getSingleton();
    await AppSettings.updateOne({ key: 'singleton' }, { maxAnswerImages: 1 });
    const first = await uploadImage(profCookie);
    const second = await uploadImage(profCookie);

    const answers = fullAnswers({ image: first });
    answers[1].image = second;
    const tooMany = await createDraft(profCookie, { answers });
    expect(tooMany.status).toBe(400);

    await AppSettings.updateOne({ key: 'singleton' }, { maxAnswerImages: 0 });
    const disabled = await createDraft(profCookie, { answers: fullAnswers({ image: first }) });
    expect(disabled.status).toBe(400);
    expect(disabled.body.message).toMatch(/disabled/i);
  });

  it('still saves a text-only edit after the image limit is lowered', async () => {
    const first = await uploadImage(profCookie);
    const second = await uploadImage(profCookie);
    const created = await createDraft(profCookie, { images: [first, second] });
    expect(created.status).toBe(201);

    await AppSettings.updateOne({ key: 'singleton' }, { maxUploadImages: 1 });
    const res = await request(app)
      .patch(`/api/questions/${created.body.question._id}`)
      .set('Cookie', profCookie)
      .send({ description: 'Reworded question' });
    expect(res.status).toBe(200);
  });

  it('does not count answer images against the question image limit', async () => {
    await AppSettings.getSingleton();
    await AppSettings.updateOne({ key: 'singleton' }, { maxUploadImages: 1 });
    const questionImage = await uploadImage(profCookie);
    const answerImage = await uploadImage(profCookie);

    const res = await createDraft(profCookie, {
      images: [questionImage],
      answers: fullAnswers({ image: answerImage }),
    });
    expect(res.status).toBe(201);
  });
});

describe('blank answer rows', () => {
  it('drops empty rows when saving', async () => {
    const res = await createDraft(profCookie, {
      answers: [...fullAnswers(), { text: '   ', isCorrect: false }],
    });

    expect(res.status).toBe(201);
    expect(res.body.question.answers).toHaveLength(4);
  });

  it('rejects submitting an answer that has an image but no text', async () => {
    const url = await uploadImage(profCookie);
    const answers = fullAnswers();
    answers.push({ text: '', isCorrect: false, image: url });
    const created = await createDraft(profCookie, { answers });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post(`/api/questions/${created.body.question._id}/submit`)
      .set('Cookie', profCookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/needs text/i);
  });

  it('does not accept an empty row saved earlier as the correct answer', async () => {
    const q = await Question.create({
      description: 'Legacy', rationalization: 'Because.', tag: tag._id,
      program: prog._id, createdBy: prof._id, state: 'draft',
      answers: [
        { text: '', isCorrect: true },
        { text: 'Alpha' }, { text: 'Bravo' }, { text: 'Charlie' }, { text: 'Delta' },
      ],
    });

    const res = await request(app).post(`/api/questions/${q._id}/submit`).set('Cookie', profCookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('No correct answer selected');
  });

  it('strips empty rows saved earlier when the question is submitted', async () => {
    const q = await Question.create({
      description: 'Legacy', rationalization: 'Because.', tag: tag._id,
      program: prog._id, createdBy: prof._id, state: 'draft',
      answers: [{ text: '', isCorrect: false }, ...fullAnswers()],
    });

    const res = await request(app).post(`/api/questions/${q._id}/submit`).set('Cookie', profCookie);
    expect(res.status).toBe(200);
    const saved = await Question.findById(q._id);
    expect(saved.answers).toHaveLength(4);
  });
});

describe('image cleanup', () => {
  it('deletes a removed image only after the update is saved', async () => {
    const keep = await uploadImage(profCookie);
    const remove = await uploadImage(profCookie);
    const created = await createDraft(profCookie, { images: [keep, remove] });
    const questionId = created.body.question._id;

    // A rejected update must not delete anything
    await AppSettings.getSingleton();
    await AppSettings.updateOne({ key: 'singleton' }, { maxAnswerImages: 0 });
    const answerImage = await uploadImage(profCookie);
    const rejected = await request(app)
      .patch(`/api/questions/${questionId}`)
      .set('Cookie', profCookie)
      .send({ images: [keep], answers: fullAnswers({ image: answerImage }) });
    expect(rejected.status).toBe(400);
    expect(r2Store.has(objectKey(remove))).toBe(true);

    const res = await request(app)
      .patch(`/api/questions/${questionId}`)
      .set('Cookie', profCookie)
      .send({ images: [keep] });
    expect(res.status).toBe(200);
    expect(r2Store.has(objectKey(remove))).toBe(false);
    expect(r2Store.has(objectKey(keep))).toBe(true);
  });

  it('deletes question and answer images when the question is deleted', async () => {
    const questionImage = await uploadImage(profCookie);
    const answerImage = await uploadImage(profCookie);
    const created = await createDraft(profCookie, {
      images: [questionImage],
      answers: fullAnswers({ image: answerImage }),
    });

    const res = await request(app)
      .delete(`/api/questions/${created.body.question._id}`)
      .set('Cookie', profCookie);
    expect(res.status).toBe(200);
    expect(r2Store.has(objectKey(questionImage))).toBe(false);
    expect(r2Store.has(objectKey(answerImage))).toBe(false);
  });
});

describe('answer images in exams', () => {
  it('sends the answer image to students without revealing the correct answer', async () => {
    const url = await uploadImage(profCookie);
    const q = await Question.create({
      description: 'Q1', tag: tag._id, program: prog._id, createdBy: prof._id, state: 'approved',
      answers: fullAnswers({ image: url }),
    });
    const { user: dean } = await createUserAndToken({ role: 'dean', email: 'dean@example.com', department: dept._id });
    const exam = await MockBoardExam.create({
      name: 'Ongoing Exam', program: prog._id, department: dept._id,
      questions: [q._id], startDateTime: pastDate(1), endDateTime: futureDate(1),
      status: 'ongoing', createdBy: dean._id,
    });
    const { cookieHeader: studentCookie } = await createUserAndToken({
      role: 'student', email: 'exam-student@example.com', department: dept._id, program: prog._id,
    });

    const res = await request(app).post(`/api/student-exams/${exam._id}/start`).set('Cookie', studentCookie);
    expect(res.status).toBe(200);

    const answers = res.body.questions[0].answers;
    const withImage = answers.find((a) => a.text === 'Alpha');
    expect(withImage.image).toBe(url);
    answers.forEach((a) => expect(a).not.toHaveProperty('isCorrect'));
  });
});

describe('maxAnswerImages setting', () => {
  it('is exposed to faculty and validated on update', async () => {
    const { cookieHeader: adminCookie } = await createUserAndToken({ role: 'super_admin', email: 'admin@example.com' });

    const publicRes = await request(app).get('/api/admin/settings/public').set('Cookie', profCookie);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body).toMatchObject({ maxUploadImages: 5, maxAnswerImages: 5 });

    const invalid = await request(app).patch('/api/admin/settings').set('Cookie', adminCookie).send({ maxAnswerImages: 9 });
    expect(invalid.status).toBe(400);

    const valid = await request(app).patch('/api/admin/settings').set('Cookie', adminCookie).send({ maxAnswerImages: 2 });
    expect(valid.status).toBe(200);
    expect(valid.body.maxAnswerImages).toBe(2);
  });
});

describe('shared passage images', () => {
  const groupMember = (overrides = {}) => ({
    description: 'Based on the passage, which is correct?',
    rationalization: 'Because.',
    answers: fullAnswers(),
    tagId: tag._id,
    ...overrides,
  });

  function createGroup(cookie, body = {}) {
    return request(app)
      .post('/api/questions/group')
      .set('Cookie', cookie)
      .send({ questions: [groupMember(), groupMember()], groupContext: 'Read the passage.', ...body });
  }

  it('saves passage images on every question in the group, under their own limit', async () => {
    await AppSettings.getSingleton();
    await AppSettings.updateOne({ key: 'singleton' }, { maxUploadImages: 1, maxGroupContextImages: 2 });
    const first = await uploadImage(profCookie);
    const second = await uploadImage(profCookie);

    const res = await createGroup(profCookie, { groupContextImages: [first, second] });
    expect(res.status).toBe(201);

    const saved = await Question.find({ groupId: res.body.groupId });
    expect(saved).toHaveLength(2);
    saved.forEach((q) => expect([...q.groupContextImages]).toEqual([first, second]));
  });

  it('rejects more passage images than the limit, and any when they are turned off', async () => {
    await AppSettings.getSingleton();
    await AppSettings.updateOne({ key: 'singleton' }, { maxGroupContextImages: 1 });
    const urls = [await uploadImage(profCookie), await uploadImage(profCookie)];

    const tooMany = await createGroup(profCookie, { groupContextImages: urls });
    expect(tooMany.status).toBe(400);
    expect(tooMany.body.message).toBe('Maximum of 1 shared passage image allowed');

    await AppSettings.updateOne({ key: 'singleton' }, { maxGroupContextImages: 0 });
    const off = await createGroup(profCookie, { groupContextImages: [urls[0]] });
    expect(off.status).toBe(400);
    expect(off.body.message).toMatch(/disabled/);
    expect(await Question.countDocuments()).toBe(0);
  });

  it("rejects another user's upload as a passage image", async () => {
    const othersImage = await uploadImage(otherProfCookie);
    const res = await createGroup(profCookie, { groupContextImages: [othersImage] });
    expect(res.status).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('lets students in the program view passage images of an approved group', async () => {
    const url = await uploadImage(profCookie);
    const created = await createGroup(profCookie, { groupContextImages: [url] });
    await Question.updateMany({ groupId: created.body.groupId }, { state: 'approved' });
    const { cookieHeader: studentCookie } = await createUserAndToken({
      role: 'student', email: 'passage-student@example.com', department: dept._id, program: prog._id,
    });
    const { cookieHeader: outsiderCookie } = await createUserAndToken({
      role: 'student', email: 'passage-outsider@example.com', department: dept._id, program: otherProg._id,
    });

    expect((await request(app).get(url).set('Cookie', studentCookie)).status).toBe(200);
    expect((await request(app).get(url).set('Cookie', outsiderCookie)).status).toBe(403);
  });

  it('deletes a removed passage image after the update, and the rest with the group', async () => {
    const keep = await uploadImage(profCookie);
    const remove = await uploadImage(profCookie);
    const created = await createGroup(profCookie, { groupContextImages: [keep, remove] });
    const [first, second] = created.body.questions;

    const updated = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({
        questions: [groupMember({ _id: first._id }), groupMember({ _id: second._id })],
        groupContextImages: [keep],
      });
    expect(updated.status).toBe(200);
    expect(r2Store.has(objectKey(remove))).toBe(false);
    expect(r2Store.has(objectKey(keep))).toBe(true);

    const deleted = await request(app)
      .delete(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie);
    expect(deleted.status).toBe(200);
    expect(r2Store.has(objectKey(keep))).toBe(false);
  });

  it('sends passage images to students taking the exam', async () => {
    const url = await uploadImage(profCookie);
    const created = await createGroup(profCookie, { groupContextImages: [url] });
    await Question.updateMany({ groupId: created.body.groupId }, { state: 'approved' });
    const { user: dean } = await createUserAndToken({ role: 'dean', email: 'passage-dean@example.com', department: dept._id });
    const exam = await MockBoardExam.create({
      name: 'Passage Exam', program: prog._id, department: dept._id,
      questions: created.body.questions.map((q) => q._id),
      startDateTime: pastDate(1), endDateTime: futureDate(1),
      status: 'ongoing', createdBy: dean._id,
    });
    const { cookieHeader: studentCookie } = await createUserAndToken({
      role: 'student', email: 'passage-taker@example.com', department: dept._id, program: prog._id,
    });

    const res = await request(app).post(`/api/student-exams/${exam._id}/start`).set('Cookie', studentCookie);
    expect(res.status).toBe(200);
    res.body.questions.forEach((q) => expect(q.groupContextImages).toEqual([url]));
  });

  it('exposes the passage image limit to faculty and validates it', async () => {
    const { cookieHeader: adminCookie } = await createUserAndToken({ role: 'super_admin', email: 'passage-admin@example.com' });

    const publicRes = await request(app).get('/api/admin/settings/public').set('Cookie', profCookie);
    expect(publicRes.body).toMatchObject({ maxGroupContextImages: 5 });

    const invalid = await request(app).patch('/api/admin/settings').set('Cookie', adminCookie).send({ maxGroupContextImages: 51 });
    expect(invalid.status).toBe(400);

    const valid = await request(app).patch('/api/admin/settings').set('Cookie', adminCookie).send({ maxGroupContextImages: 3 });
    expect(valid.status).toBe(200);
    expect(valid.body.maxGroupContextImages).toBe(3);
  });
});
