import { useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, getDay, parse, startOfWeek } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { apiAuth } from '../../lib/api.js';
import { Modal } from '../Modal.jsx';
import {
  addConflictFlags,
  formatExamDateTime,
  getCalendarRange,
  getExamEventColor,
  getLearnerExamState,
} from './calendarUtils.js';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './ExamCalendar.css';

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales: { 'en-US': enUS },
});

function normalizeRole(role) {
  if (role === 'programChair') return 'program_chair';
  if (role === 'prof') return 'professor';
  return role;
}

function EventLabel({ event }) {
  return (
    <span className="exam-calendar-event-label">
      {event.resource?.hasScheduleConflict ? (
        <span className="exam-calendar-conflict" title="Overlapping exam schedule">!</span>
      ) : null}
      <span>{event.title}</span>
    </span>
  );
}

export default function ExamCalendar({ role, programId }) {
  const normalizedRole = normalizeRole(role);
  const isDean = normalizedRole === 'dean';
  const [view, setView] = useState('month');
  const [date, setDate] = useState(new Date());
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedExam, setSelectedExam] = useState(null);

  const visibleRange = useMemo(() => getCalendarRange(date, view), [date, view]);

  useEffect(() => {
    let ignore = false;

    async function fetchCalendarExams() {
      if (isDean && !programId) {
        setExams([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();

        if (isDean) {
          params.set('programId', programId);
          params.set('startRange', visibleRange.start.toISOString());
          params.set('endRange', visibleRange.end.toISOString());
        }

        const path = isDean
          ? `/api/calendar/dean?${params.toString()}`
          : '/api/calendar/student';
        const data = await apiAuth(path);
        if (!ignore) setExams(data.exams || []);
      } catch (err) {
        if (!ignore) {
          setError(err.message || 'Failed to load calendar exams.');
          setExams([]);
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    fetchCalendarExams();

    return () => {
      ignore = true;
    };
  }, [isDean, programId, visibleRange.end, visibleRange.start]);

  const calendarExams = useMemo(
    () => (isDean ? addConflictFlags(exams) : exams),
    [exams, isDean]
  );

  const events = useMemo(
    () =>
      calendarExams.map((exam) => ({
        id: exam._id,
        title: exam.name,
        start: new Date(exam.startDateTime),
        end: new Date(exam.endDateTime),
        resource: exam,
      })),
    [calendarExams]
  );

  function handleViewChange(nextView) {
    setView(nextView);
  }

  function handleNavigate(nextDate) {
    setDate(nextDate);
  }

  function eventPropGetter(event) {
    const color = getExamEventColor(event.resource?.status, normalizedRole);
    return {
      style: {
        backgroundColor: color,
        borderColor: color,
      },
    };
  }

  return (
    <section className="exam-calendar-shell">
      <div className="exam-calendar-toolbar">
        <div>
          <h2>Exam Calendar</h2>
          <p>{isDean ? 'Review exam schedules for the selected program.' : 'View upcoming and active exams.'}</p>
        </div>

        <div className="exam-calendar-actions" />
      </div>

      {loading ? <div className="exam-calendar-status">Loading calendar...</div> : null}
      {error ? <div className="exam-calendar-error">{error}</div> : null}

      <div className="exam-calendar-frame">
        <Calendar
          localizer={localizer}
          events={events}
          date={date}
          view={view}
          views={['month']}
          startAccessor="start"
          endAccessor="end"
          onNavigate={handleNavigate}
          onView={handleViewChange}
          onSelectEvent={(event) => setSelectedExam(event.resource)}
          eventPropGetter={eventPropGetter}
          components={{ event: EventLabel }}
          popup
          style={{ minHeight: 620 }}
        />
      </div>

      <Modal
        open={!!selectedExam}
        onClose={() => setSelectedExam(null)}
        title={selectedExam?.name || 'Exam Details'}
        size="compact"
      >
        {selectedExam ? (
          <div className="exam-calendar-details">
            <div>
              <span>Program</span>
              <strong>{selectedExam.program?.name || '-'}</strong>
            </div>
            <div>
              <span>Exam Start</span>
              <strong>{formatExamDateTime(selectedExam.startDateTime)}</strong>
            </div>
            <div>
              <span>Exam End</span>
              <strong>{formatExamDateTime(selectedExam.endDateTime)}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{isDean ? selectedExam.status : getLearnerExamState(selectedExam)}</strong>
            </div>
            {isDean ? (
              <div>
                <span>Passing Threshold</span>
                <strong>{selectedExam.passingThreshold ?? 0}%</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
