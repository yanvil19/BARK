import { useEffect, useMemo, useRef, useState } from 'react';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import QuestionStepper from '../../components/QuestionStepper.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import TopicScoreRows from '../../components/TopicScoreRows.jsx';
import { orderByExamNumber } from '../../lib/groupQuestionsForDisplay.js';
import { formatDateTime } from '../../utils/dateFormat.js';

// The Individual view of the Exam Results panel: everyone eligible for the exam, as rows split by
// lines, and one person's result in the same panel when their row is opened.

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Sort A-Z' },
  { value: 'name_desc', label: 'Sort Z-A' },
  { value: 'score_desc', label: 'Highest Score' },
  { value: 'score_asc', label: 'Lowest Score' },
];

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

// Whether the person has a result (the others are eligible but have not submitted it)
const hasResult = (entry) => !entry.status || entry.status === 'taken';

const getPersonKey = (entry) => String(entry.attemptId || entry.student?._id);

function getPendingStatus(entry, examEnded) {
  if (entry.status === 'in_progress') return { label: 'In progress', tone: 'warn' };
  return { label: examEnded ? 'Did not take' : 'Not taken yet', tone: 'muted' };
}

function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function ResultPill({ passed }) {
  return <span className={`ca-tone-pill ca-tone-pill--${passed ? 'good' : 'bad'}`}>{passed ? 'Passed' : 'Failed'}</span>;
}

// Whether the person got the question shown right, beside the bubbles
function AnswerPill({ question }) {
  if (!question.userAnswer) return <span className="ca-tone-pill ca-tone-pill--muted">No answer</span>;
  return question.isCorrect
    ? <span className="ca-tone-pill ca-tone-pill--good">Correct</span>
    : <span className="ca-tone-pill ca-tone-pill--bad">Incorrect</span>;
}

function PersonName({ student }) {
  return (
    <span className="ca-person-name">
      {student.name}
      {student.studentId && <span className="ca-person-id">{student.studentId}</span>}
    </span>
  );
}

// One person's result: who they are and their score, their attempts (alumni), their score per topic,
// then their answers through the bubbles
function PersonResult({ entry, audience, threshold, questionContent, onBack, backRef, onZoom }) {
  const isAlumni = audience === 'alumni';
  const sortedAttempts = useMemo(
    () => (entry.attempts || []).slice().sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0)),
    [entry.attempts]
  );
  // An alumni's highest score is shown first
  const bestAttempt = sortedAttempts.find((attempt) => attempt.attemptNumber === entry.attemptNumber) || sortedAttempts[0];
  const [attemptId, setAttemptId] = useState(bestAttempt ? String(bestAttempt.attemptId) : null);
  const [questionIdx, setQuestionIdx] = useState(0);

  const attempt = isAlumni
    ? sortedAttempts.find((item) => String(item.attemptId) === attemptId) || bestAttempt
    : null;
  const subjects = isAlumni ? attempt?.subjectBreakdowns : entry.subjectBreakdowns;
  const score = attempt ? attempt.overallPercentage : entry.overallPercentage;
  const passed = attempt ? attempt.passed : entry.passed;

  // The exam's question content, with this person's answer
  const questions = useMemo(() => orderByExamNumber((subjects || []).flatMap((subject) => (
    (subject.questions || []).map((answer) => ({
      ...questionContent[answer.questionId],
      ...answer,
      _id: String(answer.questionId),
      subjectName: subject.subjectName,
    }))
  ))), [subjects, questionContent]);

  const topics = (subjects || []).map((subject) => ({
    key: subject.subjectId,
    name: subject.subjectName,
    correct: subject.correct,
    total: subject.total,
    percentage: subject.percentage,
  }));

  function selectAttempt(nextAttemptId) {
    setAttemptId(nextAttemptId);
    setQuestionIdx(0);
  }

  // A topic row moves the bubbles to that topic's first question and brings them into view
  function showTopic(topic, event) {
    const index = questions.findIndex((question) => question.subjectName === topic.name);
    setQuestionIdx(Math.max(index, 0));
    event?.currentTarget.closest('.ca-sidebar-content')
      ?.querySelector('.import-review-bubble-wrapper')
      ?.scrollIntoView({ block: 'start', behavior: scrollBehavior() });
  }

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
            <PersonName student={entry.student} />
            <span className="ca-person-meta">{entry.student.email}</span>
          </span>
          <span className="ca-person-result">
            <strong className="ca-person-score">{score}%</strong>
            <ResultPill passed={passed} />
          </span>
        </div>
        {isAlumni && attempt && (
          <div className="er-attempts">
            {sortedAttempts.length > 1 && (
              <CapsuleFilters
                ariaLabel={`Attempts of ${entry.student.name}`}
                options={sortedAttempts.map((item) => ({
                  value: String(item.attemptId),
                  label: `Attempt ${item.attemptNumber}`,
                  count: `${item.overallPercentage}%`,
                }))}
                value={String(attempt.attemptId)}
                onChange={selectAttempt}
              />
            )}
            <span className="ca-hint">
              Attempt {attempt.attemptNumber}
              {attempt === bestAttempt && sortedAttempts.length > 1 && ' · Highest score'}
              {attempt.submittedAt && ` · Submitted ${formatDateTime(attempt.submittedAt)}`}
            </span>
          </div>
        )}
      </section>

      {topics.length > 0 && (
        <section className="question-panel">
          <p className="question-panel-label">Scores by Topic</p>
          <TopicScoreRows
            topics={topics}
            threshold={threshold}
            onSelect={showTopic}
            selectLabel={(topic) => `Show the questions of ${topic.name}`}
          />
        </section>
      )}

      {questions.length > 0 ? (
        <QuestionStepper
          key={attempt ? String(attempt.attemptId) : 'result'}
          questions={questions}
          activeIdx={questionIdx}
          onSelectQuestion={setQuestionIdx}
          onZoom={onZoom}
          getPanelProps={(question) => ({ selectedAnswerId: question.userAnswer || null })}
          renderAside={(question) => (
            <span className="er-aside">
              <span className="ca-tag-pill">{question.subjectName || 'No subject'}</span>
              <AnswerPill question={question} />
            </span>
          )}
        />
      ) : (
        <p className="ca-panel-note">No answers to show for this result.</p>
      )}
    </>
  );
}

// initialList sets how the list starts, as { takenFilter, sortOrder } (the AI Overview's "Open in
// Individual" buttons); the view remounts each time it opens
export default function IndividualReportView({
  data,
  threshold,
  audience = 'student',
  onRefresh,
  onZoom,
  scrollRef,
  initialList = null,
}) {
  const { loading, error, students, questions: questionContent, examEnded } = data;
  const [takenFilter, setTakenFilter] = useState(initialList?.takenFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState(initialList?.sortOrder || 'name_asc');
  // One person open at a time, in place of the list
  const [openKey, setOpenKey] = useState(null);
  const listScrollTop = useRef(0);
  const backRef = useRef(null);
  const isAlumni = audience === 'alumni';
  const audienceNoun = isAlumni ? 'alumni' : 'students';

  const takenCount = useMemo(() => students.filter(hasResult).length, [students]);

  const filteredAndSorted = useMemo(() => {
    let filtered = students;
    if (takenFilter !== 'all') {
      filtered = filtered.filter((entry) => hasResult(entry) === (takenFilter === 'taken'));
    }
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(({ student }) => (
        (student.name || '').toLowerCase().includes(query)
        || (student.studentId || '').toLowerCase().includes(query)
        || (student.email || '').toLowerCase().includes(query)
      ));
    }

    return filtered.slice().sort((a, b) => {
      if (sortOrder === 'name_asc') return (a.student.name || '').localeCompare(b.student.name || '');
      if (sortOrder === 'name_desc') return (b.student.name || '').localeCompare(a.student.name || '');
      // No score to rank: after the ones with a result
      if (hasResult(a) !== hasResult(b)) return hasResult(a) ? -1 : 1;
      if (sortOrder === 'score_asc') return a.overallPercentage - b.overallPercentage;
      return b.overallPercentage - a.overallPercentage;
    });
  }, [students, searchQuery, takenFilter, sortOrder]);

  const openEntry = openKey
    ? students.find((entry) => hasResult(entry) && getPersonKey(entry) === openKey) || null
    : null;

  // Opening a person starts the panel at the top, with focus on the way back; going back returns to
  // the same place in the list, with focus on that person's row
  const lastOpenKey = useRef(null);
  useEffect(() => {
    const container = scrollRef?.current;
    if (openEntry) {
      if (container) container.scrollTop = 0;
      backRef.current?.focus({ preventScroll: true });
      lastOpenKey.current = openKey;
    } else if (lastOpenKey.current) {
      if (container) container.scrollTop = listScrollTop.current;
      container?.querySelector(`[data-person-key="${CSS.escape(lastOpenKey.current)}"]`)?.focus({ preventScroll: true });
      lastOpenKey.current = null;
    }
  }, [openEntry, openKey, scrollRef]);

  function openPerson(key) {
    listScrollTop.current = scrollRef?.current?.scrollTop || 0;
    setOpenKey(key);
  }

  if (loading) return <p className="ca-panel-note">Loading individual results...</p>;
  if (error) {
    return (
      <div className="ca-retry">
        <p className="ca-panel-note ca-panel-note--error" role="alert">{error}</p>
        <button type="button" className="ca-btn ca-btn--plain" onClick={onRefresh}>Try again</button>
      </div>
    );
  }

  if (openEntry) {
    return (
      <PersonResult
        key={openKey}
        entry={openEntry}
        audience={audience}
        threshold={threshold}
        questionContent={questionContent}
        onBack={() => setOpenKey(null)}
        backRef={backRef}
        onZoom={onZoom}
      />
    );
  }

  return (
    <>
      <div className="ca-people-tools">
        <CapsuleFilters
          ariaLabel={`Filter ${audienceNoun} by whether they took the exam`}
          options={[
            { value: 'all', label: 'All', count: students.length },
            { value: 'taken', label: 'Took the exam', count: takenCount },
            { value: 'not_taken', label: 'Not taken', count: students.length - takenCount },
          ]}
          value={takenFilter}
          onChange={setTakenFilter}
        />
        <div className="ca-people-controls">
          <SearchBar
            className="ca-people-search"
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={`Search ${audienceNoun} by name, ID, or email...`}
          />
          <DropdownSelect
            className="ca-people-sort"
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            ariaLabel={`Sort ${audienceNoun}`}
            options={SORT_OPTIONS}
          />
          <button type="button" className="ca-btn ca-btn--plain" onClick={onRefresh}>Refresh</button>
        </div>
      </div>

      <section className="question-panel">
        <p className="question-panel-label">{isAlumni ? 'Alumni' : 'Students'} ({filteredAndSorted.length})</p>
        {filteredAndSorted.length === 0 ? (
          <p className="ca-hint ca-hint--section">
            {students.length === 0 ? `No ${audienceNoun} are eligible for this exam.` : `No ${audienceNoun} match your search.`}
          </p>
        ) : (
          <ul className="ca-people-list">
            {filteredAndSorted.map((entry) => {
              const key = getPersonKey(entry);
              const { student } = entry;

              if (!hasResult(entry)) {
                const { label, tone } = getPendingStatus(entry, examEnded);
                return (
                  <li key={key} className="ca-people-item">
                    <div className="ca-person-row is-pending">
                      <span className="ca-person-text">
                        <PersonName student={student} />
                        <span className="ca-person-meta">{student.email}</span>
                      </span>
                      <span className={`ca-tone-pill ca-tone-pill--${tone}`}>{label}</span>
                      <span className="ca-row-chevron" aria-hidden="true" />
                    </div>
                  </li>
                );
              }

              return (
                <li key={key} className="ca-people-item">
                  <button type="button" className="ca-person-row" data-person-key={key} onClick={() => openPerson(key)}>
                    <span className="ca-person-text">
                      <PersonName student={student} />
                      <span className="ca-person-meta">
                        {student.email}
                        {isAlumni && ` · ${plural(entry.attemptCount || 0, 'attempt')}`}
                      </span>
                    </span>
                    <span className="ca-person-result">
                      <span className="ca-person-score">{entry.overallPercentage}%</span>
                      <ResultPill passed={entry.passed} />
                    </span>
                    <span className="ca-row-chevron" aria-hidden="true">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
