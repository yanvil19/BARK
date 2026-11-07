const request = require('supertest');
const app = require('../app');
const { createUserAndToken } = require('./helpers');
const Department = require('../models/Department');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const Question = require('../models/Question');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { decryptQuestion } = require('../services/encryptionService');

let prog, tagA, tagB;
let prof, profCookie, chair, chairCookie, dean, deanCookie, otherChairCookie, otherDeanCookie;

const fullAnswers = () => [
  { text: 'Alpha', isCorrect: true },
  { text: 'Bravo', isCorrect: false },
  { text: 'Charlie', isCorrect: false },
  { text: 'Delta', isCorrect: false },
];

const body = (overrides = {}) => ({
  description: 'Which is correct?',
  rationalization: 'Because it is.',
  answers: fullAnswers(),
  tagId: tagA._id,
  ...overrides,
});

// A question the professor has submitted for review
async function submitQuestion(overrides = {}) {
  const created = await request(app).post('/api/questions').set('Cookie', profCookie).send(body(overrides));
  expect(created.status).toBe(201);
  const submitted = await request(app).post(`/api/questions/${created.body.question._id}/submit`).set('Cookie', profCookie);
  expect(submitted.status).toBe(200);
  return submitted.body.question;
}

// A set the professor has submitted for review, with its questions in order
async function submitSet() {
  const created = await request(app)
    .post('/api/questions/group')
    .set('Cookie', profCookie)
    .send({ questions: [body({ description: 'First' }), body({ description: 'Second' }), body({ description: 'Third' })], groupContext: 'Passage' });
  expect(created.status).toBe(201);
  const { groupId } = created.body;
  const submitted = await request(app).post(`/api/questions/group/${groupId}/submit`).set('Cookie', profCookie);
  expect(submitted.status).toBe(200);
  return { groupId, questions: submitted.body.questions.sort((a, b) => a.groupOrder - b.groupOrder) };
}

const setPayload = (questions, change = (q) => q) => ({
  questions: questions.map((q) => change({
    _id: q._id,
    description: q.description,
    rationalization: q.rationalization,
    answers: q.answers,
    tagId: q.tag._id || q.tag,
    images: q.images,
  })),
  groupContext: 'Passage',
  groupContextImages: [],
});

const reviewEdit = (id, cookie, sent) => request(app).patch(`/api/questions/${id}/review-edit`).set('Cookie', cookie).send(sent);
const reviewEditSet = (groupId, cookie, sent) => request(app).put(`/api/questions/group/${groupId}/review-edit`).set('Cookie', cookie).send(sent);
const stored = async (id) => decryptQuestion(await Question.findById(id));

beforeEach(async () => {
  const dept = await Department.create({ name: 'Engineering', code: 'ENG' });
  const otherDept = await Department.create({ name: 'Business', code: 'BUS' });
  prog = await Program.create({ name: 'Computer Science', code: 'CS', department: dept._id });
  const otherProg = await Program.create({ name: 'Accounting', code: 'AC', department: otherDept._id });

  ({ user: prof, cookieHeader: profCookie } = await createUserAndToken({
    role: 'professor', email: 'prof@example.com', name: 'Prof Santos', department: dept._id, program: prog._id,
  }));
  ({ user: chair, cookieHeader: chairCookie } = await createUserAndToken({
    role: 'program_chair', email: 'chair@example.com', name: 'Chair Reyes', department: dept._id, program: prog._id,
  }));
  ({ user: dean, cookieHeader: deanCookie } = await createUserAndToken({
    role: 'dean', email: 'dean@example.com', name: 'Dean Cruz', department: dept._id,
  }));
  ({ cookieHeader: otherChairCookie } = await createUserAndToken({
    role: 'program_chair', email: 'other-chair@example.com', department: otherDept._id, program: otherProg._id,
  }));
  ({ cookieHeader: otherDeanCookie } = await createUserAndToken({
    role: 'dean', email: 'other-dean@example.com', department: otherDept._id,
  }));

  tagA = await Tag.create({ name: 'Algebra', program: prog._id, createdBy: prof._id });
  tagB = await Tag.create({ name: 'Geometry', program: prog._id, createdBy: prof._id });
});

describe('a reviewer edits a submitted question', () => {
  it.each([['Program Chair', () => chairCookie, () => chair], ['Dean', () => deanCookie, () => dean]])('%s: the question stays in review, marked with who edited it', async (_, cookie, user) => {
    const question = await submitQuestion();
    const before = await Question.findById(question._id);

    const res = await reviewEdit(question._id, cookie(), body({ description: 'Reworded by the reviewer', tagId: tagB._id }));

    expect(res.status).toBe(200);
    expect(res.body.question.state).toBe('pending_chair');
    expect(res.body.question.description).toBe('Reworded by the reviewer');
    expect(res.body.question.tag.name).toBe('Geometry');
    expect(res.body.question.lastEditedBy.name).toBe(user().name);
    expect(res.body.question.createdBy.name).toBe('Prof Santos');

    const saved = await stored(question._id);
    expect(saved.state).toBe('pending_chair');
    expect(saved.description).toBe('Reworded by the reviewer');
    expect(String(saved.createdBy)).toBe(String(prof._id));
    expect(String(saved.lastEditedBy)).toBe(String(user()._id));
    expect(saved.lastEditedAt).toBeTruthy();
    // Being edited does not make it look newly submitted
    expect(saved.submittedAt.getTime()).toBe(before.submittedAt.getTime());
  });

  it('keeps a restored question restored', async () => {
    const question = await submitQuestion();
    await Question.updateOne({ _id: question._id }, { state: 'restored' });

    const res = await reviewEdit(question._id, chairCookie, body({ description: 'Fixed' }));

    expect(res.status).toBe(200);
    expect(res.body.question.state).toBe('restored');
  });

  it('keeps the reviewer\'s lock, so the question can still be decided', async () => {
    const question = await submitQuestion();
    await request(app).patch(`/api/questions/${question._id}/lock`).set('Cookie', chairCookie);

    const res = await reviewEdit(question._id, chairCookie, body({ description: 'Fixed' }));
    expect(res.status).toBe(200);

    const saved = await Question.findById(question._id);
    expect(String(saved.currentReviewer)).toBe(String(chair._id));

    const approved = await request(app).post(`/api/questions/${question._id}/review`).set('Cookie', chairCookie).send({ action: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.question.state).toBe('approved');
    // The page keeps showing the name after the decision
    expect(approved.body.question.lastEditedBy.name).toBe('Chair Reyes');
    expect(approved.body.question.description).toBe('Fixed');
  });

  it('records the edit as a reviewer\'s in the audit log', async () => {
    const question = await submitQuestion();
    await reviewEdit(question._id, chairCookie, body({ description: 'Fixed' }));

    const log = await AuditLog.findOne({ action: 'question_updated', admin: chair._id });
    expect(log).toBeTruthy();
    expect(log.details.editedByReviewer).toBe(true);
  });

  it('shows no name, without breaking the list, when the editor\'s account is deleted', async () => {
    const question = await submitQuestion();
    await reviewEdit(question._id, deanCookie, body({ description: 'Edited by the dean' }));
    await User.deleteOne({ _id: dean._id });

    const res = await request(app).get('/api/questions/approvals').set('Cookie', chairCookie);

    const listed = res.body.questions.find((q) => q._id === question._id);
    expect(res.status).toBe(200);
    expect(listed.lastEditedBy).toBeNull();
    expect(listed.lastEditedAt).toBeTruthy();
  });

  it('shows who last edited it in the approvals list', async () => {
    const question = await submitQuestion();
    const untouched = await submitQuestion({ description: 'Never edited' });
    await reviewEdit(question._id, chairCookie, body({ description: 'Fixed' }));

    const res = await request(app).get('/api/questions/approvals').set('Cookie', chairCookie);

    const edited = res.body.questions.find((q) => q._id === question._id);
    expect(edited.lastEditedBy.name).toBe('Chair Reyes');
    expect(edited.lastEditedAt).toBeTruthy();

    const other = res.body.questions.find((q) => q._id === untouched._id);
    expect(other.lastEditedBy).toBeNull();
    expect(other.lastEditedAt).toBeNull();
  });

  it('does not mark the question when nothing changed', async () => {
    const question = await submitQuestion();

    const res = await reviewEdit(question._id, chairCookie, body());

    expect(res.status).toBe(200);
    expect(res.body.question.lastEditedBy).toBeNull();
    expect(res.body.question.lastEditedAt).toBeNull();
  });

  it('does not mark an older question whose stored text was never cleaned', async () => {
    const question = await submitQuestion();
    await Question.updateOne({ _id: question._id }, { description: '  Salt & pepper <b onclick="x()">mix</b> ' });

    const res = await reviewEdit(question._id, chairCookie, body({ description: '  Salt & pepper <b onclick="x()">mix</b> ' }));

    expect(res.status).toBe(200);
    expect(res.body.question.lastEditedBy).toBeNull();
    expect(res.body.question.description).toBe('Salt &amp; pepper <b>mix</b>');
  });

  it.each([
    ['the correct answer', (a) => a.map((x, i) => ({ ...x, isCorrect: i === 1 }))],
    ['an answer\'s text', (a) => a.map((x, i) => (i === 3 ? { ...x, text: 'Echo' } : x))],
  ])('marks a change to %s', async (_, change) => {
    const question = await submitQuestion();

    const res = await reviewEdit(question._id, chairCookie, body({ answers: change(fullAnswers()) }));

    expect(res.status).toBe(200);
    expect(res.body.question.lastEditedBy.name).toBe('Chair Reyes');
  });
});

describe('who can edit as a reviewer', () => {
  it('refuses a professor, even the question\'s author', async () => {
    const question = await submitQuestion();
    const res = await reviewEdit(question._id, profCookie, body({ description: 'Mine' }));

    expect(res.status).toBe(403);
    expect((await stored(question._id)).description).toBe('Which is correct?');
  });

  it.each([['Program Chair', () => otherChairCookie], ['Dean', () => otherDeanCookie]])('refuses a %s of another program', async (_, cookie) => {
    const question = await submitQuestion();
    const res = await reviewEdit(question._id, cookie(), body({ description: 'Not mine' }));

    expect(res.status).toBe(403);
    expect((await stored(question._id)).description).toBe('Which is correct?');
  });

  it.each(['draft', 'returned', 'approved', 'rejected'])('refuses a question that is %s', async (state) => {
    const question = await submitQuestion();
    await Question.updateOne({ _id: question._id }, { state });

    const res = await reviewEdit(question._id, chairCookie, body({ description: 'Too late' }));

    expect(res.status).toBe(409);
    expect((await stored(question._id)).description).toBe('Which is correct?');
  });

  it('returns 404 for a question that does not exist', async () => {
    const res = await reviewEdit('507f1f77bcf86cd799439011', chairCookie, body());
    expect(res.status).toBe(404);
  });

  it('refuses while another reviewer holds the lock, and names them', async () => {
    const question = await submitQuestion();
    await request(app).patch(`/api/questions/${question._id}/lock`).set('Cookie', deanCookie);

    const res = await reviewEdit(question._id, chairCookie, body({ description: 'Collision' }));

    expect(res.status).toBe(423);
    expect(res.body.message).toContain('Dean Cruz');
    expect((await stored(question._id)).description).toBe('Which is correct?');
  });

  it('allows an edit once the other reviewer\'s lock has gone stale', async () => {
    const question = await submitQuestion();
    await Question.updateOne({ _id: question._id }, {
      currentReviewer: dean._id,
      reviewStartedAt: new Date(Date.now() - 11 * 60 * 1000),
    });

    const res = await reviewEdit(question._id, chairCookie, body({ description: 'Fine now' }));

    expect(res.status).toBe(200);
  });
});

describe('a reviewer\'s edit keeps the question ready for a decision', () => {
  it.each([
    ['too few answers', { answers: fullAnswers().slice(0, 3) }, 'exactly 4 or 5'],
    ['no correct answer', { answers: fullAnswers().map((a) => ({ ...a, isCorrect: false })) }, 'No correct answer'],
    ['duplicate answers', { answers: fullAnswers().map((a, i) => (i === 1 ? { ...a, text: 'Alpha' } : a)) }, 'Duplicate'],
    ['no subject', { tagId: '' }, 'subject'],
  ])('refuses %s', async (_, overrides, message) => {
    const question = await submitQuestion();

    const res = await reviewEdit(question._id, chairCookie, body(overrides));

    expect(res.status).toBe(400);
    expect(res.body.message).toContain(message);
    const saved = await stored(question._id);
    expect(saved.answers).toHaveLength(4);
    expect(saved.lastEditedBy).toBeNull();
  });

  it('refuses a subject from another program', async () => {
    const otherProgram = await Program.create({ name: 'Math', code: 'MA', department: prog.department });
    const otherTag = await Tag.create({ name: 'Statistics', program: otherProgram._id, createdBy: prof._id });
    const question = await submitQuestion();

    const res = await reviewEdit(question._id, chairCookie, body({ tagId: otherTag._id }));

    expect(res.status).toBe(400);
  });
});

describe('a reviewer edits a submitted question set', () => {
  it('keeps the whole set in review and marks all of it, even for a change to one question', async () => {
    const { groupId, questions } = await submitSet();

    const res = await reviewEditSet(groupId, chairCookie, setPayload(questions, (q) => (
      q._id === questions[1]._id ? { ...q, description: 'Second, reworded' } : q
    )));

    expect(res.status).toBe(200);
    const saved = (await Question.find({ groupId })).map(decryptQuestion);
    expect(saved).toHaveLength(3);
    saved.forEach((q) => {
      expect(q.state).toBe('pending_chair');
      expect(String(q.createdBy)).toBe(String(prof._id));
      expect(String(q.lastEditedBy)).toBe(String(chair._id));
      expect(q.lastEditedAt).toBeTruthy();
    });
    expect(saved.find((q) => String(q._id) === questions[1]._id).description).toBe('Second, reworded');
    expect(new Set(saved.map((q) => q.lastEditedAt.getTime())).size).toBe(1);
    res.body.questions.forEach((q) => expect(q.lastEditedBy.name).toBe('Chair Reyes'));
  });

  it('marks the set when only the shared passage changed', async () => {
    const { groupId, questions } = await submitSet();

    const res = await reviewEditSet(groupId, chairCookie, { ...setPayload(questions), groupContext: 'New passage' });

    expect(res.status).toBe(200);
    res.body.questions.forEach((q) => {
      expect(q.groupContext).toBe('New passage');
      expect(q.lastEditedBy.name).toBe('Chair Reyes');
    });
  });

  it('does not mark the set when nothing changed', async () => {
    const { groupId, questions } = await submitSet();

    const res = await reviewEditSet(groupId, chairCookie, setPayload(questions));

    expect(res.status).toBe(200);
    res.body.questions.forEach((q) => expect(q.lastEditedBy).toBeNull());
  });

  it('a question added by the reviewer joins the set as the author\'s, still in review', async () => {
    const { groupId, questions } = await submitSet();
    const payload = setPayload(questions);
    payload.questions.push(body({ description: 'Added by the reviewer' }));

    const res = await reviewEditSet(groupId, chairCookie, payload);

    expect(res.status).toBe(200);
    expect(res.body.questions).toHaveLength(4);
    const added = (await Question.find({ groupId })).map(decryptQuestion).find((q) => q.description === 'Added by the reviewer');
    expect(added.state).toBe('pending_chair');
    expect(String(added.createdBy)).toBe(String(prof._id));
    expect(added.submittedAt).toBeTruthy();
    expect(added.groupOrder).toBe(3);

    // The author still sees the whole set
    const authorView = await request(app).get(`/api/questions/group/${groupId}`).set('Cookie', profCookie);
    expect(authorView.body.questions).toHaveLength(4);
  });

  it('a question removed by the reviewer leaves the set, and the set is marked', async () => {
    const { groupId, questions } = await submitSet();
    const payload = setPayload(questions);
    payload.questions.pop();

    const res = await reviewEditSet(groupId, chairCookie, payload);

    expect(res.status).toBe(200);
    expect(await Question.countDocuments({ groupId })).toBe(2);
    res.body.questions.forEach((q) => expect(q.lastEditedBy.name).toBe('Chair Reyes'));
  });

  it('checks every question against the submission rules', async () => {
    const { groupId, questions } = await submitSet();

    const res = await reviewEditSet(groupId, chairCookie, setPayload(questions, (q) => (
      q._id === questions[2]._id ? { ...q, answers: q.answers.slice(0, 2) } : q
    )));

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/^Question 3: /);
    expect((await Question.find({ groupId })).every((q) => q.lastEditedBy === null)).toBe(true);
  });

  it('refuses a set with a question another reviewer has locked', async () => {
    const { groupId, questions } = await submitSet();
    await request(app).patch(`/api/questions/${questions[2]._id}/lock`).set('Cookie', deanCookie);

    const res = await reviewEditSet(groupId, chairCookie, setPayload(questions));

    expect(res.status).toBe(423);
    expect(res.body.message).toContain('Dean Cruz');
  });

  it('refuses a set where any question has left review', async () => {
    const { groupId, questions } = await submitSet();
    await Question.updateOne({ _id: questions[0]._id }, { state: 'approved' });

    const res = await reviewEditSet(groupId, chairCookie, setPayload(questions));

    expect(res.status).toBe(409);
  });

  it('refuses a professor and a reviewer of another program', async () => {
    const { groupId, questions } = await submitSet();

    expect((await reviewEditSet(groupId, profCookie, setPayload(questions))).status).toBe(403);
    expect((await reviewEditSet(groupId, otherChairCookie, setPayload(questions))).status).toBe(403);
  });

  it('after a set is approved, the names are still on every question', async () => {
    const { groupId, questions } = await submitSet();
    await reviewEditSet(groupId, chairCookie, { ...setPayload(questions), groupContext: 'New passage' });

    const res = await request(app).post(`/api/questions/${questions[0]._id}/review`).set('Cookie', chairCookie).send({ action: 'approve' });

    expect(res.status).toBe(200);
    expect(res.body.groupQuestions).toHaveLength(3);
    res.body.groupQuestions.forEach((q) => expect(q.lastEditedBy.name).toBe('Chair Reyes'));
  });
});

describe('the creator\'s own edits', () => {
  it('still pull a submitted question back to draft, and are marked with their name', async () => {
    const question = await submitQuestion();

    const res = await request(app).patch(`/api/questions/${question._id}`).set('Cookie', profCookie).send(body({ description: 'My rewrite' }));

    expect(res.status).toBe(200);
    expect(res.body.question.state).toBe('draft');
    const saved = await stored(question._id);
    expect(String(saved.lastEditedBy)).toBe(String(prof._id));
    expect(saved.lastEditedAt).toBeTruthy();
    expect(saved.currentReviewer).toBeNull();
  });

  it('are not marked when nothing changed', async () => {
    const created = await request(app).post('/api/questions').set('Cookie', profCookie).send(body());

    await request(app).patch(`/api/questions/${created.body.question._id}`).set('Cookie', profCookie).send(body());

    expect((await stored(created.body.question._id)).lastEditedBy).toBeNull();
  });

  it('replace a reviewer\'s name as the last editor', async () => {
    const question = await submitQuestion();
    await reviewEdit(question._id, chairCookie, body({ description: 'Chair version' }));

    await request(app).patch(`/api/questions/${question._id}`).set('Cookie', profCookie).send(body({ description: 'Author version' }));

    expect(String((await stored(question._id)).lastEditedBy)).toBe(String(prof._id));
  });

  it('still pull a submitted set back to draft, and mark all of it', async () => {
    const { groupId, questions } = await submitSet();

    const res = await request(app).put(`/api/questions/group/${groupId}`).set('Cookie', profCookie).send({ ...setPayload(questions), groupContext: 'My passage' });

    expect(res.status).toBe(200);
    const saved = await Question.find({ groupId });
    saved.forEach((q) => {
      expect(q.state).toBe('draft');
      expect(String(q.lastEditedBy)).toBe(String(prof._id));
    });
  });

  it('are refused for another professor\'s question, as before', async () => {
    const { cookieHeader: otherProfCookie } = await createUserAndToken({
      role: 'professor', email: 'other-prof@example.com', department: prog.department, program: prog._id,
    });
    const question = await submitQuestion();

    const res = await request(app).patch(`/api/questions/${question._id}`).set('Cookie', otherProfCookie).send(body({ description: 'Not mine' }));

    expect(res.status).toBe(403);
  });
});
