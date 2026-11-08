// The figures an exam's AI overview is written from (see models/ExamAiOverview.js). The server
// works out every number here; Gemini only writes words around them, and the page draws its
// charts and tables from these same figures, so a number shown never comes from the AI.
//
// No names, emails or IDs of people are included, and no question text: questions are known
// only by their exam number, topic and how they were answered.
const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const Program = require('../models/Program');
const Tag = require('../models/Tag');
const {
  NEAR_MISS_POINTS,
  getAttemptPercentage,
  pickHighestAttemptByAlumni,
  buildScoreSummary,
  isMissedAttempt,
  findStudentAttempts,
  loadExamReport,
} = require('./examResultsReport');

// The exams in the progress chart: this one and up to four before it
const TREND_EXAMS = 5;
// Earlier exams looked at to find those with results
const EARLIER_EXAMS_CHECKED = 12;
// Upper and lower groups for telling how a question separates stronger from weaker takers: the
// top and bottom 27% of takers by score, worked out once there are enough takers
const GROUP_SHARE = 0.27;
const MIN_TAKERS_FOR_GROUPS = 12;
// A taker under this score is "far from passing"
const LOW_SCORE = 50;

const TIME_ZONE = 'Asia/Manila';
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: TIME_ZONE });

function formatDay(value) {
  return value ? dayFormat.format(new Date(value)) : null;
}

function getAudience(exam) {
  return exam.targetAudience === 'alumni' ? 'alumni' : 'student';
}

function getThreshold(exam, report) {
  return report?.passingThreshold ?? exam.passingThreshold ?? 70;
}

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// Answer letters as the faculty Questions view shows them: a, b, c… in the stored order
function letterOf(index) {
  return String.fromCharCode(97 + index);
}

function answerOf(attempt, questionId) {
  const answers = attempt.answers;
  if (!answers) return null;
  const value = answers instanceof Map ? answers.get(questionId) : answers[questionId];
  return value ? String(value) : null;
}

// The takers the results count, with what the overview needs of each: their score, answers and
// score per topic. Student exams count every submitted attempt, as computing the results does
// (a student who missed the exam has an empty 0% attempt, marked missed). Alumni exams count each
// alumni's highest-scoring attempt, from the exam's own program.
async function collectTakers(exam) {
  if (getAudience(exam) === 'alumni') {
    const attempts = await AlumniExamAttempt.find({ exam: exam._id, status: 'submitted' })
      .populate('alumni', 'program');
    const ofProgram = attempts.filter((attempt) => String(attempt.alumni?.program) === String(exam.program));
    return pickHighestAttemptByAlumni(ofProgram, exam).map((attempt) => ({
      percentage: getAttemptPercentage(attempt, exam),
      answers: attempt.answers,
      subjectScores: attempt.subjectScores || [],
      missed: false,
    }));
  }

  const attempts = await findStudentAttempts(exam._id);
  return attempts.map((attempt) => ({
    percentage: getAttemptPercentage(attempt, exam),
    answers: attempt.answers,
    subjectScores: attempt.subjectScores || [],
    missed: isMissedAttempt(attempt),
  }));
}

// What stands out in a question's answers. The overview may only flag a question for one of
// these (services/examOverviewContent.js).
function questionSignals(question, takerCount) {
  const signals = [];
  const wrong = question.topWrong;
  if (wrong && wrong.percent > question.correct && wrong.percent >= 25) signals.push('check_key');
  else if (wrong && wrong.percent >= 35) signals.push('shared_mistake');
  if (question.blank >= 15) signals.push('often_skipped');
  if (question.upper !== null && question.lower !== null && question.upper - question.lower <= -10) {
    signals.push('may_be_unclear');
  }
  if (question.correct < 30) signals.push('too_hard');
  if (question.correct >= 95 && takerCount >= 10) signals.push('too_easy');
  return signals;
}

// Every question of the results by exam number: its topic, the share who got it right, the share
// who chose each answer or left it blank, and, with enough takers, how the upper and lower groups
// did on it
function buildQuestionFacts(report, takers) {
  const takerCount = report.totalTakers || 0;
  const ranked = takers.filter((taker) => !taker.missed).sort((a, b) => b.percentage - a.percentage);
  const groupSize = ranked.length >= MIN_TAKERS_FOR_GROUPS ? Math.round(ranked.length * GROUP_SHARE) : 0;
  const upperGroup = groupSize ? ranked.slice(0, groupSize) : [];
  const lowerGroup = groupSize ? ranked.slice(-groupSize) : [];

  const shareCorrect = (group, questionId, correctId) => (
    group.length ? percent(group.filter((taker) => answerOf(taker, questionId) === correctId).length, group.length) : null
  );

  const questions = [];
  (report.subjects || []).forEach((subject) => {
    (subject.questions || []).forEach((question) => {
      if (!question.questionNumber) return;
      const questionId = String(question.questionId);
      const answerCounts = question.answerCounts || [];
      const correctIndex = answerCounts.findIndex((answer) => answer.isCorrect);
      const correctId = correctIndex >= 0 ? String(answerCounts[correctIndex].answerId) : null;

      const answers = {};
      let topWrong = null;
      answerCounts.forEach((answer, index) => {
        const share = percent(answer.count || 0, takerCount);
        answers[letterOf(index)] = share;
        if (!answer.isCorrect && share > 0 && (!topWrong || share > topWrong.percent)) {
          topWrong = { answer: letterOf(index), percent: share };
        }
      });

      const facts = {
        number: question.questionNumber,
        topic: subject.name,
        correct: question.correctRate ?? 0,
        key: correctIndex >= 0 ? letterOf(correctIndex) : null,
        answers,
        blank: percent(question.unansweredCount || 0, takerCount),
        topWrong,
        upper: correctId ? shareCorrect(upperGroup, questionId, correctId) : null,
        lower: correctId ? shareCorrect(lowerGroup, questionId, correctId) : null,
      };
      facts.signals = questionSignals(facts, takerCount);
      questions.push(facts);
    });
  });

  return {
    questions: questions.sort((a, b) => a.number - b.number),
    groups: { size: groupSize, share: groupSize ? Math.round(GROUP_SHARE * 100) : null },
  };
}

// The two topics the takers just under the threshold did worst in, from their own topic scores
async function nearMissWeakestTopics(takers, threshold) {
  const nearMiss = takers.filter((taker) => {
    const score = Math.round(taker.percentage);
    return !taker.missed && score < threshold && score >= threshold - NEAR_MISS_POINTS;
  });
  if (nearMiss.length < 3) return [];

  const totals = new Map();
  nearMiss.forEach((taker) => {
    taker.subjectScores.forEach((entry) => {
      const tagId = String(entry.tag?._id || entry.tag);
      const sum = totals.get(tagId) || { correct: 0, total: 0 };
      sum.correct += entry.correct || 0;
      sum.total += entry.total || 0;
      totals.set(tagId, sum);
    });
  });

  const tags = await Tag.find({ _id: { $in: [...totals.keys()] } }).select('name').lean();
  const names = new Map(tags.map((tag) => [String(tag._id), tag.name]));
  return [...totals.entries()]
    .filter(([tagId, sum]) => sum.total > 0 && names.has(tagId))
    .map(([tagId, sum]) => ({ name: names.get(tagId), score: percent(sum.correct, sum.total) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 2);
}

// The average and pass rate of an earlier alumni exam, worked out from each alumni's best attempt
async function summarizeAlumniExam(exam) {
  const attempts = await AlumniExamAttempt.find({ exam: exam._id, status: 'submitted' })
    .populate('alumni', 'program');
  const best = pickHighestAttemptByAlumni(
    attempts.filter((attempt) => String(attempt.alumni?.program) === String(exam.program)),
    exam
  );
  if (best.length === 0) return null;
  const summary = buildScoreSummary(best.map((attempt) => getAttemptPercentage(attempt, exam)), exam.passingThreshold ?? 70);
  return { takers: best.length, average: summary.overallAverageScore, passRate: percent(summary.passedCount, best.length) };
}

// The program's earlier exams for the same audience that have results, newest first, at most
// TREND_EXAMS - 1 of them, with their average and pass rate
async function findEarlierExams(exam) {
  if (!exam.startDateTime) return [];
  const isAlumni = getAudience(exam) === 'alumni';
  const candidates = await MockBoardExam.find({
    _id: { $ne: exam._id },
    program: exam.program,
    department: exam.department,
    targetAudience: isAlumni ? 'alumni' : { $ne: 'alumni' },
    status: { $ne: 'draft' },
    startDateTime: { $lt: exam.startDateTime },
  })
    .sort({ startDateTime: -1 })
    .limit(EARLIER_EXAMS_CHECKED)
    .select('name startDateTime passingThreshold questions program department targetAudience')
    .lean();

  const earlier = [];
  if (isAlumni) {
    for (const candidate of candidates) {
      if (earlier.length >= TREND_EXAMS - 1) break;
      const summary = await summarizeAlumniExam(candidate);
      if (summary) earlier.push({ exam: candidate, ...summary });
    }
    return earlier;
  }

  const results = await MockExamResult.find({ examId: { $in: candidates.map((candidate) => candidate._id) }, status: 'computed' })
    .select('examId totalTakers passedCount overallAverageScore')
    .lean();
  const byExam = new Map(results.map((result) => [String(result.examId), result]));
  for (const candidate of candidates) {
    if (earlier.length >= TREND_EXAMS - 1) break;
    const result = byExam.get(String(candidate._id));
    // Results computed before the score summary was saved have no average to compare
    if (!result || !result.totalTakers || result.overallAverageScore === undefined) continue;
    earlier.push({
      exam: candidate,
      takers: result.totalTakers,
      average: result.overallAverageScore,
      passRate: percent(result.passedCount || 0, result.totalTakers),
    });
  }
  return earlier;
}

// The previous exam's score per topic, by topic name in lower case
async function previousTopicScores(previousExam) {
  const exam = await MockBoardExam.findById(previousExam._id).populate('questions');
  if (!exam) return new Map();
  const report = await loadExamReport(exam, { programId: exam.program });
  return new Map((report?.subjects || []).map((subject) => [String(subject.name).toLowerCase(), subject.averageScore]));
}

// Which results the overview read: for student exams when they were computed, for alumni exams
// how many attempts were in. When this changes, the overview is out of date.
async function currentBasis(exam) {
  if (getAudience(exam) === 'alumni') {
    return { attempts: await AlumniExamAttempt.countDocuments({ exam: exam._id, status: 'submitted' }) };
  }
  const result = await MockExamResult.findOne({ examId: exam._id }).select('computedAt').lean();
  return { computedAt: result?.computedAt ? new Date(result.computedAt).toISOString() : null };
}

/**
 * The facts of an exam's AI overview. exam is the exam document with its questions populated;
 * report is its results as the Overall view shows them (examResultsReport.loadExamReport).
 */
async function buildOverviewFacts(exam, report) {
  const audience = getAudience(exam);
  const threshold = getThreshold(exam, report);
  const takers = await collectTakers(exam);
  const program = await Program.findById(exam.program).select('name code').lean();

  const takerCount = report.totalTakers || 0;
  const eligible = report.totalEligibleStudents || 0;
  const missed = audience === 'student' ? takers.filter((taker) => taker.missed).length : 0;
  const passed = report.passedCount || 0;
  const average = report.overallAverageScore ?? 0;
  const passRate = percent(passed, takerCount);
  // Far from passing: takers who sat the exam and scored under LOW_SCORE (missed exams are counted as not taken)
  const belowFifty = takers.filter((taker) => !taker.missed && Math.round(taker.percentage) < LOW_SCORE).length;

  const { questions, groups: upperLower } = buildQuestionFacts(report, takers);

  const earlier = await findEarlierExams(exam);
  const previous = earlier[0] || null;
  const previousTopics = previous ? await previousTopicScores(previous.exam) : new Map();

  const topics = (report.subjects || []).map((subject) => {
    const before = previousTopics.get(String(subject.name).toLowerCase());
    return {
      name: subject.name,
      score: subject.averageScore,
      items: subject.totalItems,
      previous: before ?? null,
      change: before === undefined ? null : subject.averageScore - before,
    };
  });

  const trend = earlier.length > 0
    ? [
      ...earlier.slice().reverse().map((entry) => ({
        name: entry.exam.name,
        date: formatDay(entry.exam.startDateTime),
        average: entry.average,
        passRate: entry.passRate,
        takers: entry.takers,
        current: false,
      })),
      { name: exam.name, date: formatDay(exam.startDateTime), average, passRate, takers: takerCount, current: true },
    ]
    : [];

  const releaseDate = exam.resultsReleaseDate && new Date(exam.resultsReleaseDate) > new Date()
    ? formatDay(exam.resultsReleaseDate)
    : null;

  return {
    exam: {
      name: exam.name,
      audience,
      program: program?.name || program?.code || null,
      date: formatDay(exam.startDateTime),
      threshold,
      questionCount: questions.length,
      resultsRelease: releaseDate,
    },
    basis: audience === 'alumni'
      ? { latestAttempt: formatDay(report.dateConducted), attempts: report.totalAttempts || 0 }
      : { computed: formatDay(report.computedAt) },
    summary: {
      takers: takerCount,
      eligible,
      passed,
      passRate,
      average,
      highest: report.highestScore ?? 0,
      lowest: report.lowestScore ?? 0,
      nearMiss: report.nearMissCount || 0,
      belowFifty,
      missed,
      notTaken: missed + Math.max(0, eligible - takerCount),
    },
    retakes: audience === 'alumni' ? (report.retakes || null) : null,
    previous: previous
      ? {
        name: previous.exam.name,
        date: formatDay(previous.exam.startDateTime),
        takers: previous.takers,
        average: previous.average,
        passRate: previous.passRate,
        averageChange: average - previous.average,
        passRateChange: passRate - previous.passRate,
      }
      : null,
    topics,
    questions,
    upperLower,
    groups: {
      nearMiss: {
        count: report.nearMissCount || 0,
        from: threshold - NEAR_MISS_POINTS,
        to: threshold - 1,
        weakestTopics: await nearMissWeakestTopics(takers, threshold),
      },
      belowFifty: { count: belowFifty, under: LOW_SCORE },
      notTaken: { count: missed + Math.max(0, eligible - takerCount) },
    },
    trend,
  };
}

module.exports = { buildOverviewFacts, currentBasis, questionSignals, formatDay };
