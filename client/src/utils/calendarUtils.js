import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  startOfDay,
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

export function abbreviateExamTitle(title) {
  if (!title || typeof title !== 'string') return title || '';

  return title
    .replace(/\bPost[\s\-_]*Test\b\s*/gi, 'PT')
    .replace(/\bPre[\s\-_]*Test\b\s*/gi, 'PrT')
    .replace(/\bDiagnostic[\s\-_]*Test\b\s*/gi, 'DT')
    .replace(/\bMock[\s\-_]*Board[\s\-_]*Exam\b\s*/gi, 'MBE')
    .replace(/\bPractice[\s\-_]*Test\b\s*/gi, 'PT')
    .trim();
}

export function formatExamDateTime(value) {
  if (!value) return '-';
  return format(new Date(value), 'MMM d, yyyy h:mm a');
}

export function formatExamTimeRange(exam) {
  const start = new Date(exam.startDateTime);
  const end = new Date(exam.endDateTime);

  if (isSameDay(start, end)) return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
  return `${format(start, 'MMM d, h:mm a')} – ${format(end, 'MMM d, h:mm a')}`;
}

// Exams whose schedule touches the day; multi-day alumni windows show on every day they cover
export function getExamsForDay(exams, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  return exams.filter((exam) => {
    if (!exam.startDateTime || !exam.endDateTime) return false;
    return new Date(exam.startDateTime) < dayEnd && new Date(exam.endDateTime) > dayStart;
  });
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
      const sameAudience = (first.targetAudience || 'student') === (second.targetAudience || 'student');
      const sameProgram = String(first.program?._id || first.program) === String(second.program?._id || second.program);
      const overlaps =
        new Date(first.startDateTime) < new Date(second.endDateTime) &&
        new Date(first.endDateTime) > new Date(second.startDateTime);

      if (sameAudience && sameProgram && overlaps) {
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
