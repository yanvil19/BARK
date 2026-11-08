import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import { EXAM_STATUSES, ExamStatePill, Marker, MarkerIcon, MarkerLegend } from '../../components/QuestionMarkers.jsx';
import { AudienceIcon } from '../../components/CalendarIcons.jsx';
import { useToast } from '../../components/Toast.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/programchair/PCLogs.css';

const PAGE_SIZE = 10;
// How often the open exam's activity reloads while the exam is live
const POLL_MS = 25000;

// The exams that can have activity: the server leaves out drafts and archived ones
const LOG_STATUSES = ['published', 'ongoing', 'finished'];

const AUDIENCE_LABELS = { student: 'Student exam', alumni: 'Alumni exam' };

const STATE_TABS = [
  { value: '', label: 'All' },
  ...LOG_STATUSES.map((status) => ({ value: status, label: EXAM_STATUSES[status].label })),
];

function AudienceMarkerIcon({ audience }) {
  return <AudienceIcon audience={audience} width="13" height="13" strokeWidth="2.4" />;
}

const LEGEND_ITEMS = [
  ...LOG_STATUSES.map((status) => ({
    text: EXAM_STATUSES[status].label,
    className: `ca-exam-state--${status}`,
    content: <MarkerIcon>{EXAM_STATUSES[status].icon}</MarkerIcon>,
  })),
  ...Object.entries(AUDIENCE_LABELS).map(([audience, label]) => ({
    text: label,
    className: 'ca-marker--audience',
    content: <AudienceMarkerIcon audience={audience} />,
  })),
];

// Where a taker stands, in the colors of the question states
const TAKER_STATUSES = {
  in_progress: { label: 'In progress', tone: 'warn' },
  submitted: { label: 'Submitted', tone: 'good' },
  missed: { label: 'Missed', tone: 'bad' },
};

const TAKER_TABS = [
  { value: 'all', label: 'All' },
  ...Object.entries(TAKER_STATUSES).map(([value, { label }]) => ({ value, label })),
];

const TAKER_SORTS = [
  { value: 'recent', label: 'Sort: Latest start' },
  { value: 'name', label: 'Sort: Name A–Z' },
  { value: 'focus', label: 'Sort: Most focus lost' },
];

const EVENT_ICONS = {
  started: <path d="M8 5l11 7-11 7V5z" />,
  progress: <path d="M4 17l6-6 4 4 6-6" />,
  focus_lost: <><path d="M12 6.5v7" /><path d="M12 17.5h.01" /></>,
  submitted: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

const NO_LOGS = { examId: null, attempts: [], live: false, updatedAt: null, loading: false, error: '' };

function getAudience(exam) {
  return exam?.targetAudience || 'student';
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function formatDuration(ms) {
  if (ms == null || ms < 0) return '-';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function focusLostCount(attempt) {
  return attempt.events.filter((event) => event.type === 'focus_lost').length;
}

function TakerPill({ status }) {
  const { label, tone } = TAKER_STATUSES[status] || { label: status || '-', tone: 'muted' };
  return <span className={`ca-tone-pill ca-tone-pill--${tone}`}>{label}</span>;
}

function FocusPill({ count }) {
  if (count === 0) return null;
  return (
    <span className="ca-tone-pill ca-tone-pill--warn" title={`Lost window focus ${plural(count, 'time')}`}>
      {plural(count, 'focus loss', 'focus losses')}
    </span>
  );
}

function TakerName({ attempt }) {
  return (
    <span className="ca-person-name">
      {attempt.studentName}
      {attempt.schoolId && <span className="ca-person-id">{attempt.schoolId}</span>}
      {attempt.attemptNumber > 1 && <span className="ca-person-id">Attempt {attempt.attemptNumber}</span>}
    </span>
  );
}

// "Finished in 14m 3s", "14m 3s so far" or "Missed"
function describeTime(attempt) {
  if (attempt.status === 'missed') return 'Missed the exam';
  if (attempt.status === 'submitted') return `Finished in ${formatDuration(attempt.durationMs)}`;
  return `${formatDuration(attempt.durationMs)} so far`;
}

// One taker: who they are and where they stand, then everything they did, oldest first
function TakerLog({ attempt, isAlumni, onBack, backRef }) {
  const focusLost = focusLostCount(attempt);
  const noun = isAlumni ? 'alumni' : 'students';

  return (
    <>
      <section className="question-panel">
        <div className="question-panel-label ca-section-head">
          <span>{isAlumni ? 'Alumni' : 'Student'}</span>
          <button type="button" className="ca-head-btn" onClick={onBack} ref={backRef}>
            <span aria-hidden="true">‹</span> All {noun}
          </button>
        </div>
        <div className="question-panel-body ca-person-head">
          <span className="ca-person-text">
            <TakerName attempt={attempt} />
            <span className="ca-person-meta">{attempt.studentEmail}</span>
          </span>
          <span className="ca-person-result">
            <TakerPill status={attempt.status} />
          </span>
        </div>
        <div className="ca-stats el-taker-stats" style={{ '--ca-stat-columns': 4 }}>
          <div className="ca-stat">
            <span className="ca-stat-label">Answered</span>
            <strong className="ca-stat-value">{attempt.answeredCount}/{attempt.totalQuestions}</strong>
            <span className="ca-stat-sub">{attempt.progressPercent}% of the exam</span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Time</span>
            <strong className="ca-stat-value">{attempt.status === 'missed' ? '-' : formatDuration(attempt.durationMs)}</strong>
            <span className="ca-stat-sub">{attempt.status === 'submitted' ? 'to finish' : attempt.status === 'missed' ? 'missed the exam' : 'so far'}</span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Started</span>
            <strong className="ca-stat-value">{attempt.startTime ? formatTime(attempt.startTime) : '-'}</strong>
            <span className="ca-stat-sub">{attempt.startTime ? formatDate(attempt.startTime) : 'Not started'}</span>
          </div>
          <div className="ca-stat">
            <span className="ca-stat-label">Lost focus</span>
            <strong className={`ca-stat-value${focusLost > 0 ? ' el-stat-value--warn' : ''}`}>{focusLost}</strong>
            <span className="ca-stat-sub">{focusLost === 1 ? 'time' : 'times'}</span>
          </div>
        </div>
      </section>

      <section className="question-panel">
        <p className="question-panel-label">Activity ({attempt.events.length})</p>
        {attempt.events.length === 0 ? (
          <p className="ca-hint ca-hint--section">No activity recorded yet.</p>
        ) : (
          <ol className="el-events">
            {attempt.events.map((event, index) => (
              <li key={`${event.type}-${event.timestamp}-${index}`} className="el-event">
                <span className={`el-event-icon el-event-icon--${event.type}`} aria-hidden="true">
                  <MarkerIcon>{EVENT_ICONS[event.type] || EVENT_ICONS.progress}</MarkerIcon>
                </span>
                <span className="el-event-text">
                  <span className="el-event-label">{event.label}</span>
                  {event.detail && <span className="el-event-detail">{event.detail}</span>}
                </span>
                <time className="el-event-time" dateTime={event.timestamp}>
                  <span>{formatTime(event.timestamp)}</span>
                  <span className="el-event-date">{formatDate(event.timestamp)}</span>
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

// The open exam: how its takers are doing, the takers themselves (each opening their own log), and
// the exam's details. Keyed by exam, so its filters and the open taker start fresh for each exam.
function ExamActivity({ exam, logs, refreshing, onRefresh, scrollRef }) {
  const isAlumni = getAudience(exam) === 'alumni';
  const noun = isAlumni ? 'alumni' : 'students';
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('recent');
  // One taker open at a time, in place of the list
  const [openId, setOpenId] = useState(null);
  const listScrollTop = useRef(0);
  const backRef = useRef(null);
  const lastOpenId = useRef(null);

  const { attempts } = logs;
  const counts = useMemo(() => {
    const result = { all: attempts.length, in_progress: 0, submitted: 0, missed: 0 };
    attempts.forEach((attempt) => {
      if (attempt.status in result) result[attempt.status] += 1;
    });
    return result;
  }, [attempts]);

  const focus = useMemo(() => {
    const perTaker = attempts.map(focusLostCount);
    return { times: perTaker.reduce((sum, count) => sum + count, 0), takers: perTaker.filter(Boolean).length };
  }, [attempts]);

  const visibleAttempts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const listed = attempts.filter((attempt) => {
      if (statusFilter !== 'all' && attempt.status !== statusFilter) return false;
      if (!query) return true;
      return [attempt.studentName, attempt.studentEmail, attempt.schoolId]
        .some((value) => (value || '').toLowerCase().includes(query));
    });
    return listed.sort((a, b) => {
      if (sortOrder === 'name') return (a.studentName || '').localeCompare(b.studentName || '');
      if (sortOrder === 'focus') return focusLostCount(b) - focusLostCount(a);
      return new Date(b.startTime || 0) - new Date(a.startTime || 0);
    });
  }, [attempts, statusFilter, searchQuery, sortOrder]);

  const openAttempt = openId ? attempts.find((attempt) => String(attempt.attemptId) === openId) || null : null;

  // Opening a taker starts the panel at the top, with focus on the way back; going back returns to
  // the same place in the list, with focus on that taker's row
  useEffect(() => {
    const container = scrollRef.current;
    if (openAttempt) {
      if (lastOpenId.current !== openId) {
        if (container) container.scrollTop = 0;
        backRef.current?.focus({ preventScroll: true });
      }
      lastOpenId.current = openId;
    } else if (lastOpenId.current) {
      if (container) container.scrollTop = listScrollTop.current;
      container?.querySelector(`[data-person-key="${CSS.escape(lastOpenId.current)}"]`)?.focus({ preventScroll: true });
      lastOpenId.current = null;
    }
  }, [openAttempt, openId, scrollRef]);

  function openTaker(id) {
    listScrollTop.current = scrollRef.current?.scrollTop || 0;
    setOpenId(id);
  }

  if (logs.loading) return <p className="ca-panel-note">Loading activity...</p>;
  if (logs.error) {
    return (
      <div className="ca-retry">
        <p className="ca-panel-note ca-panel-note--error" role="alert">{logs.error}</p>
        <button type="button" className="ca-btn ca-btn--plain" onClick={onRefresh}>Try again</button>
      </div>
    );
  }

  if (openAttempt) {
    return <TakerLog attempt={openAttempt} isAlumni={isAlumni} onBack={() => setOpenId(null)} backRef={backRef} />;
  }

  return (
    <>
      <section className="question-panel">
        <p className="question-panel-label">Activity</p>
        <div className="ca-stats" style={{ '--ca-stat-columns': 4 }}>
          <div className="ca-stat">
            <span className="ca-stat-label">Started</span>
            <strong className="ca-stat-value">{counts.all}</strong>
            <span className="ca-stat-sub">{counts.all === 1 ? 'taker' : 'takers'}</span>
          </div>
          {Object.entries(TAKER_STATUSES).map(([status, { label }]) => (
            <div key={status} className="ca-stat">
              <span className="ca-stat-label">{label}</span>
              <strong className="ca-stat-value">{counts[status]}</strong>
              <span className="ca-stat-sub">{counts.all > 0 ? `${Math.round((counts[status] / counts.all) * 100)}%` : '-'}</span>
            </div>
          ))}
        </div>
        <div className="el-summary-notes">
          <p className="ca-hint">
            {focus.times > 0
              ? `Window focus was lost ${plural(focus.times, 'time')}, by ${plural(focus.takers, 'taker')}.`
              : 'No one has lost window focus.'}
          </p>
          {logs.updatedAt && (
            <p className="ca-hint">
              {logs.live && <span className="el-live">Live</span>}
              Updated {formatTime(logs.updatedAt)}
              {logs.live ? `, and every ${POLL_MS / 1000} seconds while the exam runs.` : '.'}
            </p>
          )}
        </div>
      </section>

      <div className="ca-people-tools">
        <CapsuleFilters
          ariaLabel={`Filter ${noun} by where they stand`}
          options={TAKER_TABS.map((tab) => ({ ...tab, count: counts[tab.value] }))}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <div className="ca-people-controls">
          <SearchBar
            className="ca-people-search"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${noun} by name, ID, or email...`}
          />
          <DropdownSelect
            className="ca-people-sort"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            ariaLabel={`Sort ${noun}`}
            options={TAKER_SORTS}
          />
          <button type="button" className="ca-btn ca-btn--plain" onClick={onRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <section className="question-panel">
        <p className="question-panel-label">{isAlumni ? 'Alumni' : 'Students'} ({visibleAttempts.length})</p>
        {visibleAttempts.length === 0 ? (
          <p className="ca-hint ca-hint--section">
            {attempts.length === 0 ? `No ${noun} have started this exam yet.` : `No ${noun} match your filters.`}
          </p>
        ) : (
          <ul className="ca-people-list">
            {visibleAttempts.map((attempt) => {
              const id = String(attempt.attemptId);
              return (
                <li key={id} className="ca-people-item">
                  <button type="button" className="ca-person-row" data-person-key={id} onClick={() => openTaker(id)}>
                    <span className="ca-person-text">
                      <TakerName attempt={attempt} />
                      <span className="ca-person-meta">
                        {attempt.studentEmail}
                        {' · '}
                        {attempt.answeredCount} of {attempt.totalQuestions} answered
                        {' · '}
                        {describeTime(attempt)}
                      </span>
                    </span>
                    <span className="ca-person-result">
                      <FocusPill count={focusLostCount(attempt)} />
                      <TakerPill status={attempt.status} />
                    </span>
                    <span className="ca-row-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="ca-section ca-review-metadata">
        <div className="ca-meta-grid">
          <div>
            <span className="ca-meta-label">Audience</span>
            <div className="ca-meta-value">{isAlumni ? 'Alumni' : 'Students'}</div>
          </div>
          <div>
            <span className="ca-meta-label">Exam Status</span>
            <div className="ca-meta-value"><ExamStatePill status={exam.status} /></div>
          </div>
          <div>
            <span className="ca-meta-label">Exam Start</span>
            <div className="ca-meta-value">{formatDateTime(exam.startDateTime)}</div>
          </div>
          <div>
            <span className="ca-meta-label">Exam End</span>
            <div className="ca-meta-value">{formatDateTime(exam.endDateTime)}</div>
          </div>
        </div>
      </section>
    </>
  );
}

export default function ChairCheatingLogs({ me }) {
  const { notify } = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedAudience, setSelectedAudience] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  // The panel: the open exam and its activity
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [logs, setLogs] = useState(NO_LOGS);
  const [refreshing, setRefreshing] = useState(false);
  // Widened over the list, or covering the whole window
  const panelLayout = usePanelLayout(selectedExamId);
  const selectedIdRef = useRef(null);
  const panelContentRef = useRef(null);

  useEffect(() => {
    let ignore = false;
    apiAuth(`/api/stats/program-chair/exam-logs`)
      .then((data) => {
        if (ignore) return;
        setExams(data.exams || []);
        setLoading(false);
      })
      .catch((err) => {
        if (ignore) return;
        setListError(err.message || 'Failed to load exams.');
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Loads an exam's activity, along with a fresh exam list. A quiet reload keeps what is shown until
  // the new data arrives, and reports whether it worked.
  const loadLogs = useCallback(async (examId, { quiet = false } = {}) => {
    if (!quiet) setLogs({ ...NO_LOGS, examId, loading: true });
    try {
      const data = await apiAuth(`/api/stats/program-chair/exam-logs?examId=${encodeURIComponent(examId)}`);
      if (selectedIdRef.current !== examId) return true;
      setExams(data.exams || []);
      setLogs({
        examId,
        attempts: data.attempts || [],
        live: Boolean(data.examLive),
        updatedAt: data.serverTime || new Date().toISOString(),
        loading: false,
        error: '',
      });
      return true;
    } catch (err) {
      if (selectedIdRef.current !== examId) return true;
      if (!quiet) setLogs({ ...NO_LOGS, examId, error: err.message || 'Failed to load the activity logs.' });
      return false;
    }
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedExamId;
    if (selectedExamId) loadLogs(selectedExamId);
    else setLogs(NO_LOGS);
  }, [selectedExamId, loadLogs]);

  // A live exam's activity keeps itself up to date while it is open
  useEffect(() => {
    if (!selectedExamId || logs.examId !== selectedExamId || !logs.live) return undefined;
    const timer = setInterval(() => loadLogs(selectedExamId, { quiet: true }), POLL_MS);
    return () => clearInterval(timer);
  }, [selectedExamId, logs.examId, logs.live, loadLogs]);

  async function refresh() {
    if (!selectedExamId) return;
    if (logs.error) {
      loadLogs(selectedExamId);
      return;
    }
    setRefreshing(true);
    const ok = await loadLogs(selectedExamId, { quiet: true });
    setRefreshing(false);
    if (!ok) notify('Could not refresh the activity logs.', { variant: 'error' });
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedState, selectedAudience, sortBy]);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, searchQuery, selectedState, selectedAudience, sortBy]);

  // ...and the open exam's card stays in view when the columns change, once they finish gliding
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedExamId, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedExamId) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedExamId]);

  const filteredExceptState = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return exams.filter((exam) => {
      if (query && !(exam.name || '').toLowerCase().includes(query)) return false;
      if (selectedAudience && getAudience(exam) !== selectedAudience) return false;
      return true;
    });
  }, [exams, searchQuery, selectedAudience]);

  const stateCounts = useMemo(() => {
    const counts = { all: filteredExceptState.length };
    filteredExceptState.forEach((exam) => {
      counts[exam.status] = (counts[exam.status] || 0) + 1;
    });
    return counts;
  }, [filteredExceptState]);

  // Newest is the latest exam date first; exams without a date go last either way
  const visibleExams = useMemo(() => {
    const listed = selectedState
      ? filteredExceptState.filter((exam) => exam.status === selectedState)
      : filteredExceptState;
    const examTime = (exam) => (exam.startDateTime ? new Date(exam.startDateTime).getTime() : null);
    return [...listed].sort((a, b) => {
      const timeA = examTime(a);
      const timeB = examTime(b);
      if (timeA === null || timeB === null) return (timeA === null) - (timeB === null);
      return sortBy === 'oldest' ? timeA - timeB : timeB - timeA;
    });
  }, [filteredExceptState, selectedState, sortBy]);

  const paginatedExams = visibleExams.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const selectedExam = exams.find((exam) => exam._id === selectedExamId) || null;
  const hasActiveFilters = Boolean(searchQuery.trim() || selectedState || selectedAudience);

  function clearFilters() {
    setSearchQuery('');
    setSelectedState('');
    setSelectedAudience('');
  }

  function renderExamCard(exam, cardIndex) {
    const audience = getAudience(exam);
    return (
      <div
        key={exam._id}
        className={`ca-question-card ${exam._id === selectedExamId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => setSelectedExamId(exam._id)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{exam.name}</span>
          </button>
          <div className="ca-card-markers">
            <Marker className="ca-marker--audience" label={AUDIENCE_LABELS[audience]}>
              <AudienceMarkerIcon audience={audience} />
            </Marker>
            <Marker className={`ca-exam-state--${exam.status}`} label={EXAM_STATUSES[exam.status]?.label || exam.status}>
              <MarkerIcon>{EXAM_STATUSES[exam.status]?.icon}</MarkerIcon>
            </Marker>
          </div>
        </div>
        <div className="ca-card-meta">
          <span className="ca-card-meta-datetime">
            {exam.startDateTime ? (
              <>
                <span className="ca-date">{formatDate(exam.startDateTime)}</span>
                <span className="ca-time">{formatTime(exam.startDateTime)}</span>
              </>
            ) : (
              <span className="ca-date">Not scheduled</span>
            )}
          </span>
        </div>
      </div>
    );
  }

  return (
    <main className="el-page ca-page page-shell">
      <PageHeader
        title="Logs"
        subtitle="Monitor exam activity for your program — start, window focus, submission, and progress."
      >
        <span className="ca-program-chip">{me?.program?.name || 'Your Program'}</span>
      </PageHeader>

      <CapsuleFilters
        className="ca-state-pills"
        ariaLabel="Filter exams by status"
        options={STATE_TABS.map((tab) => ({
          value: tab.value,
          label: tab.label,
          count: tab.value ? (stateCounts[tab.value] || 0) : stateCounts.all,
        }))}
        value={selectedState}
        onChange={setSelectedState}
      />

      <QuestionFilters
        className="ca-filters-wrapper"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search exams by name..."
        sortBy={sortBy}
        onSortChange={setSortBy}
        extraFilters={(
          <DropdownSelect
            className="el-filter-audience"
            value={selectedAudience}
            onChange={(event) => setSelectedAudience(event.target.value)}
            ariaLabel="Filter exams by audience"
            placeholder="Filter: All Audiences"
            options={[
              { value: 'student', label: 'Student Exams' },
              { value: 'alumni', label: 'Alumni Exams' },
            ]}
          />
        )}
      />

      <div className={panelLayout.layoutClass(Boolean(selectedExam))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Exams">
          <MarkerLegend items={LEGEND_ITEMS} ariaLabel="What the exam markers mean" />

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading exams...</div>
            ) : listError ? (
              <div className="ca-empty" role="alert">{listError}</div>
            ) : visibleExams.length === 0 ? (
              <div className="ca-empty">
                <p className="el-empty-text">
                  {exams.length === 0
                    ? 'No published exams yet. Once an exam for your program is published, its activity shows here.'
                    : 'No exams match your filters.'}
                </p>
                {exams.length > 0 && hasActiveFilters && (
                  <button type="button" className="ca-btn ca-btn--plain el-clear-filters" onClick={clearFilters}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div className="ca-questions-list" key={[selectedState, selectedAudience, sortBy, currentPage].join('|')}>
                {paginatedExams.map(renderExamCard)}
              </div>
            )}
          </div>

          {!loading && !listError && (
            <Pagination
              currentPage={currentPage}
              totalItems={visibleExams.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
              itemLabel={visibleExams.length === 1 ? 'exam' : 'exams'}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedExam ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={selectedExam.name}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedExamId(null)}
              closeLabel="Close exam activity"
            />

            {/* Keyed so each exam starts scrolled to the top */}
            <div className="ca-sidebar-content" key={selectedExam._id} ref={panelContentRef}>
              <ExamActivity
                key={selectedExam._id}
                exam={selectedExam}
                logs={logs.examId === selectedExam._id ? logs : { ...NO_LOGS, loading: true }}
                refreshing={refreshing}
                onRefresh={refresh}
                scrollRef={panelContentRef}
              />
            </div>
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select an exam to see its activity</p>
          </div>
        )}
      </div>
    </main>
  );
}
