// Points and time per question in an exam. The exam form sends them, and the exam keeps them,
// one entry per question, because the same question can be worth more in one exam than in another.
// One-way navigation is read here too; it is one switch for the whole exam.

const POINTS_MIN = 1;
const POINTS_MAX = 100;
const SECONDS_MIN = 10;
const SECONDS_MAX = 3600;
const DEFAULT_POINTS = 1;
const DEFAULT_SECONDS = 120;

const POINTS_RULE = `Points must be whole numbers from ${POINTS_MIN} to ${POINTS_MAX}`;
const SECONDS_RULE = 'Question times must be whole seconds, from 10 seconds to 60 minutes';

function isWholeNumberInRange(value, min, max) {
  if (value === null || value === undefined || value === '') return false;
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max;
}

// Reads the settings sent with an exam and lines them up with its questions. A question sent
// without a value takes the exam's default. A bad value is an error only while that setting is on;
// otherwise it is replaced by the default, so a setting that is off can't block a save.
function parseQuestionSettings(body, questionIds) {
  const errors = [];
  const scoringMode = body.scoringMode === 'custom' ? 'custom' : 'equal';
  const questionTimerEnabled = Boolean(body.questionTimerEnabled);
  const usesCustomPoints = scoringMode === 'custom';
  const oneWayNavigation = Boolean(body.oneWayNavigation);
  const oneWayBackAllowed = Boolean(body.oneWayBackAllowed);

  const defaultPointsValid = isWholeNumberInRange(body.defaultQuestionPoints, POINTS_MIN, POINTS_MAX);
  const defaultSecondsValid = isWholeNumberInRange(body.defaultQuestionSeconds, SECONDS_MIN, SECONDS_MAX);
  const defaultQuestionPoints = defaultPointsValid ? Number(body.defaultQuestionPoints) : DEFAULT_POINTS;
  const defaultQuestionSeconds = defaultSecondsValid ? Number(body.defaultQuestionSeconds) : DEFAULT_SECONDS;
  let pointsInvalid = usesCustomPoints && body.defaultQuestionPoints !== undefined && !defaultPointsValid;
  let secondsInvalid = questionTimerEnabled && body.defaultQuestionSeconds !== undefined && !defaultSecondsValid;

  const sentItems = new Map(
    (Array.isArray(body.itemSettings) ? body.itemSettings : [])
      .filter((item) => item && item.question)
      .map((item) => [String(item.question?._id || item.question), item])
  );

  const itemSettings = questionIds.map((questionId) => {
    const item = sentItems.get(String(questionId)) || {};
    const pointsValid = isWholeNumberInRange(item.points, POINTS_MIN, POINTS_MAX);
    const secondsValid = isWholeNumberInRange(item.timeLimitSeconds, SECONDS_MIN, SECONDS_MAX);
    if (item.points !== undefined && !pointsValid) pointsInvalid = pointsInvalid || usesCustomPoints;
    if (item.timeLimitSeconds !== undefined && !secondsValid) secondsInvalid = secondsInvalid || questionTimerEnabled;
    return {
      question: questionId,
      points: pointsValid ? Number(item.points) : defaultQuestionPoints,
      timeLimitSeconds: secondsValid ? Number(item.timeLimitSeconds) : defaultQuestionSeconds,
    };
  });

  if (pointsInvalid) errors.push(POINTS_RULE);
  if (secondsInvalid) errors.push(SECONDS_RULE);

  const totalSeconds = questionTimerEnabled
    ? itemSettings.reduce((sum, item) => sum + item.timeLimitSeconds, 0)
    : 0;

  return {
    errors,
    settings: {
      scoringMode,
      defaultQuestionPoints,
      questionTimerEnabled,
      defaultQuestionSeconds,
      oneWayNavigation,
      oneWayBackAllowed,
      itemSettings,
    },
    totalSeconds,
  };
}

// An exam timed by its questions ends when their time is up, rounded up to the whole minute
function endFromQuestionTimes(start, totalSeconds) {
  return new Date(Math.ceil((start.getTime() + totalSeconds * 1000) / 60000) * 60000);
}

module.exports = {
  POINTS_MIN,
  POINTS_MAX,
  SECONDS_MIN,
  SECONDS_MAX,
  DEFAULT_POINTS,
  DEFAULT_SECONDS,
  parseQuestionSettings,
  endFromQuestionTimes,
};
