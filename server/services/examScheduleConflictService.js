const MockBoardExam = require('../models/MockBoardExam');

async function checkExamScheduleConflict({
  programId,
  startDateTime,
  endDateTime,
  status,
  examId = null,
}) {
  if (!programId || !startDateTime || !endDateTime || !['draft', 'published'].includes(status)) {
    return { hasConflict: false, conflicts: [] };
  }

  const query = {
    program: programId,
    status: { $in: ['draft', 'published'] },
    startDateTime: { $lt: endDateTime },
    endDateTime: { $gt: startDateTime },
  };

  if (examId) {
    query._id = { $ne: examId };
  }

  const conflicts = await MockBoardExam.find(query)
    .select('_id name program startDateTime endDateTime status')
    .populate('program', 'name code')
    .sort({ startDateTime: 1 })
    .lean();

  return {
    hasConflict: conflicts.length > 0,
    conflicts: conflicts.map((exam) => ({
      _id: exam._id,
      name: exam.name,
      program: exam.program
        ? {
            _id: exam.program._id,
            name: exam.program.name,
            code: exam.program.code,
          }
        : null,
      startDateTime: exam.startDateTime,
      endDateTime: exam.endDateTime,
      status: exam.status,
    })),
  };
}

module.exports = { checkExamScheduleConflict };
