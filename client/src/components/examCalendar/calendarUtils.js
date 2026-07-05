import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export function getCalendarRange(date, view) {
  if (view === 'week') {
    return {
      start: startOfWeek(date),
      end: endOfWeek(date),
    };
  }

  return {
    start: startOfWeek(startOfMonth(date)),
    end: endOfWeek(endOfMonth(date)),
  };
}

export function getExamEventColor(status, role) {
  if (role !== 'dean' && role !== 'program_chair') return '#2563eb';

  const colors = {
    draft: '#ca8a04',
    published: '#15803d',
    ongoing: '#2563eb',
    finished: '#6b7280',
    archived: '#374151',
  };

  return colors[status] || '#35408e';
}

export function formatExamDateTime(value) {
  if (!value) return '-';
  return format(new Date(value), 'MMM d, yyyy h:mm a');
}

export function formatExamTime(value) {
  if (!value) return '-';
  return format(new Date(value), 'h:mm a');
}

export function getLearnerExamState(exam, now = new Date()) {
  const start = new Date(exam.startDateTime);
  const end = new Date(exam.endDateTime);

  if (now >= start && now <= end) return 'Currently active';
  return 'Upcoming';
}

export function addConflictFlags(exams) {
  const conflictsById = new Set();

  for (let i = 0; i < exams.length; i += 1) {
    for (let j = i + 1; j < exams.length; j += 1) {
      const first = exams[i];
      const second = exams[j];
      const sameProgram = String(first.program?._id || first.program) === String(second.program?._id || second.program);
      const overlaps =
        new Date(first.startDateTime) < new Date(second.endDateTime) &&
        new Date(first.endDateTime) > new Date(second.startDateTime);

      if (sameProgram && overlaps) {
        conflictsById.add(String(first._id));
        conflictsById.add(String(second._id));
      }
    }
  }

  return exams.map((exam) => ({
    ...exam,
    hasScheduleConflict: conflictsById.has(String(exam._id)),
  }));
}
