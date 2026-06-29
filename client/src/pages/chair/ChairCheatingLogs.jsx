import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import '../../styles/ChairCheatingLogs.css';

const BASE = import.meta.env.VITE_API_URL;
const POLL_MS = 25000;
const STUDENTS_PER_PAGE = 10;
const EVENTS_PER_PAGE = 8;

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function statusLabel(status) {
  if (status === 'in_progress') return 'In progress';
  if (status === 'submitted') return 'Submitted';
  if (status === 'missed') return 'Missed Exam';
  return status || '—';
}

export default function ChairCheatingLogs() {
  const [exams, setExams] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [examLive, setExamLive] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [selectedExamId, setSelectedExamId] = useState('');
  const [search, setSearch] = useState('');
  const [expandedAttemptId, setExpandedAttemptId] = useState(null);
  const [studentPage, setStudentPage] = useState(1);
  const [eventPages, setEventPages] = useState({});

  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = selectedExamId ? `?examId=${encodeURIComponent(selectedExamId)}` : '';
      const data = await apiAuth(`${BASE}/api/stats/program-chair/exam-logs${params}`);
      setExams(data.exams || []);
      setAttempts(data.attempts || []);
      setExamLive(Boolean(data.examLive));
      setLastUpdated(data.serverTime ? new Date(data.serverTime) : new Date());
    } catch (err) {
      setError(err.message || 'Failed to load logs.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [selectedExamId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!selectedExamId || !examLive) return undefined;
    const interval = setInterval(() => fetchLogs(true), POLL_MS);
    return () => clearInterval(interval);
  }, [selectedExamId, examLive, fetchLogs]);

  useEffect(() => {
    setStudentPage(1);
    setExpandedAttemptId(null);
    setEventPages({});
  }, [selectedExamId, search]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attempts;
    return attempts.filter((row) =>
      row.studentName?.toLowerCase().includes(q)
      || row.studentEmail?.toLowerCase().includes(q));
  }, [attempts, search]);

  const studentTotalPages = Math.ceil(filteredAttempts.length / STUDENTS_PER_PAGE) || 1;
  const paginatedStudents = filteredAttempts.slice(
    (studentPage - 1) * STUDENTS_PER_PAGE,
    studentPage * STUDENTS_PER_PAGE,
  );

  function toggleAttempt(attemptId) {
    setExpandedAttemptId((prev) => (prev === attemptId ? null : attemptId));
  }

  function getEventPage(attemptId) {
    return eventPages[attemptId] || 1;
  }

  function setEventPage(attemptId, page) {
    setEventPages((prev) => ({ ...prev, [attemptId]: page }));
  }

  if (loading && !selectedExamId && exams.length === 0) {
    return <div className="el-loading">Loading logs...</div>;
  }

  if (error && !attempts.length && !exams.length) {
    return <div className="el-loading" style={{ color: '#dc2626' }}>{error}</div>;
  }

  return (
    <div className="el-page">
      <PageHeader
        className="shared-page-header--bleed"
        title="Logs"
        subtitle="Monitor exam activity for your program — start, window focus, submission, and progress."
      >
        {lastUpdated && selectedExamId && (
          <p className="el-last-updated" style={{ margin: 0, fontSize: '13px', color: '#8c96ae' }}>
            Last updated {formatDateTime(lastUpdated)}
            {examLive ? ` · refreshes every ${POLL_MS / 1000}s while exam is live` : ''}
          </p>
        )}
      </PageHeader>

      <div className="el-filters">
        <select
          className="el-filter-select"
          value={selectedExamId}
          onChange={(e) => setSelectedExamId(e.target.value)}
        >
          <option value="">Select an exam</option>
          {exams.map((exam) => (
            <option key={exam._id} value={exam._id}>
              {exam.name}
            </option>
          ))}
        </select>
        <input
          className="el-search"
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={!selectedExamId}
        />
        {selectedExamId && (
          <button type="button" className="el-btn-refresh" onClick={() => fetchLogs()}>
            Refresh
          </button>
        )}
      </div>

      {!selectedExamId && (
        <p className="el-helper-note">Choose an exam to view student activity logs.</p>
      )}

      {selectedExamId && loading && (
        <p className="el-helper-note">Loading student activity...</p>
      )}

      {selectedExamId && !loading && (
        <>
          <p className="el-helper-note">
            {filteredAttempts.length} student{filteredAttempts.length !== 1 ? 's' : ''} for this exam
          </p>

          {filteredAttempts.length === 0 ? (
            <div className="el-empty-card">No student activity recorded for this exam yet.</div>
          ) : (
            <div className="el-student-list">
              {paginatedStudents.map((row) => {
                const isOpen = expandedAttemptId === row.attemptId;
                const eventPage = getEventPage(row.attemptId);
                const eventTotalPages = Math.ceil(row.events.length / EVENTS_PER_PAGE) || 1;
                const paginatedEvents = row.events.slice(
                  (eventPage - 1) * EVENTS_PER_PAGE,
                  eventPage * EVENTS_PER_PAGE,
                );

                return (
                  <div key={row.attemptId} className={`el-student-row ${isOpen ? 'is-open' : ''}`}>
                    <button
                      type="button"
                      className="el-student-row-header"
                      onClick={() => toggleAttempt(row.attemptId)}
                      aria-expanded={isOpen}
                    >
                      <span className={`el-chevron ${isOpen ? 'is-open' : ''}`} aria-hidden>
                        ▶
                      </span>
                      <div className="el-student-main">
                        <div className="el-student-name">{row.studentName}</div>
                        <div className="el-student-email">{row.studentEmail}</div>
                      </div>
                      <div className="el-student-stats">
                        <div className="el-progress-wrap">
                          <div className="el-progress-label">
                            {row.answeredCount}/{row.totalQuestions} answered ({row.progressPercent}%)
                          </div>
                          <div className="el-progress-track">
                            <div
                              className="el-progress-fill"
                              style={{ width: `${row.progressPercent}%` }}
                            />
                          </div>
                        </div>
                        <div className="el-student-meta">
                          <span className={`el-status-pill el-status-pill--${row.status}`}>
                            {statusLabel(row.status)}
                          </span>
                          <span className="el-duration">
                            {row.status === 'missed'
                              ? 'Missed Exam'
                              : (
                                <>
                                  {row.status === 'submitted' ? 'Completed in ' : 'Elapsed '}
                                  {formatDuration(row.durationMs)}
                                </>
                              )}
                          </span>
                        </div>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="el-student-row-body">
                        {row.events.length === 0 ? (
                          <p className="el-log-empty">No events recorded yet.</p>
                        ) : (
                          <>
                            <ul className="el-event-list">
                              {paginatedEvents.map((event, idx) => (
                                <li key={`${event.type}-${event.timestamp}-${idx}`} className={`el-event el-event--${event.type}`}>
                                  <div className="el-event-label">{event.label}</div>
                                  {event.detail && (
                                    <div className="el-event-detail">{event.detail}</div>
                                  )}
                                  <div className="el-event-time">{formatDateTime(event.timestamp)}</div>
                                </li>
                              ))}
                            </ul>
                            <Pagination
                              currentPage={eventPage}
                              totalItems={row.events.length}
                              pageSize={EVENTS_PER_PAGE}
                              onPageChange={(page) => setEventPage(row.attemptId, page)}
                              itemLabel="events"
                              classPrefix="el"
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Pagination
            currentPage={studentPage}
            totalItems={filteredAttempts.length}
            pageSize={STUDENTS_PER_PAGE}
            onPageChange={setStudentPage}
            itemLabel="students"
            classPrefix="el"
          />
        </>
      )}
    </div>
  );
}
