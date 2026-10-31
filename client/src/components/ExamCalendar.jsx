import { useMemo, useState } from 'react';
import { Modal } from './Modal.jsx';
import ExamMonthGrid from './ExamMonthGrid.jsx';
import { useCalendarExams } from '../hooks/useCalendarExams.js';
import {
  addConflictFlags,
  formatExamDateTime,
  getLearnerExamState,
} from '../utils/calendarUtils.js';
import '../styles/components/ExamCalendar.css';

export default function ExamCalendar({
  role,
  programId,
  refreshKey,
  statusFilter = '',
  examIds = null,
}) {
  const [date, setDate] = useState(new Date());
  const [selectedExam, setSelectedExam] = useState(null);
  const { exams, loading, error, isManager } = useCalendarExams({ role, programId, date, refreshKey });

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
