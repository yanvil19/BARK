const User = require('../models/User');
const Department = require('../models/Department');
const Program = require('../models/Program');
const { sendEmail } = require('../utils/emailService');
const { examPublishedTemplate } = require('../emails/templates/examPublishedTemplate');

async function sendExamPublishedAnnouncement({ exam }) {
  if (!exam) return { success: false, reason: 'Missing exam' };

  const programId = exam.program?._id || exam.program;
  const departmentId = exam.department?._id || exam.department;
  if (!programId && !departmentId) return { success: false, reason: 'Missing program/department' };

  const [department, program] = await Promise.all([
    departmentId ? Department.findById(departmentId).select('code name') : null,
    programId ? Program.findById(programId).select('code name') : null,
  ]);

  const baseFilter = {
    role: { $in: ['student', 'alumni'] },
    isActive: true,
    receiveEmails: true,
  };

  // Prefer program-targeted announcements so only the intended students/alumni get notified.
  // Fallback to department-based if program is missing.
  const recipients = await User.find(
    programId
      ? { ...baseFilter, program: programId }
      : { ...baseFilter, department: departmentId }
  ).select('email name receiveEmails program department');

  if (recipients.length === 0) return { success: true, sent: 0, failed: 0 };

  const { subject, html } = examPublishedTemplate({
    examName: exam.name,
    departmentCode: department?.code || '',
    programCode: program?.code || '',
    startDateTime: exam.startDateTime,
    endDateTime: exam.endDateTime,
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
