const MockBoardExam = require('../models/MockBoardExam');
const Program = require('../models/Program');

function buildStartRangeFilter(startRange, endRange) {
  const range = {};

  if (startRange) {
    const start = new Date(startRange);
    if (Number.isNaN(start.getTime())) {
      throw new Error('Invalid startRange date');
    }
    range.$gte = start;
  }

  if (endRange) {
    const end = new Date(endRange);
    if (Number.isNaN(end.getTime())) {
      throw new Error('Invalid endRange date');
    }
    range.$lte = end;
  }

  return Object.keys(range).length > 0 ? range : null;
}

async function getDeanCalendarExams({ departmentId, programId, startRange, endRange }) {
  const query = { department: departmentId };
  const startDateRange = buildStartRangeFilter(startRange, endRange);

  if (programId && programId !== 'all') {
    const program = await Program.findOne({ _id: programId, department: departmentId }).select('_id').lean();
    if (!program) {
      const error = new Error('Access denied to this program');
      error.statusCode = 403;
      throw error;
    }
    query.program = programId;
  }

  if (startDateRange) {
    query.startDateTime = startDateRange;
  }

  return MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status passingThreshold')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

async function getStudentCalendarExams({ programId }) {
  const now = new Date();

  return MockBoardExam.find({
    program: programId,
    status: { $in: ['published', 'ongoing'] },
    endDateTime: { $gt: now },
  })
    .select('_id name program startDateTime endDateTime status')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

module.exports = {
  getDeanCalendarExams,
  getStudentCalendarExams,
};
