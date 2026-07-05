const mongoose = require('mongoose');
const MockExamResult = require('../models/MockExamResult');
const MockBoardExam = require('../models/MockBoardExam');
const StudentExamAttempt = require('../models/StudentExamAttempt');
const Question = require('../models/Question');
const Tag = require('../models/Tag');

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

    const examsWithStatus = exams.map(exam => {
      const result = results.find(r => String(r.examId) === String(exam._id));
      return {
        ...exam.toObject(),
        computationStatus: result ? result.status : 'none',
        computedAt: result ? result.computedAt : null
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

    // 3. FETCH ATTEMPTS
    const attempts = await StudentExamAttempt.find({ 
      exam: examId, 
      status: 'submitted' 
    });

    if (attempts.length === 0) {
      return res.status(400).json({ 
        message: 'No student attempts found for this exam. Cannot compute results.' 
      });
    }

    // 4. COMPUTE PER-QUESTION RATES
    const totalTakers = attempts.length;
    const questionRates = []; // { qId, tagId, correctRate, label }

    for (const question of exam.questions) {
      let correctCount = 0;
      const qId = String(question._id);
      const correctOptionId = String(question.answers.find(a => a.isCorrect)?._id);

      attempts.forEach(attempt => {
        const studentAnswerId = String(attempt.answers.get(qId));
        if (studentAnswerId === correctOptionId) {
          correctCount++;
        }
      });

      // Division by zero guard & Math.round
      const correctRate = totalTakers > 0 ? Math.round((correctCount / totalTakers) * 100) : 0;
      
      questionRates.push({
        qId,
        tagId: String(question.tag),
        label: question.title,
        correctRate
      });
    }

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
          label: sq.label,
          correctRate: sq.correctRate
        }))
      };
    });

    // 6. SAVE OR UPDATE MockExamResult
    const finalThreshold = (exam.passingThreshold !== undefined && exam.passingThreshold !== null) 
      ? exam.passingThreshold 
      : (passingThreshold !== undefined && passingThreshold !== null ? passingThreshold : 70);

    const resultData = {
      examId,
      examName: exam.name,
      dateConducted: exam.startDateTime,
      totalTakers,
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

    // 2. Fetch attempts
    // We populate the 'student' to get name, email, studentId, program.
    const attempts = await StudentExamAttempt.find({ exam: examId, status: 'submitted' })
      .populate('student', 'name email studentId alumniId program')
      .populate('subjectScores.tag', 'name');

    let filteredAttempts = attempts.filter(attempt => attempt.student);

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
