const User = require('../models/User');
const Program = require('../models/Program');
const { sendEmail } = require('../utils/emailService');
const { examAnnouncementTemplate } = require('../emails/templates/examAnnouncementTemplate');

async function sendExamPublishedAnnouncement({ exam }) {
  if (!exam) return { success: false, reason: 'Missing exam' };

  const programId = exam.program?._id || exam.program;
  if (!programId) return { success: false, reason: 'Missing program' };

  const program = await Program.findById(programId).select('name code');
  if (!program) return { success: false, reason: 'Program not found' };

  // Query for all users in the program with eligible roles who have email notifications enabled
  const recipients = await User.find({
    program: programId,
    role: { $in: ['student', 'alumni', 'professor', 'program_chair', 'dean'] },
    isActive: true,
    receiveEmails: true,
  }).select('email name');

  if (recipients.length === 0) return { success: true, sent: 0, failed: 0 };

  const durationMinutes = exam.startDateTime && exam.endDateTime
    ? Math.round((exam.endDateTime.getTime() - exam.startDateTime.getTime()) / 60000)
    : 0;

  const totalQuestions = exam.questions ? exam.questions.length : 0;

  const { subject, html } = examAnnouncementTemplate({
    examTitle: exam.name,
    programName: program.name,
    startDateTime: exam.startDateTime,
    endDateTime: exam.endDateTime,
    durationMinutes,
    totalQuestions,
  });

  let sent = 0;
  let failed = 0;
  const batchSize = 10;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((u) =>
        sendEmail({ to: u.email, subject, html, user: u })
      )
    );
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value && r.value.success) sent += 1;
      else failed += 1;
    }
  }

  return { success: true, sent, failed };
}

module.exports = { sendExamPublishedAnnouncement };
