// How an exam's results are worked out, shared by the results pages (controllers/
// mockExamResultController.js) and the AI overview (services/examOverviewFacts.js), so both
// read the same numbers. Student results are computed once and stored (MockExamResult);
// alumni results are worked out from the attempts each time, from each alumni's highest score.
const { decryptExamQuestions } = require('./encryptionService');
const MockExamResult = require('../models/MockExamResult');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const Tag = require('../models/Tag');
const User = require('../models/User');

function getTotalItemsFromAttempt(attempt, exam) {
  const totalFromSubjects = (attempt.subjectScores || []).reduce(
    (sum, subjectScore) => sum + (subjectScore.total || 0),
    0
  );
  return totalFromSubjects || exam.questions?.length || 0;
}

function getAttemptPercentage(attempt, exam) {
  const totalItems = getTotalItemsFromAttempt(attempt, exam);
  return totalItems > 0 ? (attempt.score / totalItems) * 100 : 0;
}

function pickHighestAttemptByAlumni(attempts, exam) {
  const bestByAlumni = new Map();

  attempts.forEach((attempt) => {
    const alumniId = String(attempt.alumni?._id || attempt.alumni);
    const currentBest = bestByAlumni.get(alumniId);
    if (!currentBest) {
      bestByAlumni.set(alumniId, attempt);
      return;
    }

    const nextPct = getAttemptPercentage(attempt, exam);
    const currentPct = getAttemptPercentage(currentBest, exam);
    const nextSubmittedAt = new Date(attempt.endTime || attempt.updatedAt || attempt.createdAt || 0);
    const currentSubmittedAt = new Date(currentBest.endTime || currentBest.updatedAt || currentBest.createdAt || 0);

    if (nextPct > currentPct || (nextPct === currentPct && nextSubmittedAt > currentSubmittedAt)) {
      bestByAlumni.set(alumniId, attempt);
    }
  });

  return [...bestByAlumni.values()];
}

// A taker this many points or fewer under the threshold "nearly passed"
const NEAR_MISS_POINTS = 5;

// The takers' scores (percentages) as the results page summarizes them. Scores are
// rounded first, as each person's own result is, so a 69.6% passes a 70% threshold
// here and on their result alike
function buildScoreSummary(percentages, passingThreshold) {
  const scores = percentages.map((percentage) => Math.round(percentage));
  const scoreDistribution = Array.from({ length: 10 }, (_, idx) => ({
    min: idx * 10,
    max: idx === 9 ? 100 : idx * 10 + 9,
    below: 0,
    passed: 0,
  }));

  scores.forEach((score) => {
    const range = scoreDistribution[Math.min(9, Math.floor(score / 10))];
    if (score >= passingThreshold) range.passed += 1;
    else range.below += 1;
  });

  return {
    overallAverageScore: percentages.length > 0
      ? Math.round(percentages.reduce((sum, percentage) => sum + percentage, 0) / percentages.length)
      : 0,
    highestScore: scores.length > 0 ? Math.max(...scores) : 0,
    lowestScore: scores.length > 0 ? Math.min(...scores) : 0,
    passedCount: scores.filter((score) => score >= passingThreshold).length,
    nearMissCount: scores.filter(
      (score) => score < passingThreshold && score >= passingThreshold - NEAR_MISS_POINTS
    ).length,
    scoreDistribution,
  };
}

// Alumni who took the exam more than once, and how many of them beat their first score
function buildRetakeSummary(attempts, exam) {
  const attemptsByAlumni = new Map();
  attempts.forEach((attempt) => {
    const alumniId = String(attempt.alumni?._id || attempt.alumni);
    if (!attemptsByAlumni.has(alumniId)) attemptsByAlumni.set(alumniId, []);
    attemptsByAlumni.get(alumniId).push(attempt);
  });

  let retakers = 0;
  let improved = 0;
  attemptsByAlumni.forEach((alumniAttempts) => {
    if (alumniAttempts.length < 2) return;
    retakers += 1;
    const scores = alumniAttempts
      .slice()
      .sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0)
        || new Date(a.endTime || a.createdAt || 0) - new Date(b.endTime || b.createdAt || 0))
      .map((attempt) => Math.round(getAttemptPercentage(attempt, exam)));
    if (Math.max(...scores.slice(1)) > scores[0]) improved += 1;
  });

  return { retakers, improved };
}

// When a student exam closes, the expiry job gives everyone who never took it an empty,
// auto-submitted attempt (score 0). The proctoring stats call such an attempt "missed"
// with this same check, and so do the individual results
function isMissedAttempt(attempt) {
  const answers = attempt.answers instanceof Map
    ? [...attempt.answers.values()]
    : Object.values(attempt.answers || {});
  return attempt.status === 'submitted'
    && Boolean(attempt.autoSubmitted)
    && answers.filter(Boolean).length === 0
    && !(attempt.progressMilestones?.length)
    && !(attempt.violations?.length);
}

// Submitted attempts of student accounts (alumni accounts are left out)
async function findStudentAttempts(examId) {
  const attempts = await StudentExamAttempt.find({ exam: examId, status: 'submitted' })
    .populate('student', 'role');
  return attempts.filter((attempt) => attempt.student && attempt.student.role === 'student');
}

// Exam numbers as the exam details show them: the questions of a set take
// consecutive numbers where the set first appears, in their set order
function numberExamQuestions(questions = []) {
  const numbers = new Map();
  const numberedGroups = new Set();
  let nextNumber = 1;

  questions.forEach((question) => {
    if (!question?._id) return;
    if (!question.groupId) {
      numbers.set(String(question._id), nextNumber++);
      return;
    }

    const groupId = String(question.groupId);
    if (numberedGroups.has(groupId)) return;
    numberedGroups.add(groupId);
    questions
      .filter((member) => member?.groupId && String(member.groupId) === groupId)
      .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
      .forEach((member) => numbers.set(String(member._id), nextNumber++));
  });

  return numbers;
}

// What the faculty result views show of a question, from the live (decrypted) exam question
function getQuestionContent(question, questionNumbers) {
  return {
    questionNumber: questionNumbers.get(String(question._id)) || null,
    description: question.description || '',
    images: question.images || [],
    rationalization: question.rationalization || null,
    groupId: question.groupId ? String(question.groupId) : null,
    groupOrder: Number.isInteger(question.groupOrder) ? question.groupOrder : null,
    groupContext: question.groupContext || null,
    groupContextImages: question.groupContextImages || [],
  };
}

// Fills in the question content a report needs but does not keep. Computed results only store
// the analysis, so images and rationalizations are read from the exam questions each time
function addQuestionContent(subjects = [], examQuestions = []) {
  const questionsById = new Map(examQuestions.map((q) => [String(q._id), q]));
  const questionNumbers = numberExamQuestions(examQuestions);

  subjects.forEach((subject) => {
    (subject.questions || []).forEach((sq) => {
      const originalQ = questionsById.get(String(sq.questionId));
      if (!originalQ) return;

      Object.entries(getQuestionContent(originalQ, questionNumbers)).forEach(([key, value]) => {
        const current = sq[key];
        const isMissing = current === undefined || current === null || current === ''
          || (Array.isArray(current) && current.length === 0);
        if (isMissing) sq[key] = value;
      });
      // Results computed before answer images existed have no image on their answer counts
      (sq.answerCounts || []).forEach((ac) => {
        if (ac.image) return;
        const originalAnswer = (originalQ.answers || []).find((a) => String(a._id) === String(ac.answerId));
        if (originalAnswer?.image) ac.image = originalAnswer.image;
      });
    });
  });

  return subjects;
}

function buildQuestionRates(exam, attempts) {
  const totalTakers = attempts.length;

  return exam.questions.map((question) => {
    const qId = String(question._id);
    const correctOptionId = String(question.answers.find((a) => a.isCorrect)?._id);
    const answerCounts = question.answers.map((answer) => {
      const answerId = String(answer._id);
      const count = attempts.reduce((sum, attempt) => {
        const selectedAnswerId = attempt.answers ? attempt.answers.get(qId) : null;
        return sum + (String(selectedAnswerId || '') === answerId ? 1 : 0);
      }, 0);

      return {
        answerId: answer._id,
        text: answer.text || '',
        image: answer.image || null,
        count,
        isCorrect: !!answer.isCorrect,
      };
    });

    const correctCount = answerCounts.find((answer) => String(answer.answerId) === correctOptionId)?.count || 0;
    const answeredCount = answerCounts.reduce((sum, answer) => sum + answer.count, 0);

    return {
      qId,
      questionId: question._id,
      tagId: String(question.tag),
      label: question.title || question.description || 'Question',
      description: question.description || '',
      correctRate: totalTakers > 0 ? Math.round((correctCount / totalTakers) * 100) : 0,
      answerCounts,
      unansweredCount: Math.max(totalTakers - answeredCount, 0),
      groupId: question.groupId || null,
      groupContext: question.groupContext || null,
      groupContextImages: question.groupContextImages || [],
    };
  });
}

// The results of an alumni exam, from each alumni's highest-scoring attempt. programId keeps
// only that program's alumni (a program chair's view); without it every attempt counts.
async function buildAlumniHighestScoreReport(exam, { programId = null } = {}) {
  const attempts = await AlumniExamAttempt.find({
    exam: exam._id,
    status: 'submitted',
  })
    .populate('alumni', 'program')
    .populate('subjectScores.tag', 'name');

  const scopedAttempts = programId
    ? attempts.filter((attempt) => String(attempt.alumni?.program) === String(programId))
    : attempts;

  const bestAttempts = pickHighestAttemptByAlumni(scopedAttempts, exam);
  if (bestAttempts.length === 0) return null;

  const totalTakers = bestAttempts.length;
  const decryptedExamForAlumni = decryptExamQuestions(exam);
  const questionRates = buildQuestionRates(decryptedExamForAlumni, bestAttempts);

  const tagIds = [...new Set(questionRates.map((qr) => qr.tagId))];
  const tags = await Tag.find({ _id: { $in: tagIds } });

  const subjectsArray = tagIds.map((tagId) => {
    const tag = tags.find((t) => String(t._id) === tagId);
    const subjectQuestions = questionRates.filter((qr) => qr.tagId === tagId);
    const totalRates = subjectQuestions.reduce((acc, qr) => acc + qr.correctRate, 0);
    const averageScore = subjectQuestions.length > 0 ? Math.round(totalRates / subjectQuestions.length) : 0;
    const totalCorrectInAttempts = bestAttempts.reduce((acc, attempt) => {
      const scoreEntry = attempt.subjectScores.find((ss) => String(ss.tag?._id || ss.tag) === tagId);
      return acc + (scoreEntry?.correct || 0);
    }, 0);
    const avgCorrect = Math.round(totalCorrectInAttempts / totalTakers);

    return {
      name: tag ? tag.name : 'Unknown Subject',
      averageScore,
      correctCount: avgCorrect,
      totalItems: subjectQuestions.length,
      questions: subjectQuestions.map((sq) => ({
        questionId: sq.questionId,
        label: sq.label,
        description: sq.description,
        correctRate: sq.correctRate,
        answerCounts: sq.answerCounts,
        unansweredCount: sq.unansweredCount,
        groupId: sq.groupId || null,
        groupContext: sq.groupContext || null,
        groupContextImages: sq.groupContextImages || [],
      })),
    };
  });

  const passingThreshold = exam.passingThreshold ?? 70;
  const scoreSummary = buildScoreSummary(
    bestAttempts.map((attempt) => getAttemptPercentage(attempt, exam)),
    passingThreshold
  );

  const latestSubmittedAt = bestAttempts.reduce((latest, attempt) => {
    const submittedAt = new Date(attempt.endTime || attempt.updatedAt || attempt.createdAt || 0);
    return submittedAt > latest ? submittedAt : latest;
  }, new Date(0));

  const totalEligibleStudents = await User.countDocuments({
    program: exam.program,
    role: 'alumni',
    isActive: true,
  });

  return {
    examId: exam._id,
    examName: exam.name,
    dateConducted: latestSubmittedAt,
    totalTakers,
    totalAttempts: scopedAttempts.length,
    ...scoreSummary,
    retakes: buildRetakeSummary(scopedAttempts, exam),
    totalEligibleStudents,
    passingThreshold,
    status: 'computed',
    computedAt: new Date(),
    targetAudience: 'alumni',
    subjects: addQuestionContent(subjectsArray, decryptedExamForAlumni.questions || []),
  };
}

// A student exam's stored results, or null before they are computed. Results computed before
// the score summary was saved get it from the attempts.
async function loadStudentReport(exam) {
  const resultDoc = await MockExamResult.findOne({ examId: exam._id, department: exam.department }).lean();
  if (!resultDoc) return null;

  if (resultDoc.passedCount === undefined || !resultDoc.scoreDistribution?.length) {
    const attempts = await findStudentAttempts(exam._id);
    const { overallAverageScore, passedCount, nearMissCount, scoreDistribution } = buildScoreSummary(
      attempts.map((attempt) => getAttemptPercentage(attempt, exam)),
      resultDoc.passingThreshold ?? 70
    );
    Object.assign(resultDoc, { overallAverageScore, passedCount, nearMissCount, scoreDistribution });
  }
  return resultDoc;
}

// An exam's results as the Overall view shows them, or null when there are none yet. exam has
// its questions populated (still encrypted). programId limits alumni results to that program's
// alumni, as a program chair sees them.
async function loadExamReport(exam, { programId = null } = {}) {
  if ((exam.targetAudience || 'student') === 'alumni') {
    return buildAlumniHighestScoreReport(exam, { programId });
  }
  const report = await loadStudentReport(exam);
  if (!report) return null;
  addQuestionContent(report.subjects, decryptExamQuestions(exam).questions || []);
  return report;
}

module.exports = {
  NEAR_MISS_POINTS,
  getTotalItemsFromAttempt,
  getAttemptPercentage,
  pickHighestAttemptByAlumni,
  buildScoreSummary,
  buildRetakeSummary,
  isMissedAttempt,
  findStudentAttempts,
  numberExamQuestions,
  getQuestionContent,
  addQuestionContent,
  buildQuestionRates,
  buildAlumniHighestScoreReport,
  loadStudentReport,
  loadExamReport,
};
