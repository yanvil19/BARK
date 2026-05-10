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
    const exams = await MockBoardExam.find({ 
      department: req.user.department 
    }).sort({ startDateTime: -1 });

    const results = await MockExamResult.find({ 
      department: req.user.department 
    }).select('examId status computedAt');

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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
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

    // 1. DUPLICATE CHECK
    const existing = await MockExamResult.findOne({ examId, status: 'computed' });
    if (existing) {
      return res.status(409).json({
        message: 'Results already computed for this exam.',
        resultId: existing._id
      });
    }

    // 2. EXAM & DEPARTMENT CHECK
    const exam = await MockBoardExam.findOne({
      _id: examId,
      department: req.user.department
    }).populate('questions');

    if (!exam) {
      return res.status(403).json({ message: 'Forbidden — exam not in your department' });
    }

    // 3. WINDOW CHECK
    if (new Date() < new Date(exam.endDateTime)) {
      return res.status(400).json({ 
        message: 'Exam window is still open. Cannot compute results yet.' 
      });
    }

    // 4. FETCH ATTEMPTS
    const attempts = await StudentExamAttempt.find({ 
      exam: examId, 
      status: 'submitted' 
    });

    if (attempts.length === 0) {
      return res.status(400).json({ 
        message: 'No student attempts found for this exam. Cannot compute results.' 
      });
    }

    // 5. COMPUTE PER-QUESTION RATES
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

    // 6. COMPUTE PER-SUBJECT AVERAGES (Average of question rates)
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

    // 7. SAVE OR UPDATE MockExamResult
    const resultData = {
      examId,
      examName: exam.name,
      dateConducted: exam.startDateTime,
      totalTakers,
      passingThreshold: 70, // Or pull from program/exam config
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
    res.status(500).json({ message: err.message });
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
    res.status(500).json({ message: err.message });
  }
};
