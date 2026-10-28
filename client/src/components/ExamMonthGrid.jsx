import { useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { Modal } from './Modal.jsx';
import { getCalendarRange } from '../utils/calendarUtils.js';
import '../styles/components/ExamMonthGrid.css';

// Exams shown in a day box before the rest collapse into "N more"
const MAX_VISIBLE_EXAMS = 3;

const STATUS_LEGEND = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'finished', label: 'Finished' },
  { value: 'archived', label: 'Archived' },
];

function Icon({ children, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

function IconStudent(props) {
  return (
    <Icon {...props}>
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </Icon>
  );
}

function IconAlumni(props) {
  return (
    <Icon {...props}>
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
      <path d="M22 10v6" />
    </Icon>
  );
}

function IconArrowLeft(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </Icon>
  );
}

function IconArrowRight(props) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

function AudienceIcon({ audience, ...props }) {
  return audience === 'alumni' ? <IconAlumni {...props} /> : <IconStudent {...props} />;
}

function getStatusLabel(status) {
  return STATUS_LEGEND.find((item) => item.value === status)?.label || status || 'Draft';
}

function getAudienceLabel(audience) {
  return audience === 'alumni' ? 'Alumni exam' : 'Student exam';
}

// Exams whose schedule touches the day; multi-day alumni windows show on every day they cover
function getExamsForDay(exams, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);

  return exams.filter((exam) => {
    if (!exam.startDateTime || !exam.endDateTime) return false;
    return new Date(exam.startDateTime) < dayEnd && new Date(exam.endDateTime) > dayStart;
  });
}

function getDayTimeLabel(exam, day) {
  const start = new Date(exam.startDateTime);
  const end = new Date(exam.endDateTime);

  if (isSameDay(start, day)) return format(start, 'h:mm a');
  if (end <= addDays(startOfDay(day), 1)) return `Ends ${format(end, 'h:mm a')}`;
  return 'All day';
}

function formatExamTimeRange(exam) {
  const start = new Date(exam.startDateTime);
  const end = new Date(exam.endDateTime);

  if (isSameDay(start, end)) return `${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
  return `${format(start, 'MMM d, h:mm a')} – ${format(end, 'MMM d, h:mm a')}`;
}

function ExamChip({ exam, day, onSelect }) {
  const status = exam.status || 'draft';
  const tooltip = [
    exam.name,
    formatExamTimeRange(exam),
    `${getAudienceLabel(exam.targetAudience)} · ${getStatusLabel(status)}`,
    exam.hasScheduleConflict ? 'Overlaps another exam' : '',
  ].filter(Boolean).join('\n');

  return (
    <button
      type="button"
      className={`emg-chip emg-status--${status}`}
      onClick={() => onSelect(exam)}
      title={tooltip}
    >
      <AudienceIcon audience={exam.targetAudience} className="emg-chip-icon" />
      {exam.hasScheduleConflict ? <span className="emg-conflict" aria-label="Schedule overlap">!</span> : null}
      <span className="emg-chip-title">{exam.name}</span>
      <span className="emg-chip-time">{getDayTimeLabel(exam, day)}</span>
    </button>
  );
}

export default function ExamMonthGrid({ date, exams, loading, error, onNavigate, onSelectExam }) {
  const [expandedDay, setExpandedDay] = useState(null);
  const today = new Date();

  const days = useMemo(() => {
    const { start, end } = getCalendarRange(date, 'month');
    return eachDayOfInterval({ start, end }).map((day) => ({
      day,
      exams: getExamsForDay(exams, day),
    }));
  }, [date, exams]);

  const hasConflicts = exams.some((exam) => exam.hasScheduleConflict);
  const expandedExams = expandedDay ? getExamsForDay(exams, expandedDay) : [];

  function openExamFromDayList(exam) {
    setExpandedDay(null);
    onSelectExam(exam);
  }

  return (
    <section className="emg-shell">
      <header className="emg-header">
        <div className="emg-heading">
          <div className="emg-today-badge" title={`Today is ${format(today, 'MMMM d, yyyy')}`}>
            <span>{format(today, 'MMM')}</span>
            <strong>{format(today, 'd')}</strong>
          </div>
          <div>
            <h2>{format(date, 'MMMM yyyy')}</h2>
            <p>
              {format(startOfMonth(date), 'MMM d, yyyy')} – {format(endOfMonth(date), 'MMM d, yyyy')}
            </p>
          </div>
        </div>

        <div className="emg-header-actions">
          {loading ? <span className="emg-loading">Loading...</span> : null}
          <div className="emg-nav" role="group" aria-label="Change month">
            <button type="button" onClick={() => onNavigate(subMonths(date, 1))} aria-label="Previous month">
              <IconArrowLeft className="emg-nav-icon" />
            </button>
            <button type="button" onClick={() => onNavigate(new Date())}>
              Today
            </button>
            <button type="button" onClick={() => onNavigate(addMonths(date, 1))} aria-label="Next month">
              <IconArrowRight className="emg-nav-icon" />
            </button>
          </div>
        </div>
      </header>

      <div className="emg-legend" aria-label="Calendar legend">
        {STATUS_LEGEND.map((item) => (
          <span key={item.value} className="emg-legend-item">
            <span className={`emg-legend-dot emg-status--${item.value}`} />
            {item.label}
          </span>
        ))}
        <span className="emg-legend-divider" aria-hidden="true" />
        <span className="emg-legend-item">
          <IconStudent className="emg-legend-icon" />
          Student exam
        </span>
        <span className="emg-legend-item">
          <IconAlumni className="emg-legend-icon" />
          Alumni exam
        </span>
        {hasConflicts ? (
          <span className="emg-legend-item">
            <span className="emg-conflict" aria-hidden="true">!</span>
            Schedule overlap
          </span>
        ) : null}
      </div>

      {error ? <div className="emg-error">{error}</div> : null}

      <div className="emg-scroll" aria-busy={loading}>
        <div className="emg-weekdays">
          {days.slice(0, 7).map(({ day }) => (
            <div key={day.toISOString()} className="emg-weekday">
              {format(day, 'EEE')}
            </div>
          ))}
        </div>

        <div className="emg-days">
          {days.map(({ day, exams: dayExams }) => {
            const hiddenCount = dayExams.length - MAX_VISIBLE_EXAMS;
            const className = [
              'emg-day',
              isSameMonth(day, date) ? '' : 'is-outside',
              isToday(day) ? 'is-today' : '',
            ].filter(Boolean).join(' ');

            return (
              <div key={day.toISOString()} className={className}>
                <span className="emg-day-number">{format(day, 'd')}</span>
                {dayExams.slice(0, MAX_VISIBLE_EXAMS).map((exam) => (
                  <ExamChip key={exam._id} exam={exam} day={day} onSelect={onSelectExam} />
                ))}
                {hiddenCount > 0 ? (
                  <button type="button" className="emg-more" onClick={() => setExpandedDay(day)}>
                    {hiddenCount} more...
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!expandedDay}
        onClose={() => setExpandedDay(null)}
        title={expandedDay ? format(expandedDay, 'EEEE, MMMM d, yyyy') : ''}
        size="compact"
      >
        <div className="emg-day-list">
          {expandedExams.map((exam) => (
            <button
              key={exam._id}
              type="button"
              className={`emg-day-list-item emg-status--${exam.status || 'draft'}`}
              onClick={() => openExamFromDayList(exam)}
            >
              <AudienceIcon audience={exam.targetAudience} className="emg-day-list-icon" />
              <span className="emg-day-list-main">
                <strong>{exam.name}</strong>
                <span>
                  {formatExamTimeRange(exam)} · {getAudienceLabel(exam.targetAudience)}
                </span>
              </span>
              {exam.hasScheduleConflict ? <span className="emg-conflict" aria-label="Schedule overlap">!</span> : null}
              <span className="emg-day-list-status">{getStatusLabel(exam.status)}</span>
            </button>
          ))}
        </div>
      </Modal>
    </section>
  );
}
