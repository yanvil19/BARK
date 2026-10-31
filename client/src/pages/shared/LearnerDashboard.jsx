import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import {
  addDays,
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
import { IconArrowLeft, IconArrowRight } from '../../components/CalendarIcons.jsx';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { apiAuth } from '../../lib/api.js';
import { formatExamTimeRange, getCalendarRange } from '../../utils/calendarUtils.js';
import '../../styles/shared/LearnerDashboard.css';

ChartJS.register(BarElement, CategoryScale, Filler, LinearScale, LineElement, PointElement, Tooltip);

const DAY_MS = 24 * 60 * 60 * 1000;
const PROGRESS_ATTEMPT_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 5;
const EXAM_LIST_LIMIT = 3;
const ANNOUNCEMENT_LIMIT = 8;
const MAX_DAY_DOTS = 3;
// Exams published this recently get a "New" tag
const NEW_EXAM_DAYS = 3;
// Subjects this close under the passing mark are amber, same as the server's near-pass rule
const NEAR_PASS_POINTS = 10;

// Everything that differs between the student and alumni dashboards
const AUDIENCES = {
  student: {
    attemptsUrl: '/api/student-exams/my-attempts',
    examsUrl: '/api/student-exams/available',
    idField: 'studentId',
    idLabel: 'Student ID',
    fallbackName: 'Student',
    examsRoute: 'studentAvailableExams',
    resultsRoute: 'studentExamResults',
  },
  alumni: {
    attemptsUrl: '/api/alumni-exams/my-attempts',
    examsUrl: '/api/alumni-exams/available',
    idField: 'alumniId',
    idLabel: 'Alumni ID',
    fallbackName: 'Alumni',
    examsRoute: 'alumniAvailableExams',
    resultsRoute: 'alumniExamResults',
  },
};

const WINDOW_LABELS = {
  open: 'Open',
  closing: 'Closing soon',
  upcoming: 'Upcoming',
  completed: 'Completed',
};

// ─── Formatting ──────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return 'TBA';
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return 'TBA';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMinutes(minutes) {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return 'Untimed';
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  return hours ? `${hours}h` : `${mins}m`;
}

function formatCountdown(target, now) {
  const diff = new Date(target).getTime() - now;
  if (diff <= 0) return 'any moment now';
  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// Student and alumni IDs start with the batch year ("2024-123456" is batch 2024)
function getBatch(id) {
  return String(id || '').match(/^(\d{4})-/)?.[1] || null;
}

// ─── Attempts ────────────────────────────────────────────────────────────────

// Student results stay hidden until release; the server sends no score before then
function hasResult(attempt) {
  return attempt.rawScore != null && Number(attempt.totalScore) > 0;
}

function getPercent(attempt) {
  return Math.round((Number(attempt.rawScore) / Number(attempt.totalScore)) * 100);
}

function getResultStatus(attempt) {
  if (!hasResult(attempt)) return { key: 'pending', label: 'Pending release' };
  if (attempt.status === 'passed') return { key: 'passed', label: 'Passed' };
  if (attempt.status === 'near_pass') return { key: 'near', label: 'Near pass' };
  return { key: 'failed', label: 'Not passed' };
}

// Green at or above the passing mark, amber up to 10 points under it, red below that.
// Shared by the subject chart and the subject table.
function getScoreColor(percent, passingMark) {
  if (percent >= passingMark) return '#16a34a';
  if (percent >= passingMark - NEAR_PASS_POINTS) return '#d97706';
  return '#dc2626';
}

function summarizeSubjects(attempts) {
  const subjects = new Map();
  attempts.forEach((attempt) => {
    (attempt.subjectScores || []).forEach((score) => {
      const name = score.name || 'Untitled subject';
      const entry = subjects.get(name) || { name, correct: 0, total: 0 };
      entry.correct += Number(score.correct) || 0;
      entry.total += Number(score.total) || 0;
      subjects.set(name, entry);
    });
  });

  return [...subjects.values()]
    .filter((subject) => subject.total > 0)
    .map((subject) => ({
      ...subject,
      percent: Math.round((subject.correct / subject.total) * 100),
      missed: subject.total - subject.correct,
    }))
    .sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));
}

// ─── Available exams ─────────────────────────────────────────────────────────

// open: can be taken now · closing: open with a day or less left · upcoming: not open yet
function getExamWindow(exam, audience, now) {
  if (audience === 'student') {
    if (exam.examCardStatus === 'upcoming') return 'upcoming';
    return exam.examCardStatus === 'closing_soon' ? 'closing' : 'open';
  }
  if (exam.status !== 'ongoing') return 'upcoming';
  const end = exam.endDateTime ? new Date(exam.endDateTime).getTime() : null;
  return end && end - now <= DAY_MS ? 'closing' : 'open';
}

function getExamAction(exam) {
  if (exam.window === 'upcoming') return { label: 'Opens soon', short: 'Soon', disabled: true };
  // Students get one attempt per exam; alumni can retake
  if (exam.completed) return { label: 'Completed', short: 'Done', disabled: true };
  if (exam.attempted) return { label: 'Retake exam', short: 'Retake', disabled: false };
  return { label: 'Take exam', short: 'Take', disabled: false };
}

function getAttemptsText(exam, audience) {
  if (audience === 'student') return exam.completed ? 'Used (1 of 1)' : '1 allowed';
  return exam.attemptCount ? `Unlimited · ${exam.attemptCount} taken` : 'Unlimited';
}

function getExamFacts(exam, audience) {
  return [
    { label: 'Duration', value: formatMinutes(exam.durationMinutes) },
    { label: 'Questions', value: exam.questionCount ?? 0 },
    exam.window === 'upcoming'
      ? { label: 'Opens', value: formatDateTime(exam.startDateTime) }
      : { label: 'Closes', value: exam.endDateTime ? formatDateTime(exam.endDateTime) : 'No end date' },
    { label: 'Attempts', value: getAttemptsText(exam, audience) },
  ];
}

function getExamSubtitle(exam) {
  const program = exam.program?.name || exam.program?.code;
  const subjects = (exam.subjectTags || []).map((tag) => tag.name).filter(Boolean);
  return [program, subjects.join(', ')].filter(Boolean).join(' · ');
}

// Exams whose schedule touches the day; exams without an end date show on their start day only
function getExamsOnDay(exams, day) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return exams.filter((exam) => {
    if (!exam.startDateTime) return false;
    const start = new Date(exam.startDateTime);
    if (!exam.endDateTime) return start >= dayStart && start < dayEnd;
    return start < dayEnd && new Date(exam.endDateTime) > dayStart;
  });
}

function formatExamHours(exam) {
  if (exam.endDateTime) return formatExamTimeRange(exam);
  return `Starts ${format(new Date(exam.startDateTime), 'h:mm a')} · no end date`;
}

// ─── Charts ──────────────────────────────────────────────────────────────────

// Draws each score above its point, and names the dashed passing line near its right end
const pointLabelPlugin = {
  id: 'ldPointLabels',
  afterDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const [scores, passing] = chart.data.datasets;
    ctx.save();
    ctx.font = '700 11px Nunito, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#1a2342';
    chart.getDatasetMeta(0).data.forEach((point, index) => {
      ctx.fillText(`${scores.data[index]}%`, point.x, point.y - 8);
    });

    const passingPoints = chart.getDatasetMeta(1).data;
    const lastIndex = passingPoints.length - 1;
    const lastMark = passing?.data[lastIndex];
    if (lastMark != null) {
      // Ends short of the last point so it clears that point's score label
      ctx.textAlign = 'right';
      ctx.fillStyle = '#16a34a';
      ctx.fillText(`Passing mark ${lastMark}%`, chartArea.right - 24, passingPoints[lastIndex].y - 5);
    }
    ctx.restore();
  },
};

function shortenLabel(label, max = 14) {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

// Ticks every 30 seconds so clocks and countdowns stay current
function useNow(enabled, intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs]);
  return now;
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Card({ title, subtitle, action, className = '', children, cardRef }) {
  return (
    <section className={`ld-card ${className}`.trim()} ref={cardRef}>
      <header className="ld-card-head">
        <div>
          <h2 className="ld-card-title">{title}</h2>
          {subtitle ? <p className="ld-card-sub">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function StatCard({ label, value, detail, featured = false }) {
  return (
    <article className={`ld-stat${featured ? ' ld-stat--featured' : ''}`}>
      <span className="ld-stat-label">{label}</span>
      <strong className="ld-stat-value" title={typeof value === 'string' ? value : undefined}>{value}</strong>
      <span className="ld-stat-detail">{detail}</span>
    </article>
  );
}

// Keeps its own clock so the rest of the dashboard doesn't re-render every tick
function TodayStat() {
  const now = useNow(true);
  return <StatCard label="Today" value={format(now, 'MMMM d, yyyy')} detail={format(now, 'EEEE · h:mm a')} />;
}

function EmptyText({ children }) {
  return <p className="ld-empty">{children}</p>;
}

function WindowChip({ window: examWindow }) {
  return <span className={`ld-chip ld-chip--${examWindow}`}>{WINDOW_LABELS[examWindow]}</span>;
}

function NewTag() {
  return <span className="ld-new">New</span>;
}

function getInitials(me, fallbackName) {
  const words = String(me?.name || me?.firstName || fallbackName).trim().split(/\s+/);
  const first = words[0]?.[0] || '';
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/**
 * Dashboard shared by students and alumni.
 * - audience: 'student' | 'alumni'
 * - onNavigate(route): go to another page
 * - onTakeExam(examId): start an exam (same flow as the Available Exams page)
 * - onViewResults(examId): open the results page for an exam
 * - onMeRefresh(): reload the signed-in user after the board exam countdown is saved
 */
export default function LearnerDashboard({ me, audience = 'student', onNavigate, onTakeExam, onViewResults, onMeRefresh }) {
  const config = AUDIENCES[audience] || AUDIENCES.student;
  const [attempts, setAttempts] = useState([]);
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [examsError, setExamsError] = useState('');
  const [subjectsExpanded, setSubjectsExpanded] = useState(false);
  const subjectsRef = useRef(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setError('');
      setExamsError('');
      const [attemptsResult, examsResult] = await Promise.allSettled([
        apiAuth(config.attemptsUrl),
        apiAuth(config.examsUrl),
      ]);
      if (!alive) return;

      if (attemptsResult.status === 'fulfilled') {
        const sorted = (attemptsResult.value?.attempts || [])
          .filter((attempt) => attempt.examName && attempt.examName !== 'Unknown Exam')
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        setAttempts(sorted);
      } else {
        setError(attemptsResult.reason?.message || 'Failed to load dashboard data.');
      }

      if (examsResult.status === 'fulfilled') {
        setExams(Array.isArray(examsResult.value?.exams) ? examsResult.value.exams : []);
      } else {
        setExamsError('Could not load available exams.');
      }
      setLoading(false);
    }

    load();
    return () => {
      alive = false;
    };
  }, [config.attemptsUrl, config.examsUrl]);

  const hasPending = attempts.some((attempt) => !hasResult(attempt) && attempt.resultReleasedAt);
  const now = useNow(hasPending);

  const scored = useMemo(() => attempts.filter(hasResult), [attempts]);
  const subjects = useMemo(() => summarizeSubjects(scored), [scored]);

  const summary = useMemo(() => {
    const latest = scored[0] || null;
    const best = scored.reduce((top, attempt) => (!top || getPercent(attempt) > getPercent(top) ? attempt : top), null);
    const average = scored.length
      ? Math.round(scored.reduce((sum, attempt) => sum + getPercent(attempt), 0) / scored.length)
      : null;
    const passed = scored.filter((attempt) => attempt.status === 'passed').length;
    const weakest = subjects.length ? subjects[subjects.length - 1] : null;
    // The subject with the most missed items lifts the average the most once improved
    const focus = subjects.reduce(
      (top, subject) => (!top || subject.missed > top.missed || (subject.missed === top.missed && subject.percent < top.percent) ? subject : top),
      null
    );
    return { latest, best, average, passed, weakest, focus };
  }, [scored, subjects]);

  const examCards = useMemo(() => {
    const attemptCounts = new Map();
    attempts.forEach((attempt) => {
      const key = String(attempt.examId || '');
      attemptCounts.set(key, (attemptCounts.get(key) || 0) + 1);
    });
    const order = { open: 0, closing: 0, upcoming: 1, completed: 2 };
    const loadedAt = Date.now();
    return exams
      .map((exam) => {
        const attemptCount = attemptCounts.get(String(exam._id)) || 0;
        const attempted = attemptCount > 0;
        const completed = audience === 'student' && attempted;
        const examWindow = getExamWindow(exam, audience, loadedAt);
        const isNew = Boolean(exam.publishedAt) && loadedAt - new Date(exam.publishedAt).getTime() <= NEW_EXAM_DAYS * DAY_MS;
        return { ...exam, attemptCount, attempted, completed, isNew, window: completed ? 'completed' : examWindow };
      })
      .sort((a, b) => (
        order[a.window] - order[b.window]
        || new Date(b.publishedAt || b.startDateTime || 0) - new Date(a.publishedAt || a.startDateTime || 0)
      ));
  }, [exams, attempts, audience]);

  const announcements = useMemo(
    () => exams
      .filter((exam) => exam.publishedAt)
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
      .slice(0, ANNOUNCEMENT_LIMIT),
    [exams]
  );

  const firstName = me?.firstName || me?.name?.split(' ')[0] || config.fallbackName;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const learnerId = me?.[config.idField];

  const openCount = examCards.filter((exam) => exam.window === 'open' || exam.window === 'closing').length;
  const upcomingCount = examCards.filter((exam) => exam.window === 'upcoming').length;
  const passingMark = summary.latest?.passingThreshold ?? null;

  let heroLead = 'Welcome back. No exams are open for you right now.';
  if (loading) heroLead = 'Welcome back.';
  else if (openCount) heroLead = `Welcome back. ${plural(openCount, 'exam')} ${openCount === 1 ? 'is' : 'are'} open for you right now.`;

  function openSubjectAccuracy() {
    setSubjectsExpanded(true);
    subjectsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="ld-page page-shell">
      {/* ── Hero ── */}
      <section className="ld-hero">
        <span className="ld-avatar" aria-hidden="true">{getInitials(me, config.fallbackName)}</span>
        <div className="ld-hero-main">
          <h1 className="ld-hero-title">{greeting}, {firstName}</h1>
          <p className="ld-hero-lead">{heroLead}</p>
          <dl className="ld-hero-facts">
            <div><dt>Program</dt><dd>{me?.program?.name || 'Not assigned'}</dd></div>
            <div><dt>School</dt><dd>{me?.department?.name || 'Not assigned'}</dd></div>
            <div><dt>Batch</dt><dd>{getBatch(learnerId) || '—'}</dd></div>
            <div><dt>{config.idLabel}</dt><dd>{learnerId || '—'}</dd></div>
          </dl>
        </div>
        <div className="ld-hero-actions">
          <button type="button" className="ld-btn ld-btn--yellow" onClick={() => onNavigate?.(config.examsRoute)}>
            Browse available exams
          </button>
          <button type="button" className="ld-btn ld-btn--ghost" onClick={() => onNavigate?.(config.resultsRoute)}>
            My results
          </button>
        </div>
      </section>

      {loading || error ? (
        <p className={error ? 'ld-state ld-state--error' : 'ld-state'}>{error || 'Loading dashboard...'}</p>
      ) : (
        <>
          {/* ── Stats ── */}
          <div className="ld-stats">
            <StatCard
              featured
              label="Overview"
              value={plural(attempts.length, 'attempt')}
              detail={summary.latest
                ? `Latest score ${summary.latest.rawScore}/${summary.latest.totalScore}`
                : attempts.length ? 'Latest result is pending release' : 'No attempts yet'}
            />
            <StatCard
              label="Performance"
              value={summary.average != null ? `${summary.average}% average` : '—'}
              detail={scored.length ? `${summary.passed} of ${scored.length} passed` : 'No results yet'}
            />
            <StatCard
              label="Subjects"
              value={summary.weakest?.name || '—'}
              detail={summary.weakest
                ? `Weakest · ${summary.weakest.percent}% · ${plural(subjects.length, 'subject')}`
                : 'No subject results yet'}
            />
            <TodayStat />
          </div>

          <div className="ld-layout">
            <div className="ld-body">
              {/* ── Progress ── */}
              <Card
                title="Score progress"
                subtitle="Each dot is an attempt · dashed line = passing mark"
                action={summary.latest ? (
                  <span className="ld-card-meta">
                    Latest <strong>{summary.latest.rawScore}/{summary.latest.totalScore}</strong>
                    {' · '}Highest <strong>{summary.best.rawScore}/{summary.best.totalScore}</strong>
                  </span>
                ) : null}
              >
                <div className="ld-card-body">
                  {scored.length ? <ProgressChart attempts={scored} /> : <EmptyText>Your scores will show here once results are out.</EmptyText>}
                </div>
              </Card>

              <div className="ld-insights">
                <Card title="Distance to passing">
                  <div className="ld-card-body">
                    {summary.average != null && passingMark != null ? (
                      <PassingGauge average={summary.average} passingMark={passingMark} passed={summary.passed} total={scored.length} />
                    ) : (
                      <EmptyText>Take an exam to see how close you are to passing.</EmptyText>
                    )}
                  </div>
                </Card>

                <section className="ld-focus">
                  <span className="ld-focus-eyebrow">Do this next</span>
                  <h2>Practice this subject next</h2>
                  {summary.focus ? (
                    <>
                      <p>
                        <strong>{summary.focus.name}</strong> · {summary.focus.percent}% correct. You missed{' '}
                        {summary.focus.missed} of its {summary.focus.total} items, more than any other subject, so improving it
                        raises your average the most.
                      </p>
                      <button type="button" className="ld-btn ld-btn--yellow ld-btn--small" onClick={openSubjectAccuracy}>
                        See subject accuracy
                      </button>
                    </>
                  ) : (
                    <p>Once your results are out, this will point to the subject worth improving first.</p>
                  )}
                </section>
              </div>

              {/* ── New exams ── */}
              <Card
                title="New exams for you"
                subtitle={`${openCount} open · ${upcomingCount} upcoming · newest first`}
                action={(
                  <button type="button" className="ld-link" onClick={() => onNavigate?.(config.examsRoute)}>
                    Browse all available exams →
                  </button>
                )}
              >
                <div className="ld-card-body">
                  {examsError ? <EmptyText>{examsError}</EmptyText> : null}
                  {!examsError && examCards.length === 0 ? <EmptyText>No exams are available for you right now.</EmptyText> : null}
                  {!examsError && examCards.length > 0 ? (
                    <ExamsPanel
                      exams={examCards}
                      audience={audience}
                      onTakeExam={onTakeExam}
                      onBrowse={() => onNavigate?.(config.examsRoute)}
                    />
                  ) : null}
                </div>
              </Card>

              {/* ── Subject accuracy ── */}
              <Card
                cardRef={subjectsRef}
                className="ld-subjects-card"
                title={subjectsExpanded ? 'Full subject accuracy' : 'Subject accuracy'}
                subtitle={subjects.length
                  ? `Across ${plural(scored.length, 'scored attempt')} · colored against the ${passingMark}% passing mark`
                  : null}
                action={subjects.length ? (
                  <button type="button" className="ld-link" onClick={() => setSubjectsExpanded((prev) => !prev)}>
                    {subjectsExpanded ? 'Minimize view' : 'Full view'}
                  </button>
                ) : null}
              >
                {subjects.length ? (
                  <>
                    {subjectsExpanded ? (
                      <div className="ld-card-body ld-subject-chart">
                        <SubjectChart subjects={subjects} passingMark={passingMark} />
                      </div>
                    ) : null}
                    <SubjectTable subjects={subjects} passingMark={passingMark} />
                  </>
                ) : (
                  <div className="ld-card-body"><EmptyText>Subject results will show here once your results are out.</EmptyText></div>
                )}
              </Card>

              {/* ── Recent activity ── */}
              <Card
                title="Recent exam activity"
                action={(
                  <button type="button" className="ld-link" onClick={() => onNavigate?.(config.resultsRoute)}>
                    See all results →
                  </button>
                )}
              >
                {attempts.length ? (
                  <ul className="ld-activity">
                    {attempts.slice(0, RECENT_ACTIVITY_LIMIT).map((attempt) => {
                      const status = getResultStatus(attempt);
                      return (
                        <li key={attempt.id} className="ld-activity-row">
                          <div className="ld-activity-main">
                            <strong title={attempt.examName}>{attempt.examName}</strong>
                            <span>{formatDateTime(attempt.date)}</span>
                          </div>
                          <div className="ld-activity-score">
                            {hasResult(attempt) ? (
                              `${attempt.rawScore}/${attempt.totalScore}`
                            ) : (
                              <span className="ld-activity-release">
                                {attempt.resultReleasedAt
                                  ? `Results in ${formatCountdown(attempt.resultReleasedAt, now)}`
                                  : 'Release date TBA'}
                              </span>
                            )}
                          </div>
                          <div className="ld-activity-side">
                            <span className={`ld-pill ld-pill--${status.key}`}>{status.label}</span>
                            {hasResult(attempt) ? (
                              <button type="button" className="ld-link ld-link--small" onClick={() => onViewResults?.(attempt.examId)}>
                                View results
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="ld-card-body"><EmptyText>No exam attempts yet.</EmptyText></div>
                )}
              </Card>
            </div>

            {/* ── Sidebar ── */}
            <aside className="ld-sidebar">
              <CountdownCard saved={me?.boardExamCountdown} onSaved={onMeRefresh} />
              <ExamCalendar exams={examCards} error={examsError} />
              <AnnouncementsCard announcements={announcements} error={examsError} />
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

// Memoized so the clocks ticking elsewhere don't replay the chart animation
const ProgressChart = memo(function ProgressChart({ attempts }) {
  // Oldest first, numbered across every scored attempt
  const ordered = [...attempts].reverse();
  const offset = Math.max(0, ordered.length - PROGRESS_ATTEMPT_LIMIT);
  const shown = ordered.slice(offset);

  const data = {
    labels: shown.map((_, index) => `Attempt ${offset + index + 1}`),
    datasets: [
      {
        label: 'Score',
        data: shown.map(getPercent),
        borderColor: '#35408e',
        backgroundColor: 'rgba(53, 64, 142, 0.08)',
        fill: 'origin',
        pointBackgroundColor: '#35408e',
        pointRadius: 5,
        pointHoverRadius: 6,
        tension: 0,
      },
      {
        label: 'Passing mark',
        data: shown.map((attempt) => attempt.passingThreshold ?? null),
        borderColor: '#16a34a',
        borderDash: [6, 6],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 20, right: 12 } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => shown[items[0].dataIndex]?.examName || '',
          label: (item) => (item.datasetIndex === 0
            ? `Score: ${item.raw}% (${shown[item.dataIndex].rawScore}/${shown[item.dataIndex].totalScore})`
            : `Passing mark: ${item.raw}%`),
        },
      },
    },
    scales: {
      y: { min: 0, max: 100, ticks: { stepSize: 25, callback: (value) => `${value}%` }, grid: { color: '#eef0f8' } },
      x: { grid: { display: false } },
    },
  };

  return (
    <div className="ld-chart ld-chart--progress">
      <Line data={data} options={options} plugins={[pointLabelPlugin]} />
    </div>
  );
});

function PassingGauge({ average, passingMark, passed, total }) {
  const gap = passingMark - average;
  const isAbove = gap <= 0;
  return (
    <div className="ld-gauge">
      <div
        className={`ld-ring${isAbove ? ' is-above' : ''}`}
        style={{ '--ld-ring-value': `${Math.min(Math.max(average, 0), 100)}%` }}
      >
        <div className="ld-ring-inner">
          <strong>{average}%</strong>
          <span>average</span>
        </div>
      </div>
      <div className="ld-gauge-text">
        <span className="ld-gauge-label">{isAbove ? 'Above the passing mark' : 'Distance to passing'}</span>
        <strong className={isAbove ? 'is-above' : ''}>{isAbove ? `+${Math.abs(gap)}%` : `${gap}% to go`}</strong>
        <span className="ld-gauge-meta">
          Passing mark: {passingMark}% (latest exam) · Pass rate {passed} of {total}
        </span>
      </div>
    </div>
  );
}

function ExamsPanel({ exams, audience, onTakeExam, onBrowse }) {
  const [featured, ...rest] = exams;
  const listed = rest.slice(0, EXAM_LIST_LIMIT);
  const moreCount = rest.length - listed.length;
  const featuredAction = getExamAction(featured);

  return (
    <div className="ld-exams">
      <article className="ld-featured">
        <div className="ld-featured-top">
          <span className="ld-featured-eyebrow">
            {featured.window === 'upcoming' ? 'Coming up' : 'Newest'}
            {featured.isNew ? <NewTag /> : null}
          </span>
          <WindowChip window={featured.window} />
        </div>
        <h3 title={featured.name}>{featured.name}</h3>
        <p className="ld-featured-sub">{getExamSubtitle(featured) || 'Mock board exam'}</p>
        <dl className="ld-featured-facts">
          {getExamFacts(featured, audience).map((fact) => (
            <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
          ))}
        </dl>
        <button
          type="button"
          className="ld-btn ld-btn--yellow ld-btn--block"
          disabled={featuredAction.disabled}
          onClick={() => onTakeExam?.(featured._id)}
        >
          {featured.window === 'upcoming' ? `Opens ${formatDateTime(featured.startDateTime)}` : featuredAction.label}
        </button>
      </article>

      <div className="ld-exam-list">
        {listed.length ? (
          <ul>
            {listed.map((exam) => {
              const action = getExamAction(exam);
              const [duration, questions, when] = getExamFacts(exam, audience);
              return (
                <li key={exam._id} className="ld-exam-row">
                  <div className="ld-exam-main">
                    <span className="ld-exam-name">
                      <strong title={exam.name}>{exam.name}</strong>
                      {exam.isNew ? <NewTag /> : null}
                    </span>
                    <span>{duration.value} · {questions.value} questions · {when.label.toLowerCase()} {when.value}</span>
                  </div>
                  <WindowChip window={exam.window} />
                  <button
                    type="button"
                    className="ld-btn ld-btn--navy ld-btn--small"
                    disabled={action.disabled}
                    onClick={() => onTakeExam?.(exam._id)}
                  >
                    {action.short}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyText>No other exams right now.</EmptyText>
        )}
        {moreCount > 0 ? (
          <button type="button" className="ld-link ld-link--center" onClick={onBrowse}>
            +{moreCount} more {moreCount === 1 ? 'exam' : 'exams'} · Browse all
          </button>
        ) : null}
      </div>
    </div>
  );
}

const SubjectChart = memo(function SubjectChart({ subjects, passingMark }) {
  const data = {
    labels: subjects.map((subject) => subject.name),
    datasets: [{
      data: subjects.map((subject) => subject.percent),
      backgroundColor: subjects.map((subject) => getScoreColor(subject.percent, passingMark)),
      borderRadius: 4,
      maxBarThickness: 56,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (item) => {
            const subject = subjects[item.dataIndex];
            return `${subject.percent}% · ${subject.correct}/${subject.total} correct`;
          },
        },
      },
    },
    scales: {
      y: { min: 0, max: 100, ticks: { stepSize: 25, callback: (value) => `${value}%` }, grid: { color: '#eef0f8' } },
      x: { grid: { display: false }, ticks: { callback(value) { return shortenLabel(this.getLabelForValue(value)); } } },
    },
  };

  return (
    <div className="ld-chart ld-chart--subjects">
      <Bar data={data} options={options} />
    </div>
  );
});

function SubjectTable({ subjects, passingMark }) {
  return (
    <div className="ld-subject-table" role="table" aria-label="Subject accuracy">
      <div className="ld-subject-row ld-subject-row--head" role="row">
        <span role="columnheader">Subject</span>
        <span role="columnheader">Progress</span>
        <span role="columnheader" className="ld-num">%</span>
        <span role="columnheader" className="ld-num">Score</span>
      </div>
      {subjects.map((subject) => {
        const color = getScoreColor(subject.percent, passingMark);
        return (
          <div key={subject.name} className="ld-subject-row" role="row">
            <span role="cell" className="ld-subject-name" title={subject.name}>{subject.name}</span>
            <span role="cell" className="ld-bar-track">
              <span className="ld-bar-fill" style={{ width: `${subject.percent}%`, background: color }} />
            </span>
            <span role="cell" className="ld-num" style={{ color }}>{subject.percent}%</span>
            <span role="cell" className="ld-num ld-subject-score">{subject.correct}/{subject.total}</span>
          </div>
        );
      })}
    </div>
  );
}

function getCountdownParts(target, now) {
  const diff = Math.max(0, target.getTime() - now);
  return [
    { label: 'Days', value: Math.floor(diff / DAY_MS) },
    { label: 'Hrs', value: Math.floor((diff % DAY_MS) / 3600000) },
    { label: 'Min', value: Math.floor((diff % 3600000) / 60000) },
  ];
}

function toCountdown(saved) {
  return { label: saved?.label || '', targetAt: saved?.targetAt || null };
}

// A countdown to the learner's own licensure exam date, saved on their account
function CountdownCard({ saved, onSaved }) {
  const [countdown, setCountdown] = useState(() => toCountdown(saved));
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const target = countdown.targetAt ? new Date(countdown.targetAt) : null;
  const now = useNow(Boolean(target) && !draft);
  const savedLabel = saved?.label || '';
  const savedTargetAt = saved?.targetAt || null;

  // Picks up changes when the signed-in user is reloaded
  useEffect(() => {
    setCountdown({ label: savedLabel, targetAt: savedTargetAt });
  }, [savedLabel, savedTargetAt]);

  const hasPassed = Boolean(target) && target.getTime() <= now;
  const examLabel = countdown.label || 'Board exam';

  function startEditing() {
    setDraft({ ...countdown });
    setError('');
  }

  async function save(next) {
    setSaving(true);
    setError('');
    try {
      const data = await apiAuth('/api/auth/me/board-exam-countdown', { method: 'PATCH', body: next });
      setCountdown(toCountdown(data?.boardExamCountdown));
      setDraft(null);
      onSaved?.();
    } catch (err) {
      setError(err?.message || 'Could not save the countdown.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (draft?.targetAt) save({ label: draft.label, targetAt: draft.targetAt });
  }

  let body;
  if (draft) {
    body = (
      <form className="ld-countdown-form" onSubmit={handleSubmit}>
        <label className="ld-field">
          <span>Exam name</span>
          <input
            className="ld-input"
            value={draft.label}
            maxLength={120}
            placeholder="e.g. Criminology Licensure Exam"
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
          />
        </label>
        <div className="ld-field">
          <span>Date & time</span>
          <DateTimePicker
            value={draft.targetAt}
            onChange={(iso) => setDraft((prev) => ({ ...prev, targetAt: iso }))}
            title="Board Exam Date"
            description="Pick when your licensure exam starts. The dashboard counts down to it."
            placeholder="Pick a date & time"
          />
        </div>
        {error ? <p className="ld-form-error">{error}</p> : null}
        <div className="ld-form-actions">
          <button type="submit" className="ld-btn ld-btn--navy ld-btn--small" disabled={saving || !draft.targetAt}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="ld-btn ld-btn--plain ld-btn--small" onClick={() => setDraft(null)} disabled={saving}>
            Cancel
          </button>
          {target ? (
            <button
              type="button"
              className="ld-link ld-link--small ld-link--danger"
              onClick={() => save({ targetAt: null })}
              disabled={saving}
            >
              Remove countdown
            </button>
          ) : null}
        </div>
      </form>
    );
  } else if (target && !hasPassed) {
    body = (
      <div className="ld-countdown">
        <div className="ld-countdown-units">
          {getCountdownParts(target, now).map((part) => (
            <div key={part.label}>
              <strong>{String(part.value).padStart(2, '0')}</strong>
              <span>{part.label}</span>
            </div>
          ))}
        </div>
        <p className="ld-countdown-label" title={examLabel}>
          {examLabel} · {format(target, 'MMM d, yyyy · h:mm a')}
        </p>
      </div>
    );
  } else {
    body = (
      <EmptyText>
        {target
          ? `${examLabel} (${format(target, 'MMM d, yyyy')}) has passed. Set a new date to keep counting down.`
          : 'Set the date of your licensure exam to count down to it here.'}
      </EmptyText>
    );
  }

  return (
    <Card
      title="Board exam countdown"
      action={draft ? null : (
        <button type="button" className="ld-link" onClick={startEditing}>{target ? 'Edit' : 'Set date'}</button>
      )}
    >
      <div className="ld-card-body">{body}</div>
    </Card>
  );
}

function ExamCalendar({ exams, error }) {
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));

  const scheduled = useMemo(
    () => exams
      .filter((exam) => exam.startDateTime)
      .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime)),
    [exams]
  );

  const days = useMemo(() => {
    const { start, end } = getCalendarRange(viewMonth, 'month');
    return eachDayOfInterval({ start, end }).map((day) => ({ day, exams: getExamsOnDay(scheduled, day) }));
  }, [viewMonth, scheduled]);

  const selectedExams = getExamsOnDay(scheduled, selectedDay);
  // When the picked day is empty, the next exam after it is one click away
  const nextExam = selectedExams.length
    ? null
    : scheduled.find((exam) => new Date(exam.startDateTime) >= addDays(selectedDay, 1));
  const legend = Object.keys(WINDOW_LABELS).filter((key) => scheduled.some((exam) => exam.window === key));
  const showingToday = isToday(selectedDay) && isSameMonth(viewMonth, selectedDay);

  function selectDay(day) {
    setSelectedDay(startOfDay(day));
    setViewMonth(startOfMonth(day));
  }

  return (
    <Card
      className="ld-cal-card"
      title="Exam calendar"
      subtitle="Your open and upcoming exams"
      action={showingToday ? null : (
        <button type="button" className="ld-link" onClick={() => selectDay(new Date())}>Today</button>
      )}
    >
      <div className="ld-card-body ld-cal">
        <div className="ld-cal-month">
          <div className="ld-cal-head">
            <strong>{format(viewMonth, 'MMMM yyyy')}</strong>
            <div className="ld-cal-nav">
              <button type="button" onClick={() => setViewMonth(subMonths(viewMonth, 1))} aria-label="Previous month">
                <IconArrowLeft className="ld-cal-nav-icon" />
              </button>
              <button type="button" onClick={() => setViewMonth(addMonths(viewMonth, 1))} aria-label="Next month">
                <IconArrowRight className="ld-cal-nav-icon" />
              </button>
            </div>
          </div>

          <div className="ld-cal-weekdays" aria-hidden="true">
            {days.slice(0, 7).map(({ day }) => <span key={day.toISOString()}>{format(day, 'EEEEE')}</span>)}
          </div>

          <div className="ld-cal-days">
            {days.map(({ day, exams: examsOnDay }) => {
              const isSelected = isSameDay(day, selectedDay);
              const className = [
                'ld-cal-day',
                !isSameMonth(day, viewMonth) && 'is-outside',
                isToday(day) && 'is-today',
                isSelected && 'is-selected',
              ].filter(Boolean).join(' ');
              const examCount = examsOnDay.length ? `, ${plural(examsOnDay.length, 'exam')}` : '';

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className={className}
                  onClick={() => selectDay(day)}
                  aria-pressed={isSelected}
                  aria-label={`${format(day, 'EEEE, MMMM d')}${examCount}`}
                >
                  <span>{format(day, 'd')}</span>
                  <span className="ld-cal-dots" aria-hidden="true">
                    {examsOnDay.slice(0, MAX_DAY_DOTS).map((exam) => (
                      <span key={exam._id} className={`ld-cal-dot ld-cal-dot--${exam.window}`} />
                    ))}
                    {examsOnDay.length > MAX_DAY_DOTS ? <span className="ld-cal-more">+</span> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {legend.length ? (
            <div className="ld-cal-legend">
              {legend.map((key) => (
                <span key={key}><span className={`ld-cal-dot ld-cal-dot--${key}`} />{WINDOW_LABELS[key]}</span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="ld-cal-agenda">
          <h3>{format(selectedDay, 'EEEE, MMM d')}</h3>
          {error ? <EmptyText>{error}</EmptyText> : null}
          {!error && selectedExams.length ? (
            <ul>
              {selectedExams.map((exam) => (
                <li key={exam._id} className="ld-cal-item">
                  <span className={`ld-cal-bar ld-cal-dot--${exam.window}`} aria-hidden="true" />
                  <div className="ld-cal-item-main">
                    <strong title={exam.name}>{exam.name}</strong>
                    <span>{formatExamHours(exam)}</span>
                  </div>
                  <WindowChip window={exam.window} />
                </li>
              ))}
            </ul>
          ) : null}
          {!error && !selectedExams.length ? (
            <>
              <EmptyText>No exams on this day.</EmptyText>
              {nextExam ? (
                <button
                  type="button"
                  className="ld-link ld-link--small ld-cal-next"
                  title={nextExam.name}
                  onClick={() => selectDay(new Date(nextExam.startDateTime))}
                >
                  Next: {nextExam.name} · {format(new Date(nextExam.startDateTime), 'MMM d')} →
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// "<publisher> published <exam> · starts <time>", newest first
function AnnouncementsCard({ announcements, error }) {
  return (
    <Card title="Announcements" subtitle="Newly published exams">
      {announcements.length ? (
        <ul className="ld-news">
          {announcements.map((exam) => {
            const hasStarted = exam.startDateTime && new Date(exam.startDateTime).getTime() <= Date.now();
            return (
              <li key={exam._id} className="ld-news-row">
                <div className="ld-news-main">
                  <p>
                    <strong>{exam.publishedByName || 'Your school'}</strong> published <strong>{exam.name}</strong>
                  </p>
                  <span>
                    {exam.startDateTime
                      ? `${hasStarted ? 'Started' : 'Starts'} ${formatDateTime(exam.startDateTime)}`
                      : 'Start date TBA'}
                  </span>
                </div>
                <time className="ld-news-date" dateTime={exam.publishedAt} title={formatDateTime(exam.publishedAt)}>
                  {formatDate(exam.publishedAt)}
                </time>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ld-card-body"><EmptyText>{error || 'No announcements yet.'}</EmptyText></div>
      )}
    </Card>
  );
}
