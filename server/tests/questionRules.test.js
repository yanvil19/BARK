const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const AuditLog = require('../models/AuditLog');
const { decryptQuestion } = require('../services/encryptionService');

let dept, prog, otherProg, tag, otherTag, prof, profCookie;

beforeEach(async () => {
  dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  otherProg = await Program.create({ name: 'Civil Engineering', code: 'CE', department: dept._id });

  const result = await createUserAndToken({ role: 'professor', department: dept._id, program: prog._id });
  prof = result.user;
  profCookie = `nu_board_token=${result.token}`;

  tag = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: prof._id });
  otherTag = await Tag.create({ name: 'Statics', program: otherProg._id, createdBy: prof._id });
});

const fourAnswers = () => [
  { text: '2', isCorrect: true },
  { text: '3', isCorrect: false },
  { text: '4', isCorrect: false },
  { text: '5', isCorrect: false },
];

async function storedQuestion(id) {
  return decryptQuestion(await Question.findById(id));
}

describe('Rationalization is optional', () => {
  it('submits a question without a rationalization', async () => {
    const created = await request(app)
      .post('/api/questions')
      .set('Cookie', profCookie)
      .send({ description: 'What is 1+1?', answers: fourAnswers(), tagId: tag._id });
    expect(created.status).toBe(201);
    expect(created.body.question.rationalization).toBe('');

    const res = await request(app)
      .post(`/api/questions/${created.body.question._id}/submit`)
      .set('Cookie', profCookie);
    expect(res.status).toBe(200);
    expect(res.body.question.state).toBe('pending_chair');
  });

  it('submits a question group without rationalizations', async () => {
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({
        groupContext: 'Read the passage.',
        questions: [
          { description: 'First?', answers: fourAnswers(), tagId: tag._id },
          { description: 'Second?', answers: fourAnswers(), tagId: tag._id },
        ],
      });
    expect(created.status).toBe(201);

    const res = await request(app)
      .post(`/api/questions/group/${created.body.groupId}/submit`)
      .set('Cookie', profCookie);
    expect(res.status).toBe(200);
    expect(res.body.questions.every((q) => q.state === 'pending_chair')).toBe(true);

    const log = await AuditLog.findOne({ action: 'question_group_created' });
    expect(log).not.toBeNull();
    expect(log.details.groupId).toBe(created.body.groupId);
  });
});

describe('Image flags from an import', () => {
  it('keeps the image flags on a single question and lets an edit change them', async () => {
    const created = await request(app)
      .post('/api/questions')
      .set('Cookie', profCookie)
      .send({
        description: 'Which part of Figure 1 is the left ventricle?',
        answers: fourAnswers(),
        image_required: true,
        image_note: '  Figure 1: heart diagram  ',
      });
    expect(created.status).toBe(201);

    let stored = await Question.findById(created.body.question._id);
    expect(stored.image_required).toBe(true);
    expect(stored.image_note).toBe('Figure 1: heart diagram');
    expect(stored.image_flag_removed_by_user).toBe(false);

    const updated = await request(app)
      .patch(`/api/questions/${stored._id}`)
      .set('Cookie', profCookie)
      .send({ image_flag_removed_by_user: true });
    expect(updated.status).toBe(200);

    stored = await Question.findById(stored._id);
    expect(stored.image_flag_removed_by_user).toBe(true);
    expect(stored.image_required).toBe(true); // left alone when not sent
  });

  it('updates the image flags of a group member', async () => {
    const created = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({
        questions: [
          { description: 'First?', answers: fourAnswers(), image_required: true, image_note: 'Chart' },
          { description: 'Second?', answers: fourAnswers() },
        ],
      });
    expect(created.status).toBe(201);
    const [first, second] = created.body.questions;
    expect((await Question.findById(first._id)).image_required).toBe(true);

    const res = await request(app)
      .put(`/api/questions/group/${created.body.groupId}`)
      .set('Cookie', profCookie)
      .send({
        questions: [
          { _id: first._id, description: 'First?', answers: fourAnswers(), image_required: true, image_flag_removed_by_user: true },
          { _id: second._id, description: 'Second?', answers: fourAnswers() },
        ],
      });
    expect(res.status).toBe(200);
    expect((await Question.findById(first._id)).image_flag_removed_by_user).toBe(true);
  });
});

describe('Question HTML is cleaned on the server', () => {
  it('keeps editor formatting and equations but drops scripts and handlers', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Cookie', profCookie)
      .send({
        description: '<p onclick="steal()">Solve <b>this</b> <math-field data-type="math-node" data-latex="x^2 &lt; 4">x^2 &lt; 4</math-field><script>alert(1)</script><img src=x onerror="alert(1)"></p>',
        rationalization: '<p>Because <a href="javascript:alert(1)">math</a></p><iframe src="https://example.com"></iframe>',
        answers: [
          { text: '<p><u>two</u><style>p{}</style></p>', isCorrect: true },
          { text: 'x < 3 & y > 1', isCorrect: false },
        ],
      });
    expect(res.status).toBe(201);

    const stored = await storedQuestion(res.body.question._id);
    expect(stored.description).toBe('<p>Solve <b>this</b> <math-field data-type="math-node" data-latex="x^2 &lt; 4">x^2 &lt; 4</math-field></p>');
    expect(stored.rationalization).toBe('<p>Because math</p>');
    expect(stored.answers[0].text).toBe('<p><u>two</u></p>');
    expect(stored.answers[1].text).toBe('x &lt; 3 &amp; y &gt; 1');
  });

  it('stores a rationalization of empty paragraphs as empty', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Cookie', profCookie)
      .send({ description: 'What is 1+1?', rationalization: '<p></p><p><br></p><p>&nbsp;</p>', answers: fourAnswers() });
    expect(res.status).toBe(201);
    expect((await storedQuestion(res.body.question._id)).rationalization).toBe('');
  });

  it('rejects a question whose text is nothing but disallowed markup', async () => {
    const res = await request(app)
      .post('/api/questions')
      .set('Cookie', profCookie)
      .send({ description: '<script>alert(1)</script>', answers: fourAnswers() });
    expect(res.status).toBe(400);
    expect(await Question.countDocuments()).toBe(0);
  });

  it('cleans the shared passage of a group', async () => {
    const res = await request(app)
      .post('/api/questions/group')
      .set('Cookie', profCookie)
      .send({
        groupContext: '<p>Case <i>study</i></p><script>alert(1)</script>',
        questions: [
          { description: 'First?', answers: fourAnswers() },
          { description: 'Second?', answers: fourAnswers() },
        ],
      });
    expect(res.status).toBe(201);
    const stored = await storedQuestion(res.body.questions[0]._id);
    expect(stored.groupContext).toBe('<p>Case <i>study</i></p>');
  });
});

describe('Changing the subject of a question', () => {
  let question;

  beforeEach(async () => {
    question = await Question.create({
      description: 'Original', answers: fourAnswers(), program: prog._id, createdBy: prof._id, state: 'draft',
    });
  });

  it('rejects a subject from another program', async () => {
    const res = await request(app)
      .patch(`/api/questions/${question._id}`)
      .set('Cookie', profCookie)
      .send({ tagId: otherTag._id });
    expect(res.status).toBe(400);
    expect((await Question.findById(question._id)).tag).toBeUndefined();
  });

  it('rejects a subject id that is not valid instead of failing', async () => {
    const res = await request(app)
      .patch(`/api/questions/${question._id}`)
      .set('Cookie', profCookie)
      .send({ tagId: 'not-an-id' });
    expect(res.status).toBe(400);
  });

  it('accepts an active subject of the same program', async () => {
    const res = await request(app)
      .patch(`/api/questions/${question._id}`)
      .set('Cookie', profCookie)
      .send({ tagId: tag._id });
    expect(res.status).toBe(200);
    expect(String((await Question.findById(question._id)).tag)).toBe(String(tag._id));
  });
});
