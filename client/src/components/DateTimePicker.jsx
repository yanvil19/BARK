import { useEffect, useMemo, useState } from 'react';
import {
  addHours,
  addMonths,
  eachDayOfInterval,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { Modal } from './Modal.jsx';
import TimeInput from './TimeInput.jsx';
import { AudienceIcon, IconArrowLeft, IconArrowRight, IconCalendar } from './CalendarIcons.jsx';
import { useCalendarExams } from '../hooks/useCalendarExams.js';
import { formatExamTimeRange, getCalendarRange, getExamsForDay } from '../utils/calendarUtils.js';
import { getStatusLabel } from '../utils/statusLabels.js';
// Status color tokens (.emg-status--*) shared with the exam calendar
import '../styles/components/ExamMonthGrid.css';
import '../styles/components/DateTimePicker.css';

// Exam dots shown in a day before the rest collapse into "+N"
const MAX_DAY_DOTS = 3;

const EDGES = [
  { key: 'start', label: 'Starts' },
  { key: 'end', label: 'Ends' },
];

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getNextFullHour() {
  const next = new Date();
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

function withTime(day, source) {
  const next = new Date(day);
  next.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return next;
}

function formatDuration(start, end) {
  const totalMinutes = Math.round((end - start) / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(' ') || '0 minutes';
}

function formatSchedule(start, end) {
  if (isSameDay(start, end)) {
    return `${format(start, 'EEE, MMM d, yyyy')} · ${format(start, 'h:mm a')} – ${format(end, 'h:mm a')}`;
  }
  return `${format(start, 'MMM d, h:mm a')} – ${format(end, 'MMM d, yyyy h:mm a')}`;
}

function overlapsRange(exam, range) {
  if (!exam.startDateTime || !exam.endDateTime) return false;
  const examStart = new Date(exam.startDateTime);
  const examEnd = new Date(exam.endDateTime);

  if (range.start.getTime() === range.end.getTime()) {
    return examStart <= range.start && examEnd > range.start;
  }
  return examStart < range.end && examEnd > range.start;
}

/**
 * Date & time picker opened as a modal. The calendar shows the exams already scheduled
 * for the program so overlaps can be spotted; overlaps only warn, they never block Apply.
 *
 * - range: pick a start and an end in the same modal; onChange(startIso, endIso)
 *   (without range: one moment; onChange(iso))
 * - value / endValue: current start (or single moment) and end
 * - role / programId: whose exams to load (no role = no exams shown)
 * - audience: 'student' | 'alumni'; overlaps are checked against exams with the same audience
 * - excludeExamId: the exam being edited, left out of the list
 */
export default function DateTimePicker({
  value,
  endValue,
  range = false,
  onChange,
  onCancel,
  autoOpen = false,
  title = 'Select Date & Time',
  description = null,
  placeholder = 'Select Date & Time',
  role,
  programId,
  audience,
  excludeExamId,
}) {
  const getInitialStart = () => toDate(value) || getNextFullHour();
  // A new schedule ends one hour after it starts
  const getInitialEnd = (start) => toDate(endValue) || addHours(start, 1);

  const [isOpen, setIsOpen] = useState(autoOpen);
  const [draftStart, setDraftStart] = useState(getInitialStart);
  const [draftEnd, setDraftEnd] = useState(() => getInitialEnd(draftStart));
  const [activeEdge, setActiveEdge] = useState('start');
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(draftStart));

  const { exams, loading, error, missingProgram } = useCalendarExams({
    role,
    programId,
    date: viewMonth,
    enabled: isOpen && Boolean(role),
  });

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const otherExams = useMemo(
    () => exams.filter((exam) => String(exam._id) !== String(excludeExamId || '')),
    [exams, excludeExamId]
  );

  const days = useMemo(() => {
    const { start, end } = getCalendarRange(viewMonth, 'month');
    return eachDayOfInterval({ start, end }).map((day) => ({
      day,
      exams: getExamsForDay(otherExams, day),
    }));
  }, [viewMonth, otherExams]);

  const today = startOfDay(new Date());
  const isCurrentMonth = viewMonth <= startOfMonth(today);
  const isEditingEnd = range && activeEdge === 'end';
  const activeDate = isEditingEnd ? draftEnd : draftStart;
  // Exams are loaded per visible month, so the picked day is only checked while it is on screen
  const activeInView = days.some(({ day }) => isSameDay(day, activeDate));
  const dayExams = getExamsForDay(otherExams, activeDate);

  const isPast = draftStart.getTime() <= Date.now();
  const endInvalid = range && draftEnd <= draftStart;
  const cannotApply = isPast || endInvalid;
  const checkedRange = range && !endInvalid
    ? { start: draftStart, end: draftEnd }
    : { start: draftStart, end: draftStart };
  const conflicts = audience && activeInView
    ? otherExams.filter((exam) => (
      exam.status !== 'archived'
      && (exam.targetAudience || 'student') === audience
      && overlapsRange(exam, checkedRange)
    ))
    : [];
  const conflictIds = new Set(conflicts.map((exam) => String(exam._id)));

  const savedStart = toDate(value);
  const savedEnd = toDate(endValue);
  let displayValue = placeholder;
  if (range && savedStart && savedEnd) displayValue = formatSchedule(savedStart, savedEnd);
  else if (range && savedStart) displayValue = `${format(savedStart, 'MMM d, yyyy h:mm a')} – end not set`;
  else if (savedStart) displayValue = format(savedStart, 'MMM d, yyyy h:mm a');

  function openPicker() {
    const start = getInitialStart();
    setDraftStart(start);
    setDraftEnd(getInitialEnd(start));
    setActiveEdge('start');
    setViewMonth(startOfMonth(start));
    setIsOpen(true);
  }

  function closePicker() {
    setIsOpen(false);
    onCancel?.();
  }

  function applyDrafts() {
    if (cannotApply) return;
    setIsOpen(false);
    if (range) onChange(draftStart.toISOString(), draftEnd.toISOString());
    else onChange(draftStart.toISOString());
  }

  // Moving the start carries the end along so the exam keeps its length
  function moveStart(nextStart) {
    if (range && draftEnd > draftStart) {
      setDraftEnd(new Date(draftEnd.getTime() + (nextStart.getTime() - draftStart.getTime())));
    }
    setDraftStart(nextStart);
  }

  function focusEdge(edge) {
    setActiveEdge(edge);
    const date = edge === 'end' ? draftEnd : draftStart;
    if (!isSameMonth(date, viewMonth)) setViewMonth(startOfMonth(date));
  }

  function selectDay(day) {
    if (isEditingEnd) setDraftEnd(withTime(day, draftEnd));
    else moveStart(withTime(day, draftStart));
    if (!isSameMonth(day, viewMonth)) setViewMonth(startOfMonth(day));
  }

  function changeTime(edge, time) {
    const [hours, minutes] = time.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
    const next = new Date(edge === 'end' ? draftEnd : draftStart);
    next.setHours(hours, minutes, 0, 0);
    if (edge === 'end') setDraftEnd(next);
    else moveStart(next);
  }

  function getDayClassName(day) {
    const isStartDay = isSameDay(day, draftStart);
    const isEndDay = range && isSameDay(day, draftEnd);
    const isActiveDay = isSameDay(day, activeDate);
    const isBetween = range && !endInvalid && day > startOfDay(draftStart) && day < startOfDay(draftEnd);

    return [
      'dtp-day',
      isSameMonth(day, viewMonth) ? '' : 'is-outside',
      isToday(day) ? 'is-today' : '',
      isBetween ? 'is-in-range' : '',
      (isStartDay || isEndDay) && !isActiveDay ? 'is-edge' : '',
      isActiveDay ? 'is-selected' : '',
    ].filter(Boolean).join(' ');
  }

  function renderDayPanelBody() {
    if (missingProgram) return <p className="dtp-empty">Choose a program to see its scheduled exams.</p>;
    if (error) return <p className="dtp-empty">{error}</p>;
    if (!activeInView) return <p className="dtp-empty">Pick a day on the calendar to see its exams.</p>;
    if (dayExams.length === 0) return <p className="dtp-empty">No exams scheduled on this day.</p>;

    return (
      <ul className="dtp-exam-list">
        {dayExams.map((exam) => {
          const isConflict = conflictIds.has(String(exam._id));
          return (
            <li
              key={exam._id}
              className={`dtp-exam emg-status--${exam.status || 'draft'}${isConflict ? ' is-conflict' : ''}`}
            >
              <span className="dtp-dot" aria-hidden="true" />
              <AudienceIcon audience={exam.targetAudience} className="dtp-exam-icon" />
              <span className="dtp-exam-main">
                <strong title={exam.name}>{exam.name}</strong>
                <span>{formatExamTimeRange(exam)} · {getStatusLabel(exam.status || 'draft')}</span>
              </span>
              {isConflict ? <span className="dtp-exam-tag">Overlaps</span> : null}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <>
      {!autoOpen && (
        <button
          type="button"
          className={`dtp-input${savedStart ? '' : ' is-empty'}`}
          onClick={openPicker}
          aria-label={`${title}: ${displayValue}`}
        >
          <span className="dtp-val">{displayValue}</span>
          <IconCalendar className="dtp-input-icon" />
        </button>
      )}

      <Modal open={isOpen} onClose={closePicker} title={title} size="picker">
        {description ? <p className="dtp-description">{description}</p> : null}

        <div className="dtp-layout">
          <section className="dtp-cal" aria-label="Choose a date">
            <div className="dtp-cal-head">
              <strong>{format(viewMonth, 'MMMM yyyy')}</strong>
              {loading ? <span className="dtp-cal-loading">Loading exams...</span> : null}
              <div className="dtp-cal-nav">
                <button
                  type="button"
                  onClick={() => setViewMonth(subMonths(viewMonth, 1))}
                  disabled={isCurrentMonth}
                  aria-label="Previous month"
                >
                  <IconArrowLeft className="dtp-nav-icon" />
                </button>
                <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} aria-label="Next month">
                  <IconArrowRight className="dtp-nav-icon" />
                </button>
              </div>
            </div>

            <div className="dtp-cal-weekdays">
              {days.slice(0, 7).map(({ day }) => (
                <span key={day.toISOString()}>{format(day, 'EEE')}</span>
              ))}
            </div>

            <div className="dtp-cal-days">
              {days.map(({ day, exams: examsOnDay }) => {
                const examCount = examsOnDay.length
                  ? `, ${examsOnDay.length} exam${examsOnDay.length === 1 ? '' : 's'}`
                  : '';

                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    className={getDayClassName(day)}
                    disabled={day < today}
                    onClick={() => selectDay(day)}
                    aria-pressed={isSameDay(day, activeDate)}
                    aria-label={`${format(day, 'EEEE, MMMM d')}${examCount}`}
                  >
                    <span>{format(day, 'd')}</span>
                    {examsOnDay.length > 0 ? (
                      <span className="dtp-day-dots" aria-hidden="true">
                        {examsOnDay.slice(0, MAX_DAY_DOTS).map((exam) => (
                          <span key={exam._id} className={`dtp-dot emg-status--${exam.status || 'draft'}`} />
                        ))}
                        {examsOnDay.length > MAX_DAY_DOTS ? (
                          <span className="dtp-dot-more">+{examsOnDay.length - MAX_DAY_DOTS}</span>
                        ) : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          <div className="dtp-side">
            {range ? (
              <div className="dtp-edges">
                {EDGES.map((edge) => {
                  const date = edge.key === 'end' ? draftEnd : draftStart;
                  const isActive = activeEdge === edge.key;
                  return (
                    <div key={edge.key} className={`dtp-edge${isActive ? ' is-active' : ''}`}>
                      <button
                        type="button"
                        className="dtp-edge-pick"
                        onClick={() => focusEdge(edge.key)}
                        aria-pressed={isActive}
                      >
                        <span>{edge.label}</span>
                        <strong>{format(date, 'EEE, MMM d, yyyy')}</strong>
                      </button>
                      <TimeInput
                        value={format(date, 'HH:mm')}
                        onChange={(time) => changeTime(edge.key, time)}
                        onFocus={() => focusEdge(edge.key)}
                        ariaLabel={`${edge.label} time`}
                      />
                    </div>
                  );
                })}
                <p className={`dtp-duration${endInvalid ? ' is-error' : ''}`}>
                  {endInvalid ? 'Ends before it starts' : `Duration: ${formatDuration(draftStart, draftEnd)}`}
                </p>
                <p className="dtp-hint">The calendar sets the {isEditingEnd ? 'end' : 'start'} date.</p>
              </div>
            ) : (
              <div className="dtp-time">
                <span>Time</span>
                <TimeInput
                  value={format(draftStart, 'HH:mm')}
                  onChange={(time) => changeTime('start', time)}
                />
              </div>
            )}

            <section className="dtp-day-panel">
              <h3>{format(activeDate, 'EEEE, MMMM d')}</h3>
              {renderDayPanelBody()}
            </section>
          </div>
        </div>

        <div className="dtp-alerts" aria-live="polite">
          {isPast ? (
            <p className="dtp-alert dtp-alert--error">
              {range ? 'The start' : 'This time'} has already passed. Pick a later date or time.
            </p>
          ) : null}
          {endInvalid ? (
            <p className="dtp-alert dtp-alert--error">The exam must end after it starts.</p>
          ) : null}
          {conflicts.length > 0 ? (
            <p className="dtp-alert dtp-alert--warning">
              Overlaps {conflicts.length === 1 ? 'another' : `${conflicts.length} other`} {audience} exam
              {conflicts.length === 1 ? '' : 's'} in this program:{' '}
              {conflicts.map((exam) => `${exam.name} (${formatExamTimeRange(exam)})`).join(', ')}.
              {' '}You can still apply this schedule.
            </p>
          ) : null}
        </div>

        <div className="modal-actions spaced dtp-actions">
          <span className="dtp-summary">
            {range && !endInvalid
              ? formatSchedule(draftStart, draftEnd)
              : format(draftStart, 'EEE, MMM d, yyyy · h:mm a')}
          </span>
          <div className="modal-actions-right">
            <button type="button" className="modal-btn-cancel" onClick={closePicker}>
              Cancel
            </button>
            <button type="button" className="modal-btn-primary" onClick={applyDrafts} disabled={cannotApply}>
              Apply
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
