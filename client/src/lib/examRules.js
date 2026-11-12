// An exam's points, question timers and one-way navigation, read the way the server keeps them
// (MockBoardExam's scoringMode, questionTimerEnabled, oneWayNavigation, the defaults and
// itemSettings), and the score they give.
// The test run uses these; they are written for the student and alumni runners too.

const DEFAULT_POINTS = 1;
const DEFAULT_SECONDS = 120;

const questionKey = (question) => String(question?._id ?? question);

// Each question's points and time in the exam. With custom points off every question is worth
// 1 point; with the timer off a question has no time of its own (seconds is null).
export function readQuestionRules(exam, questions = exam?.questions || []) {
  const usesCustomPoints = exam?.scoringMode === 'custom';
  const usesQuestionTimer = Boolean(exam?.questionTimerEnabled);
  const defaultPoints = Number(exam?.defaultQuestionPoints) || DEFAULT_POINTS;
  const defaultSeconds = Number(exam?.defaultQuestionSeconds) || DEFAULT_SECONDS;
  const items = new Map(
    (exam?.itemSettings || [])
      .filter((item) => item && item.question)
      .map((item) => [questionKey(item.question), item])
  );

  const byQuestion = new Map();
  for (const question of questions) {
    const id = questionKey(question);
    const item = items.get(id) || {};
    byQuestion.set(id, {
      points: usesCustomPoints ? Number(item.points) || defaultPoints : DEFAULT_POINTS,
      seconds: usesQuestionTimer ? Number(item.timeLimitSeconds) || defaultSeconds : null,
    });
  }

  let totalPoints = 0;
  let totalSeconds = 0;
  for (const rule of byQuestion.values()) {
    totalPoints += rule.points;
    totalSeconds += rule.seconds || 0;
  }

  return {
    usesCustomPoints,
    usesQuestionTimer,
    // One question at a time, in order, each answered before the next opens. allowBack lets the
    // taker look at the questions already answered, read-only, but never jump ahead
    oneWay: Boolean(exam?.oneWayNavigation),
    allowBack: Boolean(exam?.oneWayNavigation) && Boolean(exam?.oneWayBackAllowed),
    totalPoints,
    totalSeconds,
    of: (question) => byQuestion.get(questionKey(question)) || { points: DEFAULT_POINTS, seconds: null },
  };
}

// The score an attempt gets: a right answer earns the question's points, anything else none.
// Passing is the share of points at or above the exam's passing threshold, as on the server.
export function scoreAttempt(questions, answers, rules, passingThreshold = 70) {
  const byQuestion = new Map();
  let earnedPoints = 0;
  let correctCount = 0;
  let blankCount = 0;

  for (const question of questions) {
    const id = questionKey(question);
    const { points } = rules.of(question);
    const selected = answers[id];
    const correct = (question.answers || []).find((answer) => answer.isCorrect);
    const answered = Boolean(selected);
    const isCorrect = answered && correct && String(selected) === String(correct._id);
    if (isCorrect) {
      correctCount += 1;
      earnedPoints += points;
    }
    if (!answered) blankCount += 1;
    byQuestion.set(id, { answered, isCorrect: Boolean(isCorrect), earned: isCorrect ? points : 0, points });
  }

  const totalPoints = rules.totalPoints;
  const percent = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
  const threshold = Number.isFinite(Number(passingThreshold)) ? Number(passingThreshold) : 70;

  return {
    earnedPoints,
    totalPoints,
    percent,
    passed: percent >= threshold,
    passingThreshold: threshold,
    correctCount,
    blankCount,
    wrongCount: questions.length - correctCount - blankCount,
    of: (question) => byQuestion.get(questionKey(question)),
  };
}

// 42:07 under an hour, 1:05:09 from an hour up
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// When a clock turns to its warning colour: a question's in its last quarter (5 to 30 seconds);
// the exam's in its last tenth (1 to 5 minutes), but never before its last quarter, so a short
// exam doesn't start in warning
export function questionTimeIsLow(secondsLeft, limitSeconds) {
  return secondsLeft <= Math.max(5, Math.min(30, Math.round(limitSeconds * 0.25)));
}

export function examTimeIsLow(secondsLeft, limitSeconds) {
  const warnAt = Math.min(Math.max(60, limitSeconds * 0.1), 300, limitSeconds * 0.25);
  return secondsLeft <= Math.round(warnAt);
}

// The question to open when the open one's time runs out: the next one with time left, going
// round to the start; -1 when every question's time is up
export function nextOpenQuestion(questions, fromIdx, isLocked) {
  for (let step = 1; step <= questions.length; step += 1) {
    const index = (fromIdx + step) % questions.length;
    if (!isLocked(questions[index])) return index;
  }
  return -1;
}
