const cron = require('node-cron');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const User = require('../models/User');

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function buildScoreFromQuestions({ questions, answersMap }) {
  let totalScore = 0;
  const subjectStats = new Map(); // tagId -> { tag, correct, total }

  for (const q of questions || []) {
    const tagId = q?.tag ? String(q.tag) : null;
    if (!tagId) continue;

    const prev = subjectStats.get(tagId) || { tag: q.tag, correct: 0, total: 0 };
    prev.total += 1;

    const correctAns = (q.answers || []).find((a) => a && a.isCorrect);
    const picked = answersMap ? answersMap.get(String(q._id)) : undefined;
    if (correctAns && picked && String(picked) === String(correctAns._id)) {
      prev.correct += 1;
      totalScore += 1;
    }

    subjectStats.set(tagId, prev);
  }

  return { totalScore, subjectScores: [...subjectStats.values()] };
}

const startExamExpiryJob = () => {
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      const result = await MockBoardExam.updateMany(
        {
          status: 'published',
          endDateTime: { $lt: now }
        },
        { status: 'finished' }
      );
      if (result.modifiedCount > 0) {
        console.log(`[ExamExpiryJob] ${result.modifiedCount} exam(s) transitioned to finished`);
      }

      const examsToProcess = await MockBoardExam.find({
        status: 'finished',
        endDateTime: { $lt: now },
        $or: [
          { missedAttemptsProcessedAt: null },
          { missedAttemptsProcessedAt: { $exists: false } },
        ],
      })
        .select('_id program department endDateTime')
        .sort({ endDateTime: 1 })
        .limit(10)
        .lean();

      for (const examMeta of examsToProcess) {
        const exam = await MockBoardExam.findById(examMeta._id)
          .populate({
            path: 'questions',
            select: 'tag answers',
          })
          .select('_id program department endDateTime questions')
          .lean();

        if (!exam) continue;

        const learners = await User.find({
          isActive: true,
          role: { $in: ['student', 'alumni'] },
          program: exam.program,
          department: exam.department,
        })
          .select('_id')
          .lean();

        const learnerIds = learners.map((u) => u._id);
        if (learnerIds.length === 0) {
          await MockBoardExam.updateOne(
            { _id: exam._id },
            { $set: { missedAttemptsProcessedAt: new Date() } }
          );
          continue;
        }

        // Existing attempts (any status) so we don't create duplicates.
        const existingAttempts = await StudentExamAttempt.find({
          exam: exam._id,
          student: { $in: learnerIds },
        })
          .select('student status answers')
          .lean();

        const hasAttempt = new Map(); // studentId -> attempt
        for (const att of existingAttempts) {
          hasAttempt.set(String(att.student), att);
        }

        const missingLearnerIds = learnerIds.filter((id) => !hasAttempt.has(String(id)));

        const insertDocs = missingLearnerIds.map((studentId) => {
          const { totalScore, subjectScores } = buildScoreFromQuestions({
            questions: exam.questions,
            answersMap: new Map(),
          });

          return {
            student: studentId,
            exam: exam._id,
            startTime: exam.endDateTime,
            endTime: exam.endDateTime,
            status: 'submitted',
            answers: {},
            randomizedQuestions: [],
            score: totalScore, // will be 0
            subjectScores,
            autoSubmitted: true,
            lateSubmission: false,
            violations: [],
            progressMilestones: [],
          };
        });

        // Auto-submit any lingering in-progress attempts and compute scores.
        const inProgressAttempts = existingAttempts.filter((a) => a.status === 'in_progress');
        for (const att of inProgressAttempts) {
          const answersMap = att.answers instanceof Map ? att.answers : new Map(Object.entries(att.answers || {}));
          const { totalScore, subjectScores } = buildScoreFromQuestions({
            questions: exam.questions,
            answersMap,
          });

          await StudentExamAttempt.updateOne(
            { _id: att._id, status: 'in_progress' },
            {
              $set: {
                status: 'submitted',
                endTime: exam.endDateTime,
                autoSubmitted: true,
                score: totalScore,
                subjectScores,
              },
            }
          );
        }

        // Insert missing attempts in chunks to avoid oversized writes.
        for (const batch of chunk(insertDocs, 500)) {
          if (batch.length === 0) continue;
          await StudentExamAttempt.insertMany(batch, { ordered: false });
        }

        await MockBoardExam.updateOne(
          { _id: exam._id },
          { $set: { missedAttemptsProcessedAt: new Date() } }
        );

        console.log(`[ExamExpiryJob] Processed missed attempts for exam ${exam._id} (created ${insertDocs.length})`);
      }
    } catch (err) {
      console.error('[ExamExpiryJob] Error:', err.message);
    }
  });
};

module.exports = { startExamExpiryJob };
