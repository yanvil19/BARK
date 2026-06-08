const express = require('express');
const { protect, authorizeRoles } = require('../middleware/authMiddleware');
const {
  getDeanCalendarExams,
  getStudentCalendarExams,
} = require('../services/calendarService');

const router = express.Router();

router.get('/dean', protect, authorizeRoles('dean'), async (req, res) => {
  try {
    const exams = await getDeanCalendarExams({
      departmentId: req.user.department,
      programId: req.query.programId || req.query.program,
      startRange: req.query.startRange,
      endRange: req.query.endRange,
    });

    res.json({ exams });
  } catch (err) {
    if (err.message === 'Invalid startRange date' || err.message === 'Invalid endRange date') {
      return res.status(400).json({ message: err.message });
    }
    if (err.statusCode === 403) {
      return res.status(403).json({ message: err.message });
    }

    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

router.get('/student', protect, authorizeRoles('student', 'professor', 'program_chair'), async (req, res) => {
  try {
    const exams = await getStudentCalendarExams({
      programId: req.user.program,
    });

    res.json({ exams });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Something went wrong. Please try again later.' });
  }
});

module.exports = router;
