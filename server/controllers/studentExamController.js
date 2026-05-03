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
    await calculateScore(attempt, exam);
    await attempt.save();
    return true;
  }
  return false;
}

async function getAvailableExams(req, res) {
  try {
    const now = new Date();
    await MockBoardExam.updateMany(
      { status: 'published', endDateTime: { $lt: now } },
      { $set: { status: 'archived' } }
    );

    const exams = await MockBoardExam.find({
      program: req.user.program,
      status: 'published',
      endDateTime: { $gt: now },
    })
      .select('name description startDateTime endDateTime durationMinutes')
      .sort({ startDateTime: 1 });

    res.json({ exams });
  } catch (err) {
    res.status(500).json({ message: err.message });
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
      await attempt.save();
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
    res.status(500).json({ message: err.message });
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
        await attempt.save();

        res.json({ message: 'Progress saved' });
    } catch (err) {
        res.status(500).json({ message: err.message });
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

        await calculateScore(attempt, exam);
        await attempt.save();

        res.json({ message: 'Exam submitted successfully' });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
}

module.exports = {
    getAvailableExams,
    startExam,
    saveProgress,
    submitExam
};
