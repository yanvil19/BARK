import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import AuthImage from '../../components/AuthImage.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import QuestionStepper from '../../components/QuestionStepper.jsx';
import { Marker, MarkerIcon, MarkerLegend } from '../../components/QuestionMarkers.jsx';
import ThresholdGap from '../../components/ThresholdGap.jsx';
import TopicScoreRows from '../../components/TopicScoreRows.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
import { orderByExamNumber } from '../../lib/groupQuestionsForDisplay.js';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
// The list, panel and motion are the same as the dean's and program chair's Exam Results, so
// they share its styles
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/ExamResults.css';
import '../../styles/shared/LearnerExamResults.css';

// A student's or an alumni's own exam results, on the layout of the dean's and program chair's
// Exam Results: the exams they answered as cards, and the open exam's result in the panel. A
// student sees their score and topics once the results are released; an alumni sees every
// attempt, and its questions with their answers.

const BASE = import.meta.env.VITE_API_URL;
const ITEMS_PER_PAGE = 10;
// setTimeout's longest wait
const MAX_TIMER_MS = 2147483647;

const RESULT_STATES = {
  passed: { label: 'Passed', icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  failed: { label: 'Failed', icon: <path d="M6 6l12 12M18 6L6 18" /> },
  // A student's result before its release date
  pending: { label: 'Awaiting release', icon: <path d="M12 6v6l4 2" /> },
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Sort: Newest' },
  { value: 'oldest', label: 'Sort: Oldest' },
  { value: 'score_desc', label: 'Sort: Highest Score' },
  { value: 'score_asc', label: 'Sort: Lowest Score' },
];

const PANEL_VIEWS = [
  { value: 'overall', label: 'Overall' },
  { value: 'questions', label: 'Questions' },
];

const NO_DETAILS = { key: null, loading: false, error: '', questions: [] };

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined) return '-';
  if (minutes < 1) return 'Under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, '0')}m`;
}

function getPercentage(attempt) {
  if (!attempt?.totalScore) return 0;
  return Math.round((Number(attempt.rawScore || 0) / Number(attempt.totalScore)) * 100);
}

// A student's results stay hidden until their release date; an alumni's show at once
function isReleased(attempt, isAlumni) {
  if (isAlumni) return true;
  if (attempt.resultsReleased === true) return true;
  if (attempt.resultsReleased === false) return false;
  return Boolean(attempt.resultReleasedAt) && new Date() >= new Date(attempt.resultReleasedAt);
}

// The attempts as one entry per exam, each with its attempts oldest first
function buildExams(attempts, isAlumni) {
  const byExam = new Map();
  attempts.forEach((attempt) => {
    if (!attempt.examId || !attempt.examName || attempt.examName === 'Unknown Exam') return;
    const examId = String(attempt.examId);
    if (!byExam.has(examId)) byExam.set(examId, { examId, examName: attempt.examName, attempts: [] });
    byExam.get(examId).attempts.push(attempt);
  });

  return [...byExam.values()].map((exam) => {
    const answeredAt = (attempt) => new Date(attempt.submittedAt || attempt.date).getTime();
    const numbered = [...exam.attempts]
      .sort((a, b) => answeredAt(a) - answeredAt(b))
      .map((attempt, index) => {
        const released = isReleased(attempt, isAlumni);
        return {
          ...attempt,
          key: String(attempt.id || attempt._id),
          number: attempt.attemptNumber || index + 1,
          released,
          percentage: released ? getPercentage(attempt) : null,
          passed: released && (isAlumni ? Boolean(attempt.passed) : attempt.status === 'passed'),
          threshold: attempt.passingThreshold ?? 70,
        };
      });

    const scored = numbered.filter((attempt) => attempt.released);
    // The highest score; the earlier attempt on a tie
    const best = scored.reduce((top, attempt) => (!top || attempt.percentage > top.percentage ? attempt : top), null);
    const latest = numbered[numbered.length - 1];
    let state = 'pending';
    if (best) state = scored.some((attempt) => attempt.passed) ? 'passed' : 'failed';

    return {
      ...exam,
      attempts: numbered,
      best,
      latest,
      state,
      score: best ? best.percentage : null,
      date: latest.submittedAt || latest.date,
    };
  });
}

// An alumni attempt's questions in the shape of the shared question views, with their answer
function toReviewQuestions(questions) {
  return orderByExamNumber((questions || []).map((question) => {
    const userAnswer = question.userAnswer ? String(question.userAnswer) : null;
    return {
      ...question,
      _id: String(question._id),
      userAnswer,
      isCorrect: Boolean(userAnswer) && userAnswer === String(question.correctAnswer || ''),
    };
  }));
}

function AnswerPill({ question }) {
  if (!question.userAnswer) return <span className="ca-tone-pill ca-tone-pill--muted">No answer</span>;
  return question.isCorrect
    ? <span className="ca-tone-pill ca-tone-pill--good">Correct</span>
    : <span className="ca-tone-pill ca-tone-pill--bad">Incorrect</span>;
}

export default function LearnerExamResults({ audience = 'student', initialExamId = '' }) {
  const isAlumni = audience === 'alumni';

  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [currentPage, setCurrentPage] = useState(1);
  // The panel: the open exam, which of its attempts, its view, and the question shown
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [attemptKey, setAttemptKey] = useState(null);
  const [panelView, setPanelView] = useState('overall');
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  // A topic whose first question the Questions view should open on, once they are loaded
  const [topicJump, setTopicJump] = useState(null);
  const [details, setDetails] = useState(NO_DETAILS);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const panelLayout = usePanelLayout(selectedExamId);
  // Each attempt's questions are fetched once
  const detailsCache = useRef(new Map());

  const fetchAttempts = useCallback(async () => {
    try {
      const data = await apiAuth(`${BASE}/api/${isAlumni ? 'alumni' : 'student'}-exams/my-attempts`);
      setAttempts(data.attempts || []);
      setLoadError('');
    } catch (err) {
      console.error('Failed to load exam results:', err);
      setLoadError(err.message || 'Your exam results could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isAlumni]);

  useEffect(() => {
    fetchAttempts();
  }, [fetchAttempts]);

  const exams = useMemo(() => buildExams(attempts, isAlumni), [attempts, isAlumni]);

  // A result waiting for its release date shows by itself when the date comes
  useEffect(() => {
    const now = Date.now();
    const releaseTimes = exams
      .filter((exam) => exam.state === 'pending' && exam.latest.resultReleasedAt)
      .map((exam) => new Date(exam.latest.resultReleasedAt).getTime())
      .filter((time) => time > now);
    if (releaseTimes.length === 0) return undefined;

    const timer = setTimeout(fetchAttempts, Math.min(Math.min(...releaseTimes) - now + 1000, MAX_TIMER_MS));
    return () => clearTimeout(timer);
  }, [exams, fetchAttempts]);

  // Arriving from an exam's "view results" opens that exam
  const openedInitial = useRef('');
  useEffect(() => {
    if (!initialExamId || openedInitial.current === initialExamId) return;
    const exam = exams.find((item) => item.examId === String(initialExamId));
    if (!exam) return;
    openedInitial.current = initialExamId;
    setSelectedExamId(exam.examId);
    setAttemptKey(exam.latest.key);
  }, [initialExamId, exams]);

  const selectedExam = useMemo(
    () => (selectedExamId ? exams.find((exam) => exam.examId === selectedExamId) || null : null),
    [exams, selectedExamId]
  );
  const attempt = selectedExam
    ? selectedExam.attempts.find((item) => item.key === attemptKey) || selectedExam.latest
    : null;
  const hasViews = isAlumni && Boolean(attempt?.released);
  const view = hasViews ? panelView : 'overall';

  // An alumni attempt's questions load the first time its Questions view opens
  const detailsKey = view === 'questions' && attempt ? attempt.key : null;
  useEffect(() => {
    if (!detailsKey) return undefined;
    const cached = detailsCache.current.get(detailsKey);
    if (cached) {
      setDetails({ key: detailsKey, loading: false, error: '', questions: cached });
      return undefined;
    }

    let ignore = false;
    setDetails({ ...NO_DETAILS, key: detailsKey, loading: true });
    apiAuth(`${BASE}/api/alumni-exams/attempt/${encodeURIComponent(detailsKey)}`)
      .then((data) => {
        const questions = toReviewQuestions(data.questions);
        detailsCache.current.set(detailsKey, questions);
        if (!ignore) setDetails({ key: detailsKey, loading: false, error: '', questions });
      })
      .catch((err) => {
        if (!ignore) {
          setDetails({
            key: detailsKey,
            loading: false,
            error: err.message || 'The questions of this attempt could not be loaded.',
            questions: [],
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [detailsKey]);

  const reviewQuestions = details.key === detailsKey ? details.questions : [];
  const isLoadingDetails = Boolean(detailsKey) && (details.key !== detailsKey || details.loading);

  useEffect(() => {
    if (!topicJump || reviewQuestions.length === 0) return;
    const index = reviewQuestions.findIndex((question) => question.subjectName === topicJump);
    setActiveQuestionIdx(Math.max(index, 0));
    setTopicJump(null);
  }, [topicJump, reviewQuestions]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedState, sortBy]);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, searchQuery, selectedState, sortBy]);

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

  // Escape closes the image opened full size (before full screen ends: see usePanelLayout)
  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullscreenImage]);

  function handleSelectExam(exam) {
    if (exam.examId === selectedExamId) return;
    setSelectedExamId(exam.examId);
    // The newest attempt first: the one just answered
    setAttemptKey(exam.latest.key);
    setActiveQuestionIdx(0);
    setTopicJump(null);
  }

  function selectAttempt(key) {
    setAttemptKey(key);
    setActiveQuestionIdx(0);
    setTopicJump(null);
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedState('');
  }

  // A topic row opens the Questions view on that topic's first question
  function showTopicQuestions(topic) {
    setTopicJump(topic.name);
    setPanelView('questions');
  }

  const filteredExceptState = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? exams.filter((exam) => exam.examName.toLowerCase().includes(query)) : exams;
  }, [exams, searchQuery]);

  const stateCounts = useMemo(() => {
    const counts = { all: filteredExceptState.length };
    filteredExceptState.forEach((exam) => {
      counts[exam.state] = (counts[exam.state] || 0) + 1;
    });
    return counts;
  }, [filteredExceptState]);

  // By score, the results still waiting for release go last either way
  const visibleExams = useMemo(() => {
    const listed = selectedState
      ? filteredExceptState.filter((exam) => exam.state === selectedState)
      : filteredExceptState;
    const time = (exam) => new Date(exam.date).getTime();
    return [...listed].sort((a, b) => {
      if (sortBy === 'oldest') return time(a) - time(b);
      if (sortBy === 'newest') return time(b) - time(a);
      if (a.score === null || b.score === null) return (a.score === null) - (b.score === null);
      return sortBy === 'score_asc' ? a.score - b.score : b.score - a.score;
    });
  }, [filteredExceptState, selectedState, sortBy]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedState);
  const totalPages = Math.ceil(visibleExams.length / ITEMS_PER_PAGE) || 1;
  const paginatedExams = visibleExams.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Only a student's results wait for release, so only they have that state
  const stateKeys = isAlumni ? ['passed', 'failed'] : ['passed', 'failed', 'pending'];
  const stateTabs = [
    { value: '', label: 'All', count: stateCounts.all },
    ...stateKeys.map((state) => ({
      value: state,
      label: RESULT_STATES[state].label,
      count: stateCounts[state] || 0,
    })),
  ];
  const legendItems = [
    ...(isAlumni ? [{ text: 'Attempts', className: 'ca-marker--count', content: '#' }] : []),
    ...stateKeys.map((state) => ({
      text: RESULT_STATES[state].label,
      className: `lr-result--${state}`,
      content: <MarkerIcon>{RESULT_STATES[state].icon}</MarkerIcon>,
    })),
  ];

  function renderExamCard(exam, cardIndex) {
    const attemptCount = exam.attempts.length;
    let scorePill = <span className="ca-tone-pill ca-tone-pill--muted">Score not released</span>;
    if (exam.score !== null) {
      scorePill = (
        <span className={`ca-tone-pill ca-tone-pill--${exam.state === 'passed' ? 'good' : 'bad'}`}>
          {isAlumni && attemptCount > 1 ? 'Best ' : ''}{exam.score}%
        </span>
      );
    }

    return (
      <div
        key={exam.examId}
        className={`ca-question-card ${exam.examId === selectedExamId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => handleSelectExam(exam)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{exam.examName}</span>
          </button>
          <div className="ca-card-markers">
            {isAlumni && (
              <Marker className="ca-marker--count" label={plural(attemptCount, 'attempt')}>{attemptCount}</Marker>
            )}
            <Marker className={`lr-result--${exam.state}`} label={`Result: ${RESULT_STATES[exam.state].label}`}>
              <MarkerIcon>{RESULT_STATES[exam.state].icon}</MarkerIcon>
            </Marker>
          </div>
        </div>
        <div className="ca-card-meta">
          {scorePill}
          <span className="ca-card-meta-datetime">
            <span className="ca-date">{formatDate(exam.date)}</span>
            <span className="ca-time">{formatTime(exam.date)}</span>
          </span>
        </div>
      </div>
    );
  }

  function renderFacts(exam, shown) {
    const facts = [
      { label: 'Date Taken', value: formatDateTime(shown.date) },
      isAlumni
        ? { label: 'Submitted', value: formatDateTime(shown.submittedAt) }
        : {
          label: shown.released ? 'Results Released' : 'Results Release',
          value: shown.resultReleasedAt ? formatDateTime(shown.resultReleasedAt) : 'Not scheduled yet',
        },
      { label: 'Time Spent', value: formatDuration(shown.durationMinutes) },
      { label: 'Passing Threshold', value: `${shown.threshold}%` },
      ...(shown.totalItems ? [{ label: 'Questions', value: plural(shown.totalItems, 'question') }] : []),
      ...(isAlumni ? [{ label: 'Attempts', value: plural(exam.attempts.length, 'attempt') }] : []),
    ];

    return (
      <section className="ca-section ca-review-metadata">
        <div className="ca-meta-grid">
          {facts.map(({ label, value }) => (
            <div key={label}>
              <span className="ca-meta-label">{label}</span>
              <div className="ca-meta-value">{value}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // An alumni's attempts as a dropdown, the newest first, each with its score
  function renderAttemptSelect(exam, shown) {
    return (
      <DropdownSelect
        className="lr-attempt-select"
        value={shown.key}
        onChange={(event) => selectAttempt(event.target.value)}
        ariaLabel="Choose an attempt on this exam"
        options={[...exam.attempts].reverse().map((item) => ({
          value: item.key,
          label: `Attempt ${item.number} · ${item.percentage}%${item === exam.best ? ' · Highest' : ''}`,
        }))}
      />
    );
  }

  // The dropdown, and a line on the attempt shown
  function renderAttempts(exam, shown) {
    return (
      <div className="er-attempts">
        {exam.attempts.length > 1 && (
          renderAttemptSelect(exam, shown)
        )}
        <span className="ca-hint">
          Attempt {shown.number}
          {exam.attempts.length > 1 && shown === exam.best && ' · Your highest score'}
          {shown.submittedAt && ` · Submitted ${formatDateTime(shown.submittedAt)}`}
        </span>
      </div>
    );
  }

  function renderOverallView(exam, shown) {
    const unit = shown.totalScore === shown.totalItems ? 'correct' : 'points';
    const topics = (shown.subjectScores || []).map((subject, index) => ({
      key: `${subject.name}-${index}`,
      name: subject.name,
      correct: subject.correct,
      total: subject.total,
      percentage: subject.total > 0 ? Math.round((subject.correct / subject.total) * 100) : 0,
    }));

    return (
      <>
        <section className="question-panel">
          <p className="question-panel-label">Your Result</p>
          <div className="ca-stats">
            <div className="ca-stat">
              <span className="ca-stat-label">Score</span>
              <strong className="ca-stat-value">{shown.percentage}%</strong>
              <span className="ca-stat-sub">{shown.rawScore} of {shown.totalScore} {unit}</span>
            </div>
            <div className="ca-stat">
              <span className="ca-stat-label">Result</span>
              <strong className={`ca-stat-value lr-verdict ${shown.passed ? 'is-passed' : 'is-failed'}`}>
                {shown.passed ? 'Passed' : 'Failed'}
              </strong>
              <ThresholdGap score={shown.percentage} threshold={shown.threshold} />
            </div>
            <div className="ca-stat">
              <span className="ca-stat-label">Time spent</span>
              <strong className="ca-stat-value">{formatDuration(shown.durationMinutes)}</strong>
              <span className="ca-stat-sub">Taken {formatDate(shown.date)}</span>
            </div>
          </div>
          {isAlumni && renderAttempts(exam, shown)}
        </section>

        <section className="question-panel">
          <p className="question-panel-label">Scores by Topic</p>
          {topics.length > 0 ? (
            <TopicScoreRows
              topics={topics}
              threshold={shown.threshold}
              onSelect={isAlumni ? showTopicQuestions : undefined}
              selectLabel={(topic) => `Show the questions of ${topic.name}`}
            />
          ) : (
            <p className="ca-hint ca-hint--section">This exam has no topics to break down.</p>
          )}
        </section>

        {renderFacts(exam, shown)}
      </>
    );
  }

  function renderQuestionsView(exam, shown) {
    if (isLoadingDetails) return <p className="ca-panel-note">Loading your answers...</p>;
    if (details.error) return <p className="ca-panel-note ca-panel-note--error" role="alert">{details.error}</p>;
    if (reviewQuestions.length === 0) return <p className="ca-panel-note">This attempt has no questions to show.</p>;

    const correctCount = reviewQuestions.filter((question) => question.isCorrect).length;
    return (
      <>
        <div className="lr-review-head">
          {exam.attempts.length > 1 && renderAttemptSelect(exam, shown)}
          <ul className="lr-legend">
            <li><span className="lr-legend-dot is-correct" aria-hidden="true" />{correctCount} correct</li>
            <li>
              <span className="lr-legend-dot is-wrong" aria-hidden="true" />
              {reviewQuestions.length - correctCount} wrong or blank
            </li>
          </ul>
        </div>

        <QuestionStepper
          key={shown.key}
          questions={reviewQuestions}
          activeIdx={activeQuestionIdx}
          onSelectQuestion={setActiveQuestionIdx}
          onZoom={setFullscreenImage}
          getPanelProps={(question) => ({ selectedAnswerId: question.userAnswer })}
          getResult={(question) => (question.isCorrect ? 'correct' : 'wrong')}
          renderAside={(question) => (
            <span className="er-aside">
              <span className="ca-tag-pill">{question.subjectName || 'No subject'}</span>
              <AnswerPill question={question} />
            </span>
          )}
        />
      </>
    );
  }

  function renderPanelContent(exam, shown) {
    if (!shown.released) {
      return (
        <>
          <p className="ca-panel-note lr-pending">
            {shown.resultReleasedAt
              ? `Your answers are in. Your score shows here on ${formatDateTime(shown.resultReleasedAt)}.`
              : 'Your answers are in. Your score shows here once your dean sets a release date.'}
          </p>
          {renderFacts(exam, shown)}
        </>
      );
    }
    if (view === 'questions') return renderQuestionsView(exam, shown);
    return renderOverallView(exam, shown);
  }

  let emptyText = 'No exams match your filters.';
  if (loadError) emptyText = loadError;
  else if (exams.length === 0) {
    emptyText = isAlumni
      ? 'No attempts yet. The exams you answer will appear here.'
      : 'No exam results yet. The exams you answer will appear here.';
  }

  return (
    <main className="lr-page ca-page ca-page--stepper page-shell">
      <PageHeader
        title="Exam Results"
        subtitle={isAlumni
          ? 'Your attempts on each exam: scores, topics and your answers.'
          : 'Your score and topics for each exam you have taken.'}
      />

      <CapsuleFilters
        className="ca-state-pills"
        ariaLabel="Filter exams by your result"
        options={stateTabs}
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
        sortOptions={SORT_OPTIONS}
      />

      <div className={panelLayout.layoutClass(Boolean(selectedExam))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Your exams">
          <MarkerLegend items={legendItems} ariaLabel="What the exam markers mean" />

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading your results...</div>
            ) : visibleExams.length === 0 ? (
              <div className="ca-empty" role={loadError ? 'alert' : undefined}>
                <p className="er-empty-text">{emptyText}</p>
                {loadError && (
                  <button type="button" className="ca-btn lr-quiet-btn" onClick={fetchAttempts}>Try again</button>
                )}
                {!loadError && exams.length > 0 && hasActiveFilters && (
                  <button type="button" className="ca-btn lr-quiet-btn" onClick={clearFilters}>Clear filters</button>
                )}
              </div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div className="ca-questions-list" key={[selectedState, sortBy, currentPage].join('|')}>
                {paginatedExams.map(renderExamCard)}
              </div>
            )}
          </div>

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalItems={visibleExams.length}
              pageSize={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
              itemLabel={visibleExams.length === 1 ? 'exam' : 'exams'}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedExam && attempt ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={selectedExam.examName}
              views={hasViews ? PANEL_VIEWS : []}
              view={view}
              onViewChange={setPanelView}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedExamId(null)}
              closeLabel="Close result panel"
            />

            {/* Keyed so each exam, attempt and view starts scrolled to the top */}
            <div className="ca-sidebar-content" key={`${selectedExam.examId}-${attempt.key}-${view}`}>
              {renderPanelContent(selectedExam, attempt)}
            </div>
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select an exam to view your result</p>
          </div>
        )}
      </div>

      {fullscreenImage && (
        <div
          className="ca-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ca-image-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}
    </main>
  );
}
