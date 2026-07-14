const mongoose = require('mongoose');
const MockExamResult = require('../models/MockExamResult');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const Question = require('../models/Question');
const Tag = require('../models/Tag');
const User = require('../models/User');

function getTotalItemsFromAttempt(attempt, exam) {
  const totalFromSubjects = (attempt.subjectScores || []).reduce(
    (sum, subjectScore) => sum + (subjectScore.total || 0),
    0
  );
  return exam.questions?.length || totalFromSubjects || 0;
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
      label: question.title,
      description: question.description || '',
      correctRate: totalTakers > 0 ? Math.round((correctCount / totalTakers) * 100) : 0,
      answerCounts,
      unansweredCount: Math.max(totalTakers - answeredCount, 0),
    };
  });
}

async function buildAlumniHighestScoreReport(exam, user) {
  const attempts = await AlumniExamAttempt.find({
    exam: exam._id,
    status: 'submitted',
  })
    .populate('alumni', 'program')
    .populate('subjectScores.tag', 'name');

  const scopedAttempts = user.role === 'program_chair'
    ? attempts.filter((attempt) => String(attempt.alumni?.program) === String(user.program))
    : attempts;

  const bestAttempts = pickHighestAttemptByAlumni(scopedAttempts, exam);
  if (bestAttempts.length === 0) return null;

  const totalTakers = bestAttempts.length;
  const questionRates = buildQuestionRates(exam, bestAttempts);

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
      })),
    };
  });

  const percentages = bestAttempts.map((attempt) => getAttemptPercentage(attempt, exam));
  const highestScore = percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0;
  const lowestScore = percentages.length > 0 ? Math.round(Math.min(...percentages)) : 0;
  const totalPercent = percentages.reduce((sum, p) => sum + p, 0);

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
    highestScore,
    lowestScore,
    totalEligibleStudents,
    passingThreshold: exam.passingThreshold ?? 70,
    status: 'computed',
    computedAt: new Date(),
    targetAudience: 'alumni',
    overallAverageScore: Math.round(totalPercent / totalTakers),
    subjects: subjectsArray,
  };
}

/**
 * @desc    Get the list of mock board exams with their computation status
 * @route   GET /api/mock-exam-results/list
 * @access  Private (Dean)
 */
exports.listExamsWithStatus = async (req, res) => {
  try {
    const examQuery = { department: req.user.department };
    if (req.user.role === 'program_chair') {
      examQuery.program = req.user.program;
    }

    const exams = await MockBoardExam.find(examQuery)
      .populate('program', 'name code')
      .sort({ startDateTime: -1 });

    const resultQuery = { department: req.user.department };
    if (req.user.role === 'program_chair') {
      resultQuery.examId = { $in: exams.map(e => e._id) };
    }

    const results = await MockExamResult.find(resultQuery).select('examId status computedAt');

    const alumniAttemptAgg = await AlumniExamAttempt.aggregate([
      {
        $match: {
          exam: { $in: exams.map(e => e._id) },
          status: 'submitted',
        },
      },
      {
        $group: {
          _id: '$exam',
          count: { $sum: 1 },
          computedAt: { $max: '$endTime' },
        },
      },
    ]);
    const alumniAttemptStats = new Map(alumniAttemptAgg.map(item => [String(item._id), item]));

    const examsWithStatus = exams.map(exam => {
      const result = results.find(r => String(r.examId) === String(exam._id));
      const alumniStats = alumniAttemptStats.get(String(exam._id));
      const isAlumniExam = (exam.targetAudience || 'student') === 'alumni';
      return {
        ...exam.toObject(),
        computationStatus: isAlumniExam
          ? (alumniStats ? 'computed' : 'none')
          : (result ? result.status : 'none'),
        computedAt: isAlumniExam
          ? (alumniStats?.computedAt || null)
          : (result ? result.computedAt : null),
        alumniSubmissionCount: alumniStats?.count || 0,
      };
    });

    res.json({ exams: examsWithStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Get the computed result for a specific exam
 * @route   GET /api/mock-exam-results/:examId
 * @access  Private (Dean)
 */
exports.getResult = async (req, res) => {
  try {
    const exam = await MockBoardExam.findOne({
      _id: req.params.examId,
      department: req.user.department,
    }).populate('questions');

    if (!exam) {
      return res.status(403).json({ message: 'Forbidden or exam not found' });
    }

    if ((exam.targetAudience || 'student') === 'alumni') {
      const report = await buildAlumniHighestScoreReport(exam, req.user);
      if (!report) {
        return res.json({ result: null, message: 'No alumni attempts found for this exam.' });
      }
      return res.json({ result: report });
    }

    const result = await MockExamResult.findOne({ 
      examId: req.params.examId,
      department: req.user.department 
    });

    if (!result) {
      return res.json({ result: null, message: 'Result not yet computed' });
    }

    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Compute results for a mock board exam
 * @route   POST /api/mock-exam-results/:examId/compute
 * @access  Private (Dean)
 */
exports.computeResults = async (req, res) => {
  try {
    const { examId } = req.params;
    const { passingThreshold = 70 } = req.body || {};

    // 1. EXAM & DEPARTMENT CHECK
    const exam = await MockBoardExam.findOne({
      _id: examId,
      department: req.user.department
    }).populate('questions');

    if (!exam) {
      return res.status(403).json({ message: 'Forbidden — exam not in your department' });
    }

    // 2. WINDOW CHECK
    if (new Date() < new Date(exam.endDateTime)) {
      return res.status(400).json({ 
        message: 'Exam window is still open. Cannot compute results yet.' 
      });
    }

    // 3. FETCH ATTEMPTS (students only — exclude alumni accounts)
    const rawAttempts = await StudentExamAttempt.find({ 
      exam: examId, 
      status: 'submitted' 
    }).populate('student', 'role');

    const attempts = rawAttempts.filter(
      (a) => a.student && a.student.role === 'student'
    );

    if (attempts.length === 0) {
      return res.status(400).json({ 
        message: 'No student attempts found for this exam. Cannot compute results.' 
      });
    }

    // 4. COMPUTE PER-QUESTION RATES
    const totalTakers = attempts.length;
    const questionRates = buildQuestionRates(exam, attempts);

    // 5. COMPUTE PER-SUBJECT AVERAGES (Average of question rates)
    const tagIds = [...new Set(questionRates.map(qr => qr.tagId))];
    const tags = await Tag.find({ _id: { $in: tagIds } });

    const subjectsArray = tagIds.map(tagId => {
      const tag = tags.find(t => String(t._id) === tagId);
      const subjectQuestions = questionRates.filter(qr => qr.tagId === tagId);
      
      // Calculate avg of question rates
      const totalRates = subjectQuestions.reduce((acc, qr) => acc + qr.correctRate, 0);
      const averageScore = subjectQuestions.length > 0 ? Math.round(totalRates / subjectQuestions.length) : 0;
      
      // Compute avg correct items for the fraction
      const totalCorrectInAttempts = attempts.reduce((acc, attempt) => {
        const scoreEntry = attempt.subjectScores.find(ss => String(ss.tag) === tagId);
        return acc + (scoreEntry?.correct || 0);
      }, 0);
      const avgCorrect = Math.round(totalCorrectInAttempts / totalTakers);
      const totalItems = subjectQuestions.length;

      return {
        name: tag ? tag.name : 'Unknown Subject',
        averageScore,
        correctCount: avgCorrect,
        totalItems,
        questions: subjectQuestions.map(sq => ({
          questionId: sq.questionId,
          label: sq.label,
          description: sq.description,
          correctRate: sq.correctRate,
          answerCounts: sq.answerCounts,
          unansweredCount: sq.unansweredCount,
        }))
      };
    });

    // 6. SAVE OR UPDATE MockExamResult
    const finalThreshold = (exam.passingThreshold !== undefined && exam.passingThreshold !== null) 
      ? exam.passingThreshold 
      : (passingThreshold !== undefined && passingThreshold !== null ? passingThreshold : 70);

    const percentages = attempts.map((attempt) => getAttemptPercentage(attempt, exam));
    const highestScore = percentages.length > 0 ? Math.round(Math.max(...percentages)) : 0;
    const lowestScore = percentages.length > 0 ? Math.round(Math.min(...percentages)) : 0;

    const totalEligibleStudents = await User.countDocuments({
      program: exam.program,
      role: exam.targetAudience === 'alumni' ? 'alumni' : 'student',
      isActive: true,
    });

    const resultData = {
      examId,
      examName: exam.name,
      dateConducted: exam.startDateTime,
      totalTakers,
      highestScore,
      lowestScore,
      totalEligibleStudents,
      passingThreshold: finalThreshold,
      status: 'computed',
      computedAt: new Date(),
      subjects: subjectsArray,
      createdBy: req.user._id,
      department: req.user.department
    };

    const finalResult = await MockExamResult.findOneAndUpdate(
      { examId },
      resultData,
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ result: finalResult });
  } catch (err) {
    console.error('Computation Error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Delete an exam result record
 * @route   DELETE /api/mock-exam-results/:examId
 * @access  Private (Dean)
 */
exports.deleteResult = async (req, res) => {
  try {
    const result = await MockExamResult.findOne({ 
      examId: req.params.examId,
      department: req.user.department 
    });

    if (!result) {
      return res.status(403).json({ message: 'Forbidden or not found' });
    }

    await MockExamResult.deleteOne({ _id: result._id });
    res.json({ message: 'Result record deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Get individual student results for a specific exam
 * @route   GET /api/mock-exam-results/:examId/students
 * @access  Private (Dean, Program Chair)
 */
exports.getStudentResults = async (req, res) => {
  try {
    const { examId } = req.params;

    // 1. Fetch exam to ensure it exists and get its passing threshold and questions
    const exam = await MockBoardExam.findOne({
      _id: examId,
      department: req.user.department
    }).populate('questions').populate('subjectTags', 'name');

    if (!exam) {
      return res.status(403).json({ message: 'Forbidden or exam not found' });
    }

    if ((exam.targetAudience || 'student') === 'alumni') {
      const attempts = await AlumniExamAttempt.find({ exam: examId, status: 'submitted' })
        .populate('alumni', 'name email alumniId program')
        .populate('subjectScores.tag', 'name');

      let filteredAttempts = attempts.filter(attempt => attempt.alumni);

      if (req.user.role === 'program_chair') {
        filteredAttempts = filteredAttempts.filter(
          attempt => String(attempt.alumni.program) === String(req.user.program)
        );
      }

      const bestAttempts = pickHighestAttemptByAlumni(filteredAttempts, exam);
      const attemptCountsByAlumni = filteredAttempts.reduce((counts, attempt) => {
        const alumniId = String(attempt.alumni?._id || attempt.alumni);
        counts.set(alumniId, (counts.get(alumniId) || 0) + 1);
        return counts;
      }, new Map());
      const passingThreshold = (exam.passingThreshold !== undefined && exam.passingThreshold !== null)
        ? exam.passingThreshold
        : 70;

      const alumniData = bestAttempts.map(attempt => {
        let totalCorrect = 0;
        let totalItems = 0;

        const subjectBreakdowns = attempt.subjectScores.map(ss => {
          totalCorrect += ss.correct;
          totalItems += ss.total;

          const tagIdStr = String(ss.tag._id || ss.tag);
          const subjectQuestions = exam.questions.filter(q => String(q.tag) === tagIdStr);

          const questionBreakdowns = subjectQuestions.map(q => {
            const qId = String(q._id);
            const alumniAnswerId = attempt.answers ? attempt.answers.get(qId) : null;
            const correctOptionId = String(q.answers.find(a => a.isCorrect)?._id);
            const isCorrect = String(alumniAnswerId) === correctOptionId;

            return {
              questionId: qId,
              label: q.title || q.description || 'Question',
              isCorrect,
              points: isCorrect ? 1 : 0,
            };
          });

          const percentage = ss.total > 0 ? Math.round((ss.correct / ss.total) * 100) : 0;

          return {
            subjectId: tagIdStr,
            subjectName: ss.tag.name || 'Unknown Subject',
            correct: ss.correct,
            total: ss.total,
            percentage,
            questions: questionBreakdowns,
          };
        });

        const overallPercentage = totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0;
        const passed = overallPercentage >= passingThreshold;

        return {
          attemptId: attempt._id,
          attemptNumber: attempt.attemptNumber,
          attemptCount: attemptCountsByAlumni.get(String(attempt.alumni._id)) || 1,
          submittedAt: attempt.endTime,
          student: {
            _id: attempt.alumni._id,
            name: attempt.alumni.name,
            email: attempt.alumni.email,
            studentId: attempt.alumni.alumniId,
          },
          overallPercentage,
          passed,
          subjectBreakdowns,
        };
      });

      return res.json({ students: alumniData, audience: 'alumni' });
    }

    // 2. Fetch attempts (students only — exclude alumni accounts)
    // We populate the 'student' to get name, email, studentId, program, and role.
    const attempts = await StudentExamAttempt.find({ exam: examId, status: 'submitted' })
      .populate('student', 'name email studentId alumniId program role')
      .populate('subjectScores.tag', 'name');

    let filteredAttempts = attempts.filter(
      (attempt) => attempt.student && attempt.student.role === 'student'
    );

    // Access Control: If program chair, restrict to their program
    if (req.user.role === 'program_chair') {
      filteredAttempts = filteredAttempts.filter(
        attempt => String(attempt.student.program) === String(req.user.program)
      );
    }

    const passingThreshold = (exam.passingThreshold !== undefined && exam.passingThreshold !== null)
      ? exam.passingThreshold 
      : 70;

    // 3. Format the data for the frontend
    const studentsData = filteredAttempts.map(attempt => {
      let totalCorrect = 0;
      let totalItems = 0;
      
      const subjectBreakdowns = attempt.subjectScores.map(ss => {
        totalCorrect += ss.correct;
        totalItems += ss.total;
        
        const tagIdStr = String(ss.tag._id || ss.tag);
        const subjectQuestions = exam.questions.filter(q => String(q.tag) === tagIdStr);
        
        const questionBreakdowns = subjectQuestions.map(q => {
          const qId = String(q._id);
          const studentAnswerId = attempt.answers ? attempt.answers.get(qId) : null;
          const correctOptionId = String(q.answers.find(a => a.isCorrect)?._id);
          const isCorrect = String(studentAnswerId) === correctOptionId;
          
          return {
            questionId: qId,
            label: q.title || q.description || 'Question',
            isCorrect: isCorrect,
            points: isCorrect ? 1 : 0
          };
        });

        const percentage = ss.total > 0 ? Math.round((ss.correct / ss.total) * 100) : 0;
        
        return {
          subjectId: tagIdStr,
          subjectName: ss.tag.name || 'Unknown Subject',
          correct: ss.correct,
          total: ss.total,
          percentage,
          questions: questionBreakdowns
        };
      });

      const overallPercentage = totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0;
      const passed = overallPercentage >= passingThreshold;

      return {
        attemptId: attempt._id,
        student: {
          _id: attempt.student._id,
          name: attempt.student.name,
          email: attempt.student.email,
          studentId: attempt.student.studentId || attempt.student.alumniId,
        },
        overallPercentage,
        passed,
        subjectBreakdowns
      };
    });

    res.json({ students: studentsData });
  } catch (err) {
    console.error('getStudentResults Error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};
