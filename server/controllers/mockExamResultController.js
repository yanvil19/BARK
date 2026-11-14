const { decryptExamQuestions } = require('../services/encryptionService');
const MockExamResult = require('../models/MockExamResult');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const User = require('../models/User');
const {
  isMissedAttempt,
  numberExamQuestions,
  getQuestionContent,
  computeStudentResults,
  studentResultsDue,
  ensureStudentResults,
  loadExamReport,
} = require('../services/examResultsReport');
const { markResultsSeen, newResultExamIds } = require('../services/examResultNews');

// Everyone who may take the exam: the active students (or alumni) of its program, the
// same people the results count as eligible. A program chair only sees their program's
async function findEligibleLearners(exam, role, user) {
  if (user.role === 'program_chair' && String(exam.program) !== String(user.program)) return [];
  return User.find({ program: exam.program, role, isActive: true })
    .select('name email studentId alumniId')
    .lean();
}

// An eligible person without a submitted attempt, listed with the ones who have one.
// status is 'in_progress' while they are taking it, 'not_taken' otherwise
function getNotTakenEntry(learner, status) {
  return {
    student: {
      _id: learner._id,
      name: learner.name,
      email: learner.email,
      studentId: learner.studentId || learner.alumniId,
    },
    status,
    overallPercentage: null,
    passed: null,
    subjectBreakdowns: [],
  };
}

// The eligible people missing from the results, with whether they are taking it now
async function listNotTaken(exam, role, user, resultEntries, inProgressIds) {
  const listed = new Set(resultEntries.map((entry) => String(entry.student._id)));
  const inProgress = new Set(inProgressIds.map(String));
  const learners = await findEligibleLearners(exam, role, user);
  return learners
    .filter((learner) => !listed.has(String(learner._id)))
    .map((learner) => getNotTakenEntry(learner, inProgress.has(String(learner._id)) ? 'in_progress' : 'not_taken'));
}

// One person's answer to a question. The question itself is sent once, in `questions`
function getAnswerBreakdown(question, attempt) {
  const qId = String(question._id);
  const answerId = attempt.answers ? attempt.answers.get(qId) : null;
  const correctOptionId = String(question.answers.find((a) => a.isCorrect)?._id);
  const isCorrect = String(answerId) === correctOptionId;

  return {
    questionId: qId,
    userAnswer: answerId ? String(answerId) : null,
    isCorrect,
    points: isCorrect ? 1 : 0,
  };
}

// Every question of the exam with its answer choices, keyed by question id
function buildQuestionContentMap(examQuestions = []) {
  const questionNumbers = numberExamQuestions(examQuestions);
  return Object.fromEntries(examQuestions.map((q) => [String(q._id), {
    ...getQuestionContent(q, questionNumbers),
    answers: (q.answers || []).map((a) => ({
      _id: a._id,
      text: a.text,
      image: a.image || null,
      isCorrect: !!a.isCorrect,
    })),
  }]));
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

    // Subject names feed the page's subject filter and the subject pills on its cards
    const exams = await MockBoardExam.find(examQuery)
      .populate('program', 'name code')
      .populate('createdBy', 'name')
      .populate('subjectTags', 'name')
      .sort({ startDateTime: -1 });

    const resultQuery = { department: req.user.department };
    if (req.user.role === 'program_chair') {
      resultQuery.examId = { $in: exams.map(e => e._id) };
    }

    let results = await MockExamResult.find(resultQuery).select('examId status computedAt');

    // A student exam that is over has its results worked out here if nothing has yet
    const withResults = new Set(results.map((r) => String(r.examId)));
    const due = exams.filter((exam) => !withResults.has(String(exam._id)) && studentResultsDue(exam));
    if (due.length > 0) {
      const made = await Promise.all(due.map((exam) => ensureStudentResults(exam._id)));
      if (made.some(Boolean)) results = await MockExamResult.find(resultQuery).select('examId status computedAt');
    }
    const newIds = await newResultExamIds(req.user);

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
        // Results this person has not opened since they came in
        hasNewResults: newIds.has(String(exam._id)),
      };
    });

    res.json({ exams: examsWithStatus.map(decryptExamQuestions) });
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

    const isAlumni = (exam.targetAudience || 'student') === 'alumni';
    if (!isAlumni) await ensureStudentResults(exam._id);
    const report = await loadExamReport(exam, {
      programId: req.user.role === 'program_chair' ? req.user.program : null,
    });

    if (!report) {
      return res.json({
        result: null,
        message: isAlumni ? 'No alumni attempts found for this exam.' : 'Result not yet computed',
      });
    }

    res.json({ result: report });
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

    // 3. WORK OUT AND STORE (students only — alumni accounts are left out)
    const result = await computeStudentResults(exam, { computedBy: req.user._id, passingThreshold });
    if (!result) {
      return res.status(400).json({
        message: 'No student attempts found for this exam. Cannot compute results.'
      });
    }

    res.json({ result });
  } catch (err) {
    console.error('Computation Error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};

/**
 * @desc    Record that this person has looked at an exam's results (clears its "new" marker)
 * @route   POST /api/mock-exam-results/:examId/seen
 * @access  Private (Dean, Program Chair)
 */
exports.markSeen = async (req, res) => {
  try {
    const examQuery = { _id: req.params.examId, department: req.user.department };
    if (req.user.role === 'program_chair') examQuery.program = req.user.program;
    const exam = await MockBoardExam.findOne(examQuery).select('_id');
    if (!exam) return res.status(403).json({ message: 'Forbidden or exam not found' });

    await markResultsSeen(req.user, exam._id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
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

    // Decrypt all populated question fields before processing
    const decryptedExam = decryptExamQuestions(exam);
    const examQuestions = decryptedExam.questions || [];
    const questionContent = buildQuestionContentMap(examQuestions);
    // Whether the ones who did not take it can still take it
    const examEnded = Boolean(exam.endDateTime) && new Date(exam.endDateTime) < new Date();

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

      // Group attempts by alumni
      const attemptsByAlumni = new Map();
      filteredAttempts.forEach(attempt => {
        const alumniId = String(attempt.alumni._id);
        if (!attemptsByAlumni.has(alumniId)) {
          attemptsByAlumni.set(alumniId, {
            student: {
              _id: attempt.alumni._id,
              name: attempt.alumni.name,
              email: attempt.alumni.email,
              studentId: attempt.alumni.alumniId,
            },
            attempts: []
          });
        }
        attemptsByAlumni.get(alumniId).attempts.push(attempt);
      });

      const passingThreshold = (exam.passingThreshold !== undefined && exam.passingThreshold !== null)
        ? exam.passingThreshold
        : 70;

      const alumniData = Array.from(attemptsByAlumni.values()).map(alumniRecord => {
        // Sort attempts descending by attemptNumber or endTime
        const sortedAttempts = alumniRecord.attempts.sort((a, b) => {
          return new Date(b.endTime || 0) - new Date(a.endTime || 0);
        });

        const formattedAttempts = sortedAttempts.map(attempt => {
          let totalCorrect = 0;
          let totalItems = 0;

          const subjectBreakdowns = attempt.subjectScores.map(ss => {
            totalCorrect += ss.correct;
            totalItems += ss.total;

            const tagIdStr = String(ss.tag._id || ss.tag);
            const subjectQuestions = examQuestions.filter(q => String(q.tag) === tagIdStr);

            const questionBreakdowns = subjectQuestions.map(q => getAnswerBreakdown(q, attempt));

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

          // By points when the attempt was marked with them, else by items
          const overallPercentage = Number(attempt.pointsTotal) > 0
            ? Math.round(((Number(attempt.pointsEarned) || 0) / Number(attempt.pointsTotal)) * 100)
            : (totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0);
          const passed = overallPercentage >= passingThreshold;

          return {
            attemptId: attempt._id,
            attemptNumber: attempt.attemptNumber,
            submittedAt: attempt.endTime,
            overallPercentage,
            passed,
            subjectBreakdowns,
          };
        });

        const bestAttempt = formattedAttempts.reduce(
          (best, a) => a.overallPercentage > best.overallPercentage ? a : best,
          formattedAttempts[0]
        );

        return {
          student: alumniRecord.student,
          status: 'taken',
          attemptCount: formattedAttempts.length,
          attemptNumber: bestAttempt ? bestAttempt.attemptNumber : 1,
          attempts: formattedAttempts,
          overallPercentage: bestAttempt ? bestAttempt.overallPercentage : 0,
          passed: bestAttempt ? bestAttempt.passed : false,
          subjectBreakdowns: bestAttempt ? bestAttempt.subjectBreakdowns : [],
        };
      });

      const alumniInProgress = await AlumniExamAttempt.distinct('alumni', { exam: examId, status: 'in_progress' });
      const alumniNotTaken = await listNotTaken(exam, 'alumni', req.user, alumniData, alumniInProgress);

      return res.json({
        students: [...alumniData, ...alumniNotTaken],
        questions: questionContent,
        audience: 'alumni',
        examEnded,
      });
    }

    // 2. Fetch attempts (students only — exclude alumni accounts)
    // We populate the 'student' to get name, email, studentId, program, and role.
    const attempts = await StudentExamAttempt.find({ exam: examId, status: 'submitted' })
      .populate('student', 'name email studentId alumniId program role')
      .populate('subjectScores.tag', 'name');

    let filteredAttempts = attempts.filter(
      (attempt) => attempt.student && attempt.student.role === 'student' && !isMissedAttempt(attempt)
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
        const subjectQuestions = examQuestions.filter(q => String(q.tag) === tagIdStr);
        
        const questionBreakdowns = subjectQuestions.map(q => getAnswerBreakdown(q, attempt));

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

      // By points when the attempt was marked with them, else by items
          const overallPercentage = Number(attempt.pointsTotal) > 0
            ? Math.round(((Number(attempt.pointsEarned) || 0) / Number(attempt.pointsTotal)) * 100)
            : (totalItems > 0 ? Math.round((totalCorrect / totalItems) * 100) : 0);
      const passed = overallPercentage >= passingThreshold;

      return {
        attemptId: attempt._id,
        student: {
          _id: attempt.student._id,
          name: attempt.student.name,
          email: attempt.student.email,
          studentId: attempt.student.studentId || attempt.student.alumniId,
        },
        status: 'taken',
        overallPercentage,
        passed,
        subjectBreakdowns
      };
    });

    const studentsInProgress = await StudentExamAttempt.distinct('student', { exam: examId, status: 'in_progress' });
    const studentsNotTaken = await listNotTaken(exam, 'student', req.user, studentsData, studentsInProgress);

    res.json({ students: [...studentsData, ...studentsNotTaken], questions: questionContent, examEnded });
  } catch (err) {
    console.error('getStudentResults Error:', err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
};