const { decryptExamQuestions, decryptQuestion } = require('../services/encryptionService');
const MockBoardExam = require('../models/MockBoardExam');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const { shuffleArray, calculateScore } = require('../utils/examAttemptUtils');
const jwt = require('jsonwebtoken');

const TIME_LIMIT_GRACE_MS = 10 * 1000;

function getTotalItems(exam, attempt) {
  const totalFromSubjects = (attempt.subjectScores || []).reduce(
    (sum, ss) => sum + (ss.total || 0),
    0
  );
  return exam?.questions?.length || totalFromSubjects || 0;
}

function getPassed(score, totalItems, passingThreshold) {
  if (!totalItems) return false;
  return (score / totalItems) * 100 >= passingThreshold;
}

function getTimedDeadline(exam, attempt) {
  if (!exam?.isTimed || !exam?.timeLimitMinutes || !attempt?.startTime) return null;
  return new Date(new Date(attempt.startTime).getTime() + Number(exam.timeLimitMinutes) * 60000);
}

function getRemainingTimeSeconds(exam, attempt) {
  const deadline = getTimedDeadline(exam, attempt);
  if (!deadline) return null;
  return Math.max(0, Math.floor((deadline.getTime() - Date.now()) / 1000));
}

async function submitExpiredTimedAttempt(attempt, exam, deadline) {
  attempt.status = 'submitted';
  attempt.endTime = deadline;
  await calculateScore(attempt, exam);
  await attempt.save();
}

function serializeSubjectScores(subjectScores = []) {
  return subjectScores.map((ss) => ({
    name: ss.tag?.name || 'Unknown Subject',
    correct: ss.correct,
    total: ss.total,
  }));
}

async function getAvailableExams(req, res) {
  try {
    const now = new Date();
    const exams = await MockBoardExam.find({
      program: req.user.program,
      targetAudience: 'alumni',
      status: { $in: ['published', 'ongoing'] },
      $or: [
        { endDateTime: { $gt: now } },
        { endDateTime: null }
      ]
    })
      .select('name status program subjectTags questions passingThreshold targetAudience isTimed timeLimitMinutes startDateTime endDateTime')
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .sort({ updatedAt: -1 })
      .lean();

    const enriched = exams.map((exam) => {
      const questionCount = exam.questions?.length ?? 0;
      delete exam.questions;
      return {
        ...exam,
        questionCount,
        durationMinutes: exam.isTimed ? exam.timeLimitMinutes : null,
        examCardStatus: 'available',
      };
    });

    res.json({ exams: enriched.map(decryptExamQuestions) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function startExam(req, res) {
  try {
    const examId = req.params.id;
    const currentExam = await MockBoardExam.findById(examId).populate({
      path: 'questions',
      select: 'description images answers tag',
    });

    if (!currentExam) return res.status(404).json({ message: 'Exam not found' });
    if (currentExam.targetAudience !== 'alumni') {
      return res.status(403).json({ message: 'This exam is not available for alumni.' });
    }
    const now = new Date();
    if (currentExam.startDateTime && now < currentExam.startDateTime) {
      return res.status(403).json({ message: 'This exam has not started yet.' });
    }
    if (currentExam.endDateTime && now >= currentExam.endDateTime) {
      return res.status(403).json({ message: 'This exam window has already closed.' });
    }
    if (currentExam.status !== 'published' && currentExam.status !== 'ongoing') {
      return res.status(403).json({ message: 'This alumni exam is not published or ongoing.' });
    }
    if (String(currentExam.program) !== String(req.user.program)) {
      return res.status(403).json({ message: 'This exam is not available for your program.' });
    }

    let attempt = await AlumniExamAttempt.findOne({
      alumni: req.user._id,
      exam: examId,
      status: 'in_progress',
    });

    if (attempt) {
      const deadline = getTimedDeadline(currentExam, attempt);
      if (deadline && Date.now() > deadline.getTime() + TIME_LIMIT_GRACE_MS) {
        await submitExpiredTimedAttempt(attempt, currentExam, deadline);
        attempt = null;
      }
    }

    if (!attempt) {
      const attemptNumber = await AlumniExamAttempt.countDocuments({
        alumni: req.user._id,
        exam: examId,
      }) + 1;

      const shuffledQuestions = shuffleArray([...currentExam.questions]);
      const randomizedStructure = shuffledQuestions.map((q) => {
        const shuffledAnswers = shuffleArray([...q.answers]);
        return {
          question: q._id,
          answers: shuffledAnswers.map((a) => a._id),
        };
      });

      attempt = new AlumniExamAttempt({
        alumni: req.user._id,
        exam: examId,
        attemptNumber,
        startTime: new Date(),
        randomizedQuestions: randomizedStructure,
      });

      try {
        await attempt.save();
      } catch (saveErr) {
        if (saveErr.code === 11000) {
          attempt = await AlumniExamAttempt.findOne({
            alumni: req.user._id,
            exam: examId,
            status: 'in_progress',
          });
          if (!attempt) {
            throw new Error('Failed to retrieve concurrent alumni attempt');
          }
        } else {
          throw saveErr;
        }
      }
    }

    const responseQuestions = [];
    const qMap = new Map();
    const decryptedExam = decryptExamQuestions(currentExam);
    decryptedExam.questions.forEach((q) => qMap.set(String(q._id), q));

    attempt.randomizedQuestions.forEach((rq) => {
      const fullQ = qMap.get(String(rq.question));
      if (!fullQ) return;

      const mappedAnswers = rq.answers
        .map((ansId) => {
          const fullAns = fullQ.answers.find((a) => String(a._id) === String(ansId));
          return fullAns ? { _id: fullAns._id, text: fullAns.text } : null;
        })
        .filter(Boolean);

      responseQuestions.push({
        _id: fullQ._id,
        description: fullQ.description,
        images: fullQ.images,
        answers: mappedAnswers,
      });
    });

    return res.json({
      attemptId: attempt._id,
      attemptNumber: attempt.attemptNumber,
      exam: {
        _id: currentExam._id,
        name: currentExam.name,
        description: currentExam.description,
        instructions: currentExam.instructions,
        passingThreshold: currentExam.passingThreshold,
        isTimed: currentExam.isTimed,
        timeLimitMinutes: currentExam.timeLimitMinutes,
      },
      remainingTimeSeconds: getRemainingTimeSeconds(currentExam, attempt),
      questions: responseQuestions,
      answers: Object.fromEntries(attempt.answers),
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

    const attempt = await AlumniExamAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    if (attempt.alumni.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const exam = await MockBoardExam.findById(attempt.exam);
    const deadline = getTimedDeadline(exam, attempt);
    
    if (deadline && Date.now() > deadline.getTime() + TIME_LIMIT_GRACE_MS) {
      await submitExpiredTimedAttempt(attempt, exam, deadline);
      return res.status(403).json({ message: 'Exam window has closed. Your attempt was automatically submitted.' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ message: 'Exam is no longer in progress' });
    }

    if (answers) {
      for (const [qId, ansId] of Object.entries(answers)) {
        attempt.answers.set(qId, ansId);
      }
    }

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
    const attempt = await AlumniExamAttempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });

    if (attempt.alumni.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (attempt.status !== 'in_progress') {
      return res.status(400).json({ message: 'Exam already submitted' });
    }

    const exam = await MockBoardExam.findById(attempt.exam);
    if (!exam || exam.targetAudience !== 'alumni') {
      return res.status(404).json({ message: 'Alumni exam not found' });
    }

    if (req.body.answers) {
      for (const [qId, ansId] of Object.entries(req.body.answers)) {
        attempt.answers.set(qId, ansId);
      }
    }

    const deadline = getTimedDeadline(exam, attempt);
    attempt.status = 'submitted';
    attempt.endTime = deadline && Date.now() > deadline.getTime() ? deadline : new Date();
    await calculateScore(attempt, exam);
    await attempt.save();
    await attempt.populate('subjectScores.tag', 'name');

    const totalItems = getTotalItems(exam, attempt);
    const passingThreshold = exam.passingThreshold ?? 70;

    res.json({
      message: 'Exam submitted successfully',
      score: attempt.score,
      totalItems,
      passed: getPassed(attempt.score, totalItems, passingThreshold),
      passingThreshold,
      attemptNumber: attempt.attemptNumber,
      subjectScores: serializeSubjectScores(attempt.subjectScores),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function getMyAttempts(req, res) {
  try {
    const examId = req.params.examId;
    const exam = await MockBoardExam.findOne({
      _id: examId,
      targetAudience: 'alumni',
      program: req.user.program,
    })
      .select('name questions passingThreshold')
      .lean();

    if (!exam) return res.status(404).json({ message: 'Alumni exam not found' });

    const attempts = await AlumniExamAttempt.find({
      alumni: req.user._id,
      exam: examId,
      status: 'submitted',
    })
      .populate({
        path: 'subjectScores.tag',
        select: 'name',
      })
      .sort({ attemptNumber: -1, startTime: -1 })
      .lean();

    const threshold = exam.passingThreshold ?? 70;
    const totalFromExam = exam.questions?.length || 0;

    const enrichedAttempts = attempts.map((attempt) => {
      const totalFromSubjects = (attempt.subjectScores || []).reduce(
        (sum, ss) => sum + (ss.total || 0),
        0
      );
      const totalItems = totalFromExam || totalFromSubjects || 0;
      const pct = totalItems > 0 ? (attempt.score / totalItems) * 100 : 0;
      const durationMinutes = attempt.endTime && attempt.startTime
        ? Math.round((new Date(attempt.endTime) - new Date(attempt.startTime)) / 60000)
        : null;

      return {
        id: attempt._id,
        examId,
        examName: exam.name,
        attemptNumber: attempt.attemptNumber,
        date: attempt.startTime,
        submittedAt: attempt.endTime,
        durationMinutes,
        totalItems,
        rawScore: attempt.score,
        totalScore: totalItems,
        passed: pct >= threshold,
        status: pct >= threshold ? 'passed' : 'failed',
        passingThreshold: threshold,
        subjectScores: serializeSubjectScores(attempt.subjectScores || []),
      };
    });

    res.json({ attempts: enrichedAttempts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function getDashboardAttempts(req, res) {
  try {
    const attempts = await AlumniExamAttempt.find({
      alumni: req.user._id,
      status: 'submitted',
    })
      .populate({
        path: 'exam',
        select: 'name questions passingThreshold',
      })
      .populate({
        path: 'subjectScores.tag',
        select: 'name',
      })
      .sort({ endTime: -1 })
      .lean();

    const enrichedAttempts = attempts.map((attempt) => {
      const totalFromExam = attempt.exam?.questions?.length || 0;

      const totalFromSubjects = (attempt.subjectScores || []).reduce(
        (sum, ss) => sum + (ss.total || 0),
        0
      );

      const totalItems =
        totalFromExam || totalFromSubjects || 0;

      const threshold =
        attempt.exam?.passingThreshold ?? 70;

      const pct =
        totalItems > 0
          ? (attempt.score / totalItems) * 100
          : 0;

      const durationMinutes =
        attempt.endTime && attempt.startTime
          ? Math.round(
            (new Date(attempt.endTime) -
              new Date(attempt.startTime)) /
            60000
          )
          : null;

      return {
        id: attempt._id,
        examId: attempt.exam?._id,
        examName: attempt.exam?.name || 'Unknown Exam',
        date: attempt.startTime,
        submittedAt: attempt.endTime,
        durationMinutes,
        totalItems,
        rawScore: attempt.score,
        totalScore: totalItems,
        passed: pct >= threshold,
        status: pct >= threshold ? 'passed' : 'failed',
        passingThreshold: threshold,
        subjectScores: serializeSubjectScores(
          attempt.subjectScores || []
        ),
      };
    });

    res.json({ attempts: enrichedAttempts });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Something went wrong. Please try again later.'
    });
  }
}

async function getAttemptDetails(req, res) {
  try {
    const attemptId = req.params.attemptId;
    const attempt = await AlumniExamAttempt.findById(attemptId)
      .populate('exam', 'name questions passingThreshold isTimed timeLimitMinutes')
      .populate('subjectScores.tag', 'name')
      .populate({
        path: 'randomizedQuestions.question',
        select: 'description images answers tag rationalization',
        populate: { path: 'tag', select: 'name' },
      });

    if (!attempt) return res.status(404).json({ message: 'Attempt not found' });
    if (attempt.alumni.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const exam = attempt.exam;
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const questions = [];
    if (attempt.status === 'submitted') {
      attempt.randomizedQuestions.forEach((rq) => {
        const fullQ = decryptQuestion(rq.question);
        if (!fullQ) return;

        const mappedAnswers = rq.answers
          .map((ansId) => {
            const fullAns = fullQ.answers.find((a) => String(a._id) === String(ansId));
            return fullAns ? { _id: fullAns._id, text: fullAns.text, isCorrect: fullAns.isCorrect } : null;
          })
          .filter(Boolean);

        const userAnswer = attempt.answers.get(String(fullQ._id));
        const correctAnswer = mappedAnswers.find(a => a.isCorrect)?._id;

        questions.push({
          _id: fullQ._id,
          description: fullQ.description,
          images: fullQ.images,
          answers: mappedAnswers,
          userAnswer: userAnswer || null,
          correctAnswer: correctAnswer || null,
          subjectName: fullQ.tag?.name || null,
          rationalization: fullQ.rationalization || null,
        });
      });
    }

    const totalFromExam = exam.questions?.length || 0;
    const totalFromSubjects = (attempt.subjectScores || []).reduce(
      (sum, ss) => sum + (ss.total || 0),
      0
    );
    const totalItems = totalFromExam || totalFromSubjects || 0;
    const threshold = exam.passingThreshold ?? 70;
    const pct = totalItems > 0 ? (attempt.score / totalItems) * 100 : 0;
    const durationMinutes = attempt.endTime && attempt.startTime
      ? Math.round((new Date(attempt.endTime) - new Date(attempt.startTime)) / 60000)
      : null;

    res.json({
      attempt: {
        id: attempt._id,
        examId: exam._id,
        examName: exam.name,
        date: attempt.startTime,
        submittedAt: attempt.endTime,
        durationMinutes,
        totalItems,
        rawScore: attempt.score,
        totalScore: totalItems,
        passed: pct >= threshold,
        status: pct >= threshold ? 'passed' : 'failed',
        passingThreshold: threshold,
        subjectScores: serializeSubjectScores(attempt.subjectScores || []),
      },
      questions,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
}

async function getOfflinePackage(req, res) {
  try {
    const now = new Date();
    const exams = await MockBoardExam.find({
      program: req.user.program,
      targetAudience: 'alumni',
      status: { $in: ['published', 'ongoing'] },
      $or: [
        { endDateTime: { $gt: now } },
        { endDateTime: null }
      ]
    })
      .populate({
        path: 'questions',
        select: 'description images answers tag',
      })
      .populate('program', 'name code')
      .populate('subjectTags', 'name')
      .sort({ updatedAt: -1 });

    const imageManifest = new Set();
    const packagedExams = [];

    for (const rawExam of exams) {
      const decrypted = decryptExamQuestions(rawExam);
      const sanitizedQuestions = [];

      for (const q of (decrypted.questions || [])) {
        if (!q) continue;

        if (Array.isArray(q.images)) {
          q.images.forEach((img) => {
            if (img) imageManifest.add(img);
          });
        }

        // Shuffle answers once for offline package and strip isCorrect
        const shuffledAnswers = shuffleArray([...(q.answers || [])]).map((a) => ({
          _id: a._id,
          text: a.text,
        }));

        sanitizedQuestions.push({
          _id: q._id,
          description: q.description,
          images: q.images || [],
          answers: shuffledAnswers,
          tag: q.tag ? { _id: q.tag._id || q.tag, name: q.tag.name } : null,
        });
      }

      packagedExams.push({
        _id: decrypted._id,
        name: decrypted.name,
        description: decrypted.description,
        instructions: decrypted.instructions,
        passingThreshold: decrypted.passingThreshold ?? 70,
        isTimed: decrypted.isTimed,
        timeLimitMinutes: decrypted.timeLimitMinutes,
        startDateTime: decrypted.startDateTime,
        endDateTime: decrypted.endDateTime,
        program: decrypted.program,
        subjectTags: decrypted.subjectTags,
        questions: sanitizedQuestions,
        questionCount: sanitizedQuestions.length,
      });
    }

    const offlineSyncTicket = jwt.sign(
      {
        id: req.user._id,
        role: req.user.role,
        program: req.user.program,
        type: 'offline_sync',
      },
      process.env.JWT_SECRET,
      { expiresIn: '14d' }
    );

    res.json({
      exams: packagedExams,
      imageManifest: Array.from(imageManifest),
      offlineSyncTicket,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('getOfflinePackage error:', err);
    res.status(500).json({ message: 'Failed to generate offline package.' });
  }
}

async function syncOfflineAttempt(req, res) {
  try {
    const {
      clientAttemptId,
      examId,
      answers = {},
      startTime,
      endTime,
      elapsedDurationSeconds,
    } = req.body;

    if (!examId) {
      return res.status(400).json({ message: 'examId is required' });
    }

    // Step 1: Idempotency Check (Pre-assignment)
    if (clientAttemptId) {
      const existing = await AlumniExamAttempt.findOne({ clientAttemptId });
      if (existing) {
        const exam = await MockBoardExam.findById(existing.exam);
        const totalItems = getTotalItems(exam, existing);
        const passingThreshold = exam?.passingThreshold ?? 70;
        await existing.populate('subjectScores.tag', 'name');
        return res.json({
          message: 'Attempt already synced',
          attemptId: existing._id,
          attemptNumber: existing.attemptNumber,
          score: existing.score,
          totalItems,
          passed: getPassed(existing.score, totalItems, passingThreshold),
          passingThreshold,
          subjectScores: serializeSubjectScores(existing.subjectScores),
        });
      }
    }

    // Validate exam
    const exam = await MockBoardExam.findById(examId);
    if (!exam || exam.targetAudience !== 'alumni') {
      return res.status(404).json({ message: 'Alumni exam not found' });
    }

    // Step 2: Check for existing in_progress attempt for this user & exam
    let attempt = await AlumniExamAttempt.findOne({
      alumni: req.user._id,
      exam: examId,
      status: 'in_progress',
    });

    if (attempt) {
      // Reconcile and finalize existing in_progress attempt
      if (answers) {
        for (const [qId, ansId] of Object.entries(answers)) {
          attempt.answers.set(String(qId), ansId);
        }
      }
      if (clientAttemptId) attempt.clientAttemptId = clientAttemptId;
      attempt.isOfflineSubmission = true;
      if (elapsedDurationSeconds !== undefined) {
        attempt.elapsedDurationSeconds = elapsedDurationSeconds;
      }
      attempt.endTime = endTime ? new Date(endTime) : new Date();
      attempt.status = 'submitted';

      await calculateScore(attempt, exam);
      await attempt.save();
    } else {
      // Step 3: Sequential Attempt Assignment (New Submissions Only)
      const attemptNumber =
        (await AlumniExamAttempt.countDocuments({
          alumni: req.user._id,
          exam: examId,
        })) + 1;

      attempt = new AlumniExamAttempt({
        alumni: req.user._id,
        exam: examId,
        attemptNumber,
        startTime: startTime ? new Date(startTime) : new Date(),
        endTime: endTime ? new Date(endTime) : new Date(),
        status: 'submitted',
        clientAttemptId: clientAttemptId || undefined,
        isOfflineSubmission: true,
        elapsedDurationSeconds: elapsedDurationSeconds ?? null,
        answers: {},
      });

      if (answers) {
        for (const [qId, ansId] of Object.entries(answers)) {
          attempt.answers.set(String(qId), ansId);
        }
      }

      await calculateScore(attempt, exam);
      try {
        await attempt.save();
      } catch (saveErr) {
        if (saveErr.code === 11000 && clientAttemptId) {
          const concurrent = await AlumniExamAttempt.findOne({ clientAttemptId });
          if (concurrent) {
            await concurrent.populate('subjectScores.tag', 'name');
            const totalItems = getTotalItems(exam, concurrent);
            const passingThreshold = exam.passingThreshold ?? 70;
            return res.json({
              message: 'Attempt already synced',
              attemptId: concurrent._id,
              attemptNumber: concurrent.attemptNumber,
              score: concurrent.score,
              totalItems,
              passed: getPassed(concurrent.score, totalItems, passingThreshold),
              passingThreshold,
              subjectScores: serializeSubjectScores(concurrent.subjectScores),
            });
          }
        }
        throw saveErr;
      }
    }

    await attempt.populate('subjectScores.tag', 'name');
    const totalItems = getTotalItems(exam, attempt);
    const passingThreshold = exam.passingThreshold ?? 70;

    return res.json({
      message: 'Offline exam attempt synced successfully',
      attemptId: attempt._id,
      attemptNumber: attempt.attemptNumber,
      score: attempt.score,
      totalItems,
      passed: getPassed(attempt.score, totalItems, passingThreshold),
      passingThreshold,
      subjectScores: serializeSubjectScores(attempt.subjectScores),
    });
  } catch (err) {
    console.error('syncOfflineAttempt error:', err);
    res.status(500).json({ message: 'Something went wrong while syncing offline attempt.' });
  }
}

module.exports = {
  getAvailableExams,
  startExam,
  saveProgress,
  submitExam,
  getMyAttempts,
  getDashboardAttempts,
  getAttemptDetails,
  getOfflinePackage,
  syncOfflineAttempt,
};
