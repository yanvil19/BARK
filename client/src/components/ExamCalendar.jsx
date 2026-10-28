import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import ExamMonthGrid from './ExamMonthGrid.jsx';
import {
  addConflictFlags,
  formatExamDateTime,
  getCalendarRange,
  getLearnerExamState,
} from '../utils/calendarUtils.js';
import '../styles/components/ExamCalendar.css';

function normalizeRole(role) {
  if (role === 'programChair') return 'program_chair';
  if (role === 'prof') return 'professor';
  return role;
}

export default function ExamCalendar({
  role,
  programId,
  refreshKey,
  statusFilter = '',
  examIds = null,
}) {
  const normalizedRole = normalizeRole(role);
  const isDean = normalizedRole === 'dean';
  const isChair = normalizedRole === 'program_chair';
  const isManager = isDean || isChair;
  const [date, setDate] = useState(new Date());
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedExam, setSelectedExam] = useState(null);

  const effectiveProgramId = useMemo(() => {
    if (!programId) return '';
    if (typeof programId === 'object' && programId !== null) {
      if (programId._id) return String(programId._id).trim();
      if (typeof programId.toString === 'function' && programId.toString() !== '[object Object]') {
        return programId.toString().trim();
      }
    }
    const str = String(programId).trim();
    if (str === '[object Object]' || str === 'undefined' || str === 'null') return '';
    return str;
  }, [programId]);

  const visibleRange = useMemo(() => getCalendarRange(date, 'month'), [date]);

  useEffect(() => {
    let ignore = false;

    async function fetchCalendarExams() {
      if (isDean && !effectiveProgramId) {
        setExams([]);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams();

        if (isManager) {
          if (effectiveProgramId) {
            params.set('programId', effectiveProgramId);
          }
          params.set('startRange', visibleRange.start.toISOString());
          params.set('endRange', visibleRange.end.toISOString());
        }

        const path = isDean
          ? `/api/calendar/dean?${params.toString()}`
          : isChair
          ? `/api/calendar/chair?${params.toString()}`
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
  }, [isManager, isDean, isChair, effectiveProgramId, visibleRange.end, visibleRange.start, refreshKey]);

  // Conflicts are flagged before filtering so an overlap stays marked when the other exam is filtered out
  const calendarExams = useMemo(() => {
    const flagged = isManager ? addConflictFlags(exams) : exams;
    const allowedIds = examIds ? new Set(examIds.map(String)) : null;

    return flagged.filter((exam) =>
      (!statusFilter || exam.status === statusFilter) &&
      (!allowedIds || allowedIds.has(String(exam._id)))
    );
  }, [exams, isManager, statusFilter, examIds]);

  return (
    <>
      <ExamMonthGrid
        date={date}
        exams={calendarExams}
        loading={loading}
        error={error}
        onNavigate={setDate}
        onSelectExam={setSelectedExam}
      />

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
              <strong>{isManager ? selectedExam.status : getLearnerExamState(selectedExam)}</strong>
            </div>
            {isManager ? (
              <div>
                <span>Passing Threshold</span>
                <strong>{selectedExam.passingThreshold ?? 0}%</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
