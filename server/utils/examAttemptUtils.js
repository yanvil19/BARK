const MockBoardExam = require('../models/MockBoardExam');

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// [GROUPED QUESTIONS] Group-aware shuffle:
// Questions sharing a groupId travel as a single slot in the randomized order.
// Within the group, questions stay sorted by groupOrder.
function shuffleQuestionsGroupAware(questions) {
  const slots = [];
  const groupMap = new Map();

  for (const q of questions) {
    const gid = q.groupId ? String(q.groupId).trim() : null;
    if (!gid) {
      slots.push([q]);
    } else {
      if (!groupMap.has(gid)) groupMap.set(gid, []);
      groupMap.get(gid).push(q);
    }
  }

  for (const [, members] of groupMap) {
    members.sort((a, b) => (Number(a.groupOrder) || 0) - (Number(b.groupOrder) || 0));
    slots.push(members);
  }

  shuffleArray(slots);
  return slots.flat();
}

// ─── The exam's rules: points, question timers, one-way navigation ──────────

const DEFAULT_POINTS = 1;
const DEFAULT_SECONDS = 120;

const idOf = (value) => String(value?._id || value);

function itemSettingsById(exam) {
  return new Map((exam?.itemSettings || []).filter((item) => item?.question).map((item) => [idOf(item.question), item]));
}

// What a right answer to each question earns: its points with custom points on, else 1
function pointsByQuestion(exam) {
  const custom = exam?.scoringMode === 'custom';
  const items = itemSettingsById(exam);
  const fallback = Number(exam?.defaultQuestionPoints) || DEFAULT_POINTS;
  return new Map((exam?.questions || []).map((question) => {
    const id = idOf(question);
    return [id, custom ? Number(items.get(id)?.points) || fallback : DEFAULT_POINTS];
  }));
}

// Each question's own time in milliseconds; empty with the question timer off
function timeLimitsMs(exam) {
  if (!exam?.questionTimerEnabled) return new Map();
  const items = itemSettingsById(exam);
  const fallback = Number(exam?.defaultQuestionSeconds) || DEFAULT_SECONDS;
  return new Map((exam?.questions || []).map((question) => {
    const id = idOf(question);
    return [id, (Number(items.get(id)?.timeLimitSeconds) || fallback) * 1000];
  }));
}

// The rules a taker's screen needs, as the exam keeps them. No answers are in here.
function takerRules(exam) {
  return {
    scoringMode: exam.scoringMode === 'custom' ? 'custom' : 'equal',
    defaultQuestionPoints: exam.defaultQuestionPoints,
    questionTimerEnabled: Boolean(exam.questionTimerEnabled),
    defaultQuestionSeconds: exam.defaultQuestionSeconds,
    oneWayNavigation: Boolean(exam.oneWayNavigation),
    oneWayBackAllowed: Boolean(exam.oneWayBackAllowed),
    itemSettings: (exam.itemSettings || []).map((item) => ({
      question: idOf(item.question),
      points: item.points,
      timeLimitSeconds: item.timeLimitSeconds,
    })),
  };
}

// ─── Grading ────────────────────────────────────────────────────────────────

// Marks an attempt: score is the number of right answers (as the results pages count it),
// pointsEarned and pointsTotal are what those answers are worth under the exam's points.
async function calculateScore(attempt, exam) {
  const populatedExam = await MockBoardExam.findById(exam._id).populate({
    path: 'questions',
    populate: { path: 'tag' },
  });

  const points = pointsByQuestion(populatedExam);
  let totalScore = 0;
  let pointsEarned = 0;
  let pointsTotal = 0;
  const subjectStats = {};

  populatedExam.questions.forEach((q) => {
    const tagId = q.tag._id.toString();
    if (!subjectStats[tagId]) {
      subjectStats[tagId] = { tag: q.tag._id, correct: 0, total: 0 };
    }
    subjectStats[tagId].total += 1;
    const worth = points.get(q._id.toString()) || DEFAULT_POINTS;
    pointsTotal += worth;

    const correctAns = q.answers.find((a) => a.isCorrect);
    const attemptAnsId = attempt.answers.get(q._id.toString());

    if (correctAns && attemptAnsId && String(attemptAnsId) === String(correctAns._id)) {
      totalScore += 1;
      pointsEarned += worth;
      subjectStats[tagId].correct += 1;
    }
  });

  attempt.score = totalScore;
  attempt.pointsEarned = pointsEarned;
  attempt.pointsTotal = pointsTotal;
  attempt.subjectScores = Object.values(subjectStats);
}

// An attempt's percentage: its share of the points when it was marked with points, else its
// share of the items (attempts marked before points were kept)
function attemptPercentage(attempt, totalItems) {
  if (Number(attempt?.pointsTotal) > 0) {
    return ((Number(attempt.pointsEarned) || 0) / Number(attempt.pointsTotal)) * 100;
  }
  return totalItems > 0 ? ((Number(attempt?.score) || 0) / totalItems) * 100 : 0;
}

// The score to show a taker: points when the attempt was marked with them, else items
function attemptScoreOutOf(attempt, totalItems) {
  if (Number(attempt?.pointsTotal) > 0) {
    return { earned: Number(attempt.pointsEarned) || 0, total: Number(attempt.pointsTotal) };
  }
  return { earned: Number(attempt?.score) || 0, total: totalItems };
}

// ─── Where a taker is in an attempt ─────────────────────────────────────────
// runState keeps what a refresh must not reset: the stop the taker is on (-1 the
// introduction, the question count the summary), the last stop reached (one-way navigation),
// and each question's time left and time spent (question timers).

function questionOrder(attempt) {
  return (attempt.randomizedQuestions || []).map((entry) => String(entry.question));
}

function ensureRunState(attempt) {
  if (!attempt.runState) attempt.runState = {};
  if (!attempt.runState.timeLeftMs) attempt.runState.timeLeftMs = new Map();
  if (!attempt.runState.spentMs) attempt.runState.spentMs = new Map();
  return attempt.runState;
}

const wholeNumber = (value, fallback) => (Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function timeLeftOf(runState, limits, questionId) {
  if (!limits.has(questionId)) return Infinity;
  const stored = runState.timeLeftMs.get(questionId);
  return Number.isFinite(stored) ? stored : limits.get(questionId);
}

// Takes the answers and the place a taker's screen reports, keeping the exam's rules:
// - one way, an answer is final once its question is left, and the taker only moves on from
//   a question that is answered (or out of time)
// - a question out of time keeps the answer it had
// - time left only goes down, and the last stop reached only goes up
// The checks read what was stored before this save, so an answer picked just before a
// question closed still counts.
function applyRunProgress(attempt, exam, { answers, state } = {}, now = new Date()) {
  const order = questionOrder(attempt);
  const indexOf = new Map(order.map((id, index) => [id, index]));
  const limits = timeLimitsMs(exam);
  const oneWay = Boolean(exam.oneWayNavigation);
  const runState = ensureRunState(attempt);
  const storedFurthest = wholeNumber(runState.furthestIdx, 0);

  for (const [questionId, answerId] of Object.entries(answers || {})) {
    if (!indexOf.has(questionId) || !answerId) continue;
    const current = attempt.answers.get(questionId);
    if (current && String(current) === String(answerId)) continue;
    if (oneWay && indexOf.get(questionId) < storedFurthest) continue;
    if (timeLeftOf(runState, limits, questionId) <= 0) continue;
    attempt.answers.set(questionId, answerId);
  }

  if (!state || typeof state !== 'object') return;

  if (limits.size > 0) {
    for (const questionId of order) {
      const limit = limits.get(questionId);
      if (!limit) continue;
      const reportedLeft = Number(state.timeLeftMs?.[questionId]);
      if (Number.isFinite(reportedLeft)) {
        const stored = timeLeftOf(runState, limits, questionId);
        runState.timeLeftMs.set(questionId, clamp(Math.round(reportedLeft), 0, stored));
      }
      const reportedSpent = Number(state.spentMs?.[questionId]);
      if (Number.isFinite(reportedSpent)) {
        const stored = Number(runState.spentMs.get(questionId)) || 0;
        runState.spentMs.set(questionId, clamp(Math.round(reportedSpent), stored, limit));
      }
    }
  } else if (state.spentMs && typeof state.spentMs === 'object') {
    for (const questionId of order) {
      const reportedSpent = Number(state.spentMs[questionId]);
      if (!Number.isFinite(reportedSpent)) continue;
      const stored = Number(runState.spentMs.get(questionId)) || 0;
      runState.spentMs.set(questionId, Math.max(stored, Math.round(reportedSpent)));
    }
  }

  // The last stop reached moves on only past questions that are answered or out of time
  let furthest = clamp(storedFurthest, 0, order.length);
  const reportedFurthest = clamp(wholeNumber(state.furthestIdx, furthest), furthest, order.length);
  while (furthest < reportedFurthest) {
    const questionId = order[furthest];
    const done = Boolean(attempt.answers.get(questionId)) || timeLeftOf(runState, limits, questionId) <= 0;
    if (oneWay && !done) break;
    furthest += 1;
  }
  runState.furthestIdx = furthest;

  let currentIdx = clamp(wholeNumber(state.currentIdx, -1), -1, order.length);
  if (oneWay) currentIdx = Math.min(currentIdx, furthest);
  runState.currentIdx = currentIdx;
  runState.savedAt = now;
  attempt.markModified('runState');
}

// The place a taker's screen starts from (or returns to after a refresh). With question
// timers, the time since the last save is charged to the question that was open, so closing
// the page doesn't stop its clock. Returns whether the attempt changed and needs saving.
function resumeRunState(attempt, exam, now = new Date()) {
  const order = questionOrder(attempt);
  const limits = timeLimitsMs(exam);
  const runState = ensureRunState(attempt);
  let changed = false;

  const currentIdx = clamp(wholeNumber(runState.currentIdx, -1), -1, order.length);
  const furthestIdx = clamp(wholeNumber(runState.furthestIdx, 0), 0, order.length);
  const openId = currentIdx >= 0 && currentIdx < order.length ? order[currentIdx] : null;
  // One way, a question gone back to is only looked at; its time is not running
  const openIsTimed = openId && limits.has(openId) && !(exam.oneWayNavigation && currentIdx < furthestIdx);

  if (openIsTimed && runState.savedAt) {
    const away = now.getTime() - new Date(runState.savedAt).getTime();
    const left = timeLeftOf(runState, limits, openId);
    if (away > 0 && left > 0) {
      runState.timeLeftMs.set(openId, Math.max(0, left - away));
      runState.savedAt = now;
      attempt.markModified('runState');
      changed = true;
    }
  }

  const timeLeftMs = {};
  for (const questionId of order) {
    if (limits.has(questionId)) timeLeftMs[questionId] = timeLeftOf(runState, limits, questionId);
  }
  const spentMs = {};
  for (const [questionId, spent] of runState.spentMs.entries()) spentMs[questionId] = spent;

  return { changed, state: { currentIdx, furthestIdx, timeLeftMs, spentMs } };
}

module.exports = {
  shuffleArray,
  shuffleQuestionsGroupAware,
  calculateScore,
  attemptPercentage,
  attemptScoreOutOf,
  pointsByQuestion,
  timeLimitsMs,
  takerRules,
  applyRunProgress,
  resumeRunState,
};
