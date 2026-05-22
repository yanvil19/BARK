function formatDateTime(date) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeDurationMinutes(startDateTime, endDateTime) {
  const start = startDateTime instanceof Date ? startDateTime : new Date(startDateTime);
  const end = endDateTime instanceof Date ? endDateTime : new Date(endDateTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const mins = Math.round((end.getTime() - start.getTime()) / 60000);
  return mins > 0 ? mins : null;
}

function examPublishedTemplate({ examName, departmentCode, programCode, startDateTime, endDateTime }) {
  const durationMinutes = computeDurationMinutes(startDateTime, endDateTime);
  const startLabel = formatDateTime(startDateTime);
  const endLabel = formatDateTime(endDateTime);

  const dept = departmentCode ? ` (${departmentCode})` : '';
  const prog = programCode ? ` • ${programCode}` : '';

  return {
    subject: `New exam published: ${examName}`,
    html: `
      <div style="font-family: Arial, sans-serif; background:#f6f7fb; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:#ffffff; border:1px solid #e6e8f0; border-radius:10px; overflow:hidden;">
          <div style="background:#35408e; color:#fad227; padding:16px 20px; font-weight:800;">
            Exam Published${dept}${prog}
          </div>
          <div style="padding:20px; color:#1f2430;">
            <p style="margin:0 0 10px;">A new mock board exam has been published${programCode ? ` for <strong>${programCode}</strong>` : ''}:</p>
            <p style="margin:0 0 14px; font-size:16px; font-weight:800;">${examName}</p>
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <tr>
                <td style="padding:10px 0; color:#6b7280; width:160px;">Start</td>
                <td style="padding:10px 0; font-weight:700;">${startLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; color:#6b7280;">End</td>
                <td style="padding:10px 0; font-weight:700;">${endLabel}</td>
              </tr>
              <tr>
                <td style="padding:10px 0; color:#6b7280;">Duration</td>
                <td style="padding:10px 0; font-weight:700;">${durationMinutes ? `${durationMinutes} minutes` : '—'}</td>
              </tr>
            </table>
            <p style="margin:14px 0 0; color:#6b7280; font-size:13px;">
              You’re receiving this because you’re enrolled in ${programCode || 'the program'} and have email notifications enabled.
            </p>
          </div>
        </div>
      </div>
    `,
  };
}

module.exports = { examPublishedTemplate };
