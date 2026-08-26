const mongoose = require('mongoose');
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

function buildProgramQuery(pId) {
  if (!pId || pId === 'all') return null;
  if (mongoose.Types.ObjectId.isValid(pId)) {
    return { $in: [pId, new mongoose.Types.ObjectId(pId)] };
  }
  return pId;
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

async function advanceExamStatuses(query = {}) {
  const now = new Date();

  await MockBoardExam.updateMany(
    {
      ...query,
      status: 'published',
      startDateTime: { $lte: now },
      endDateTime: { $gt: now },
    },
    { $set: { status: 'ongoing' } }
  );

  await MockBoardExam.updateMany(
    {
      ...query,
      status: { $in: ['published', 'ongoing'] },
      endDateTime: { $lt: now },
    },
    { $set: { status: 'finished' } }
  );
}

async function getDeanCalendarExams({ departmentId, programId, startRange, endRange }) {
  const query = {};
  const deptId = toIdString(departmentId);
  const pId = toIdString(programId);

  if (deptId) {
    if (mongoose.Types.ObjectId.isValid(deptId)) {
      query.department = { $in: [deptId, new mongoose.Types.ObjectId(deptId)] };
    } else {
      query.department = deptId;
    }
  }

  const programQuery = buildProgramQuery(pId);
  if (programQuery) {
    query.program = programQuery;
  }

  await advanceExamStatuses(query);
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

  const programQuery = buildProgramQuery(pId);
  if (programQuery) {
    query.program = programQuery;
  }

  await advanceExamStatuses(query);

  return MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status')
    .populate('program', 'name')
    .sort({ startDateTime: 1 })
    .lean();
}

async function getChairCalendarExams({ departmentId, programId, startRange, endRange }) {
  const query = {};
  const deptId = toIdString(departmentId);
  const pId = toIdString(programId);

  if (deptId) {
    if (mongoose.Types.ObjectId.isValid(deptId)) {
      query.department = { $in: [deptId, new mongoose.Types.ObjectId(deptId)] };
    } else {
      query.department = deptId;
    }
  }

  const programQuery = buildProgramQuery(pId);
  if (programQuery) {
    query.program = programQuery;
  }

  await advanceExamStatuses(query);
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
