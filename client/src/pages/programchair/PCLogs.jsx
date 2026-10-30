import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import Pagination from '../../components/Pagination.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import '../../styles/programchair/PCLogs.css';

const BASE = import.meta.env.VITE_API_URL;
const POLL_MS = 25000;
const STUDENTS_PER_PAGE = 10;
const EVENTS_PER_PAGE = 8;
const EXAMS_PER_PAGE = 10;

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

function formatExamDateRange(startIso, endIso) {
  if (!startIso) return '—';
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;

  if (isNaN(start.getTime())) return '—';

  const startMonth = start.toLocaleDateString('en-PH', { month: 'short' });
  const startDay = start.getDate();
  const startYear = start.getFullYear();

  // If there's no end date or it's invalid, show just the single date
  if (!end || isNaN(end.getTime())) {
    return `${startMonth} ${startDay}, ${startYear}`;
  }

  const endMonth = end.toLocaleDateString('en-PH', { month: 'short' });
  const endDay = end.getDate();
  const endYear = end.getFullYear();

  // Same day
  if (startDay === endDay && startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDay}, ${startYear}`;
  }

  // Same month and year: "Oct 22–23, 2026"
  if (startMonth === endMonth && startYear === endYear) {
    return `${startMonth} ${startDay}–${endDay}, ${startYear}`;
  }

  // Same year, different months: "Oct 22 – Nov 2, 2026"
  if (startYear === endYear) {
    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${startYear}`;
  }

  // Different years: "Dec 30, 2025 – Jan 2, 2026"
  return `${startMonth} ${startDay}, ${startYear} – ${endMonth} ${endDay}, ${endYear}`;
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
  const [examSearch, setExamSearch] = useState('');
  const [studentType, setStudentType] = useState(null); // null = all, 'student', 'alumni'
  const [examPage, setExamPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'in_progress', 'submitted', 'missed'

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
  }, [selectedExamId, search, statusFilter]);

  useEffect(() => {
    setExamPage(1);
    setStudentPage(1);
    setExpandedAttemptId(null);
  }, [examSearch, studentType]);

  // Helper to extract audience/tag cleanly from an exam
  const getExamAudience = (exam) => {
    const raw = exam?.targetAudience || exam?.audience || exam?.type || exam?.category || '';
    return raw.toLowerCase();
  };

  const filteredExams = useMemo(() => {
    const q = examSearch.trim().toLowerCase();
    return exams.filter((exam) => {
      if (q && !exam.name?.toLowerCase().includes(q)) return false;
      if (studentType) {
        const audience = getExamAudience(exam);
        // If an exam has no explicit audience, default assumption is student
        const resolvedAudience = audience || 'student';
        if (resolvedAudience !== studentType.toLowerCase()) return false;
      }
      return true;
    });
  }, [exams, examSearch, studentType]);

  // Automatically reset or preserve selectedExamId if it does not match the active filter
  useEffect(() => {
    if (!selectedExamId) return;
    const currentExam = exams.find((e) => e._id === selectedExamId);
    if (!currentExam) return;

    if (studentType) {
      const audience = getExamAudience(currentExam) || 'student';
      if (audience !== studentType.toLowerCase()) {
        setSelectedExamId('');
      }
    }
  }, [studentType, selectedExamId, exams]);

  const paginatedExams = filteredExams.slice(
    (examPage - 1) * EXAMS_PER_PAGE,
    examPage * EXAMS_PER_PAGE,
  );

  const selectedExam = useMemo(() => {
    return exams.find((e) => e._id === selectedExamId);
  }, [exams, selectedExamId]);

  const filteredAttempts = useMemo(() => {
    if (selectedExam && studentType) {
      const examAudience = getExamAudience(selectedExam) || 'student';
      if (examAudience !== studentType.toLowerCase()) return [];
    }

    const q = search.trim().toLowerCase();
    return attempts.filter((row) => {
      // 1. Audience filter (student vs alumni)
      if (studentType) {
        const rowAudience = (
          row.studentType ||
          row.userType ||
          row.role ||
          (selectedExam ? getExamAudience(selectedExam) : '') ||
          'student'
        ).toLowerCase();

        if (rowAudience !== studentType.toLowerCase()) return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all' && row.status !== statusFilter) {
        return false;
      }

      // 3. Search query
      if (!q) return true;
      return (
        row.studentName?.toLowerCase().includes(q) ||
        row.studentEmail?.toLowerCase().includes(q)
      );
    });
  }, [attempts, search, studentType, selectedExam, statusFilter]);

  function toggleStudentType(type) {
    setStudentType((prev) => {
      const next = prev && prev.toLowerCase() === type.toLowerCase() ? null : type;
      return next;
    });
  }

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
    <div className="el-page page-shell">
      <PageHeader
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

      <div className="el-layout">
        <aside className="el-sidebar" aria-label="Exam filter">
          <p className="el-sidebar-helper">Choose an exam to view activity logs</p>

          <SearchBar
            id="el-exam-search"
            className="el-sidebar-search"
            placeholder="Search exam..."
            value={examSearch}
            onChange={setExamSearch}
          />

          <div className="el-sidebar-label">Log Type</div>
          <div className="el-type-toggle">
            <button
              id="el-filter-student"
              type="button"
              className={`el-type-btn ${studentType === 'student' ? 'is-active' : ''}`}
              aria-pressed={studentType === 'student'}
              onClick={() => toggleStudentType('student')}
            >
              Student logs
            </button>
            <button
              id="el-filter-alumni"
              type="button"
              className={`el-type-btn ${studentType === 'alumni' ? 'is-active' : ''}`}
              aria-pressed={studentType === 'alumni'}
              onClick={() => toggleStudentType('alumni')}
            >
              Alumni logs
            </button>
          </div>

          <div className="el-exam-list">
            {paginatedExams.length === 0 ? (
              <p className="el-exam-empty">No exams found.</p>
            ) : (
              paginatedExams.map((exam) => (
                <button
                  key={exam._id}
                  id={`el-exam-${exam._id}`}
                  type="button"
                  className={`el-exam-item ${selectedExamId === exam._id ? 'is-selected' : ''}`}
                  onClick={() => setSelectedExamId(exam._id)}
                >
                  <span className="el-exam-name">{exam.name}</span>
                  <span className="el-exam-date">
                    {formatExamDateRange(
                      exam.startDateTime || exam.startDate,
                      exam.endDateTime || exam.endDate
                    )}
                  </span>
                </button>
              ))
            )}
          </div>

          <Pagination
            currentPage={examPage}
            totalItems={filteredExams.length}
            pageSize={EXAMS_PER_PAGE}
            onPageChange={setExamPage}
            itemLabel=""
            classPrefix="els"
          />
        </aside>

        <section className="el-main">
          {selectedExamId && (
            <div className="el-filters">
              <SearchBar
                className="el-search"
                placeholder={studentType === 'alumni' ? 'Search alumni...' : 'Search students...'}
                value={search}
                onChange={setSearch}
              />

              <DropdownSelect
                className="el-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                ariaLabel="Filter by status"
                options={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'in_progress', label: 'In progress' },
                  { value: 'submitted', label: 'Submitted' },
                  { value: 'missed', label: 'Missed Exam' },
                ]}
              />

              <button type="button" className="el-btn-refresh" onClick={() => fetchLogs()}>
                Refresh
              </button>
            </div>
          )}

          {!selectedExamId && (
            <div className="el-empty-card-prompt">
              <span className="el-empty-card-subtitle">NOTHING SELECTED</span>
              <h2 className="el-empty-card-title">Select an exam to view activity logs</h2>
            </div>
          )}

          {selectedExamId && loading && (
            <p className="el-helper-note">Loading activity logs...</p>
          )}

          {selectedExamId && !loading && (
            <>
              <p className="el-helper-note">
                {filteredAttempts.length}{' '}
                {studentType === 'alumni' ? 'alumni' : 'student'}
                {filteredAttempts.length !== 1 && studentType !== 'alumni' ? 's' : ''} for this exam
              </p>

              {filteredAttempts.length === 0 ? (
                <div className="el-empty-card">
                  No {studentType ? studentType : 'user'} activity recorded for this exam yet.
                </div>
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
                                {row.status === 'missed' ? (
                                  'Missed Exam'
                                ) : (
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
                                    <li
                                      key={`${event.type}-${event.timestamp}-${idx}`}
                                      className={`el-event el-event--${event.type}`}
                                    >
                                      <div className="el-event-label">{event.label}</div>
                                      {event.detail && (
                                        <div className="el-event-detail">{event.detail}</div>
                                      )}
                                      <div className="el-event-time">
                                        {formatDateTime(event.timestamp)}
                                      </div>
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
                itemLabel={studentType === 'alumni' ? 'alumni' : 'students'}
                classPrefix="el"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}