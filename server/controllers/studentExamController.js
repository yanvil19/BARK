const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const Question = require('../models/Question');
const mongoose = require('mongoose');

// Helper to shuffle arrays
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

const PROGRESS_LOG_THRESHOLDS = [25, 50, 75];

function countAnsweredQuestions(attempt) {
  if (!attempt.answers) return 0;
  if (attempt.answers instanceof Map) {
    return [...attempt.answers.values()].filter(Boolean).length;
  }
  return Object.values(attempt.answers).filter(Boolean).length;
}

function recordProgressMilestones(attempt) {
  const totalQuestions = attempt.randomizedQuestions?.length || 0;
  if (totalQuestions <= 0) return;

  const percent = Math.min(
    100,
    Math.floor((countAnsweredQuestions(attempt) / totalQuestions) * 100),
  );

  if (!attempt.progressMilestones) {
    attempt.progressMilestones = [];
  }

  const loggedPercents = new Set(attempt.progressMilestones.map((m) => m.percent));

  for (const threshold of PROGRESS_LOG_THRESHOLDS) {
    if (percent >= threshold && !loggedPercents.has(threshold)) {
      attempt.progressMilestones.push({
        percent: threshold,
        loggedAt: new Date(),
      });
      loggedPercents.add(threshold);
    }
  }
}

async function calculateScore(attempt, exam) {
  const populatedExam = await MockBoardExam.findById(exam._id).populate({
    path: 'questions',
    populate: { path: 'tag' }
  });

  let totalScore = 0;
  const subjectStats = {};

  populatedExam.questions.forEach(q => {
    const tagId = q.tag._id.toString();
    if (!subjectStats[tagId]) {
      subjectStats[tagId] = { tag: q.tag._id, correct: 0, total: 0 };
    }
    subjectStats[tagId].total += 1;

    const correctAns = q.answers.find(a => a.isCorrect);
    const studentAnsId = attempt.answers.get(q._id.toString());

    if (correctAns && studentAnsId && String(studentAnsId) === String(correctAns._id)) {
      totalScore += 1;
      subjectStats[tagId].correct += 1;
    }
  });

  attempt.score = totalScore;
  attempt.subjectScores = Object.values(subjectStats);
}

async function autoSubmitIfExpired(attempt) {
  const exam = await MockBoardExam.findById(attempt.exam);
  const now = new Date();

  if (now >= exam.endDateTime && attempt.status === 'in_progress') {
    attempt.status = 'submitted';
    attempt.endTime = exam.endDateTime;
    attempt.autoSubmitted = true;
    recordProgressMilestones(attempt);
    await calculateScore(attempt, exam);
    await attempt.save();
    return true;
  }
  return false;
}

async function getAvailableExams(req, res) {
  try {
    const now = new Date();
    const examsToArchive = await MockBoardExam.find({
      status: 'published',
      endDateTime: { $lt: now }
    }).select('_id questions');

    if (examsToArchive.length > 0) {
      const examIds = examsToArchive.map(e => e._id);
      const questionIdsToRetire = examsToArchive.flatMap(e => e.questions);

      if (questionIdsToRetire.length > 0) {
        await Question.updateMany(
          { _id: { $in: questionIdsToRetire } },
          { $set: { state: 'retired' } }
        );
      }

      await MockBoardExam.updateMany(
        { _id: { $in: examIds } },
        { $set: { status: 'finished' } }
      );
    }

    const exams = await MockBoardExam.find({
      program: req.user.program,
      status: 'published',
      endDateTime: { $gt: now },
    })
      .select('name startDateTime endDateTime status program subjectTags questions')
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .sort({ startDateTime: 1 })
      .lean();

    const enriched = exams.map((exam) => {
      const questionCount = exam.questions?.length ?? 0;
      delete exam.questions;

      const durationMinutes =
        exam.startDateTime && exam.endDateTime
          ? Math.round((new Date(exam.endDateTime) - new Date(exam.startDateTime)) / 60000)
          : null;

      let examCardStatus;
      if (!exam.startDateTime || !exam.endDateTime) {
        examCardStatus = 'upcoming';
      } else if (now < new Date(exam.startDateTime)) {
        examCardStatus = 'upcoming';
      } else if ((new Date(exam.endDateTime) - now) / (1000 * 60 * 60) <= 24) {
        examCardStatus = 'closing_soon';
      } else {
        examCardStatus = 'open';
      }

      return { ...exam, durationMinutes, questionCount, examCardStatus };
    });

    res.json({ exams: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function startExam(req, res) {
  try {
    const examId = req.params.id;
    const exam = await MockBoardExam.findById(examId).populate({
      path: 'questions',
      select: 'title description images answers tag',
    });

    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const now = new Date();

    if (now < exam.startDateTime) {
      return res.status(403).json({
        message: 'This exam has not started yet.',
        startsAt: exam.startDateTime,
      });
    }

    if (now >= exam.endDateTime) {
      return res.status(403).json({
        message: 'This exam window has already closed.',
      });
    }

    let attempt = await StudentExamAttempt.findOne({
      student: req.user._id,
      exam: examId,
    });

    if (attempt && attempt.status !== 'in_progress') {
      return res.status(403).json({ message: 'You have already completed this exam.' });
    }

    if (!attempt) {
      const shuffledQuestions = shuffleArray([...exam.questions]);
      const randomizedStructure = shuffledQuestions.map(q => {
        const shuffledAnswers = shuffleArray([...q.answers]);
        return {
          question: q._id,
          answers: shuffledAnswers.map(a => a._id)
        };
      });

      attempt = new StudentExamAttempt({
        student: req.user._id,
        exam: examId,
        startTime: now,
        randomizedQuestions: randomizedStructure,
      });

      try {
        await attempt.save();
      } catch (saveErr) {
        // If a concurrent request already created the attempt, fetch it instead of failing
        if (saveErr.code === 11000) {
          attempt = await StudentExamAttempt.findOne({
            student: req.user._id,
            exam: examId,
            status: 'in_progress'
          });
          if (!attempt) {
            throw new Error('Failed to retrieve concurrent attempt');
          }
        } else {
          throw saveErr; // Rethrow other errors
        }
      }
    }

    if (await autoSubmitIfExpired(attempt)) {
      return res.status(403).json({ message: 'Your exam time has expired and it was automatically submitted.' });
    }

    const remainingTimeSeconds = Math.floor((exam.endDateTime - now) / 1000);

    const responseQuestions = [];
    const qMap = new Map();
    exam.questions.forEach(q => qMap.set(String(q._id), q));

    attempt.randomizedQuestions.forEach(rq => {
      const fullQ = qMap.get(String(rq.question));
      if (fullQ) {
        const mappedAnswers = rq.answers.map(ansId => {
          const fullAns = fullQ.answers.find(a => String(a._id) === String(ansId));
          if (fullAns) {
            return { _id: fullAns._id, text: fullAns.text }; // Exclude isCorrect
          }
          return null;
        }).filter(Boolean);

        responseQuestions.push({
          _id: fullQ._id,
          title: fullQ.title,
          description: fullQ.description,
          images: fullQ.images,
          answers: mappedAnswers
        });
      }
    });

    return res.json({
      attemptId: attempt._id,
      exam: {
        _id: exam._id,
        name: exam.name,
        description: exam.description,
        instructions: exam.instructions
      },
      questions: responseQuestions,
      answers: Object.fromEntries(attempt.answers),
      remainingTimeSeconds,
      endDateTime: exam.endDateTime,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function saveProgress(req, res) {
  try {
    const attemptId = req.params.attemptId;
    const { answers } = req.body;

    const attempt = await StudentExamAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    if (attempt.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const exam = await MockBoardExam.findById(attempt.exam);
    const now = new Date();

    if (now >= exam.endDateTime) {
      await autoSubmitIfExpired(attempt);
      return res.status(403).json({ message: 'Exam window has closed. Your attempt was automatically submitted.' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ message: 'Exam is no longer in progress' });
    }

    for (const [qId, ansId] of Object.entries(answers)) {
      attempt.answers.set(qId, ansId);
    }

    recordProgressMilestones(attempt);
    await attempt.save();

    res.json({ message: 'Progress saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function submitExam(req, res) {
  try {
    const attemptId = req.params.attemptId;

    const attempt = await StudentExamAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    if (attempt.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ message: 'Exam already submitted' });
    }

    const exam = await MockBoardExam.findById(attempt.exam);
    const now = new Date();
    const GRACE_PERIOD_MS = 30000;

    if (now > new Date(exam.endDateTime.getTime() + GRACE_PERIOD_MS)) {
      attempt.lateSubmission = true;
    }

    attempt.status = 'submitted';
    attempt.endTime = now;

    if (req.body.answers) {
      for (const [qId, ansId] of Object.entries(req.body.answers)) {
        attempt.answers.set(qId, ansId);
      }
    }

    recordProgressMilestones(attempt);
    await calculateScore(attempt, exam);
    await attempt.save();

    res.json({ message: 'Exam submitted successfully' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function getMyAttempts(req, res) {
  try {
    const attempts = await StudentExamAttempt.find({
      student: req.user._id,
      status: 'submitted',
    })
      .populate({
        path: 'exam',
        select: 'name resultsReleaseDate questions passingThreshold',
      })
      .populate({
        path: 'subjectScores.tag',
        select: 'name',
      })
      .sort({ startTime: -1 })
      .lean();

    const now = new Date();

    const enrichedAttempts = attempts
      .filter((attempt) => attempt.exam)
      .map((attempt) => {
      const exam = attempt.exam;
      const totalFromSubjects = (attempt.subjectScores || []).reduce(
        (sum, ss) => sum + (ss.total || 0),
        0
      );
      const totalItems = exam?.questions?.length || totalFromSubjects || 0;
      const resultsReleaseDate = exam?.resultsReleaseDate || null;
      const resultsReleased = Boolean(
        resultsReleaseDate && new Date(resultsReleaseDate) <= now
      );
      const threshold = (exam?.passingThreshold !== undefined && exam?.passingThreshold !== null)
        ? exam.passingThreshold
        : 70;

      const durationMinutes = attempt.endTime && attempt.startTime
        ? Math.round((new Date(attempt.endTime) - new Date(attempt.startTime)) / 60000)
        : null;

      const base = {
        id: attempt._id,
        examName: exam.name,
        date: attempt.startTime,
        durationMinutes,
        resultReleasedAt: resultsReleaseDate,
        resultsReleased,
      };

      if (!resultsReleased) {
        return {
          ...base,
          totalItems: null,
          rawScore: null,
          totalScore: null,
          status: null,
          passingThreshold: threshold,
          subjectScores: [],
        };
      }

      const pct = totalItems > 0 ? (attempt.score / totalItems) * 100 : 0;
      let status = 'failed';
      if (pct >= threshold) status = 'passed';
      else if (pct >= threshold - 10) status = 'near_pass';

      return {
        ...base,
        totalItems,
        rawScore: attempt.score,
        totalScore: totalItems,
        status,
        passingThreshold: threshold,
        subjectScores: (attempt.subjectScores || []).map((ss) => ({
          name: ss.tag?.name || 'Unknown Subject',
          correct: ss.correct,
          total: ss.total,
        })),
      };
    });

    res.json({ attempts: enrichedAttempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function logViolation(req, res) {
  try {
    const attemptId = req.params.attemptId;
    const attempt = await StudentExamAttempt.findById(attemptId);

    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    if (attempt.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    attempt.violations.push({
      type: req.body.type || 'suspicious_activity',
      reason: req.body.reason || 'Unknown',
      timestamp: new Date()
    });

    await attempt.save();
    res.json({ message: 'Violation logged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error logging violation' });
  }
}

module.exports = {
  getAvailableExams,
  startExam,
  saveProgress,
  submitExam,
  getMyAttempts,
  logViolation,
};
