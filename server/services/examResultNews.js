// Which exam results are new to a dean or program chair: the navbar badge on Exam Results and
// the marker on its cards.
// - A student exam's results are new from the moment the exam ends (they are worked out then).
// - An alumni exam's results are new each time an alumni submits an attempt.
// They stop being new when the person opens that exam's results.
const MockBoardExam = require('../models/MockBoardExam');
const MockExamResult = require('../models/MockExamResult');
const AlumniExamAttempt = require('../models/AlumniExamAttempt');
const ExamResultsSeen = require('../models/ExamResultsSeen');

// This person's record, started now if they have none
async function loadSeen(user) {
  return ExamResultsSeen.findOneAndUpdate(
    { user: user._id },
    { $setOnInsert: { since: new Date() } },
    { upsert: true, returnDocument: 'after' }
  ).lean();
}

// The ids (as strings) of the exams whose results came in after this person last looked
async function newResultExamIds(user) {
  if (!user?.department || !['dean', 'program_chair'].includes(user.role)) return new Set();
  if (user.role === 'program_chair' && !user.program) return new Set();

  const seen = await loadSeen(user);
  const since = new Date(seen.since);
  const now = new Date();

  const examQuery = { department: user.department, status: { $ne: 'draft' } };
  if (user.role === 'program_chair') examQuery.program = user.program;
  const exams = await MockBoardExam.find(examQuery).select('_id targetAudience endDateTime').lean();

  const isAlumniExam = (exam) => (exam.targetAudience || 'student') === 'alumni';
  // Only what happened after the record began can be new
  const endedStudentExams = exams.filter((exam) => (
    !isAlumniExam(exam) && exam.endDateTime && exam.endDateTime > since && exam.endDateTime <= now
  ));
  const alumniExamIds = exams.filter(isAlumniExam).map((exam) => exam._id);

  const [withResults, alumniLatest] = await Promise.all([
    endedStudentExams.length > 0
      ? MockExamResult.distinct('examId', { examId: { $in: endedStudentExams.map((exam) => exam._id) } })
      : [],
    alumniExamIds.length > 0
      ? AlumniExamAttempt.aggregate([
        { $match: { exam: { $in: alumniExamIds }, status: 'submitted', endTime: { $gt: since } } },
        { $group: { _id: '$exam', latest: { $max: '$endTime' } } },
      ])
      : [],
  ]);

  const lastSeen = (examId) => {
    const at = seen.exams?.[String(examId)];
    return at ? new Date(at) : since;
  };

  const fresh = new Set();
  const ready = new Set(withResults.map(String));
  endedStudentExams.forEach((exam) => {
    if (ready.has(String(exam._id)) && exam.endDateTime > lastSeen(exam._id)) fresh.add(String(exam._id));
  });
  alumniLatest.forEach((entry) => {
    if (entry.latest > lastSeen(entry._id)) fresh.add(String(entry._id));
  });
  return fresh;
}

async function markResultsSeen(user, examId) {
  const now = new Date();
  await ExamResultsSeen.updateOne(
    { user: user._id },
    { $set: { [`exams.${String(examId)}`]: now }, $setOnInsert: { since: now } },
    { upsert: true }
  );
}

module.exports = { newResultExamIds, markResultsSeen };
