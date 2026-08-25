const MockBoardExam = require('../models/MockBoardExam');
const Program = require('../models/Program');

function toIdString(val) {
  if (!val) return '';
  if (typeof val === 'object') {
    if (val._id) return String(val._id).trim();
    if (typeof val.toString === 'function' && val.toString() !== '[object Object]') {
      return val.toString().trim();
    }
  }
  const str = String(val).trim();
  if (str === '[object Object]' || str === 'undefined' || str === 'null') return '';
  return str;
}

function applyDateRangeFilter(query, startRange, endRange) {
  if (!startRange || !endRange) return;

  const start = new Date(startRange);
  const end = new Date(endRange);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return;
  }

  query.$or = [
    { startDateTime: { $gte: start, $lte: end } },
    { endDateTime: { $gte: start, $lte: end } },
    { startDateTime: { $lte: start }, endDateTime: { $gte: end } },
  ];
}

async function getDeanCalendarExams({ departmentId, programId, startRange, endRange }) {
  const query = {};
  const deptId = toIdString(departmentId);
  const pId = toIdString(programId);

  if (deptId) {
    query.department = deptId;
  }

  if (pId && pId !== 'all') {
    query.program = pId;
  }

  applyDateRangeFilter(query, startRange, endRange);

  return MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status passingThreshold targetAudience')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

async function getStudentCalendarExams({ programId }) {
  const now = new Date();
  const pId = toIdString(programId);

  const query = {
    status: { $in: ['published', 'ongoing'] },
    endDateTime: { $gt: now },
  };

  if (pId) {
    query.program = pId;
  }

  return MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

async function getChairCalendarExams({ programId, startRange, endRange }) {
  const query = {};
  const pId = toIdString(programId);

  if (pId && pId !== 'all') {
    query.program = pId;
  }

  applyDateRangeFilter(query, startRange, endRange);

  return MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status passingThreshold targetAudience')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

module.exports = {
  getDeanCalendarExams,
  getChairCalendarExams,
  getStudentCalendarExams,
};
