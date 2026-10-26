import React, { useEffect, useState, useMemo, memo } from 'react';
import { getExamStudentResults } from '../../services/mockExamResultService';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import ResultQuestionList from '../../components/ResultQuestionList.jsx';
import SearchBar from '../../components/SearchBar.jsx';

// Same colors as the topics of the Overall tab
const getStatusClass = (avg, threshold) => {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
};

const formatSubmittedAt = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Whether the person got the question right, on its card
const renderAnswerResult = (question) => {
  if (!question.userAnswer) return <span className="er-q-tag tag-gray">No answer</span>;
  return question.isCorrect
    ? <span className="er-q-tag tag-green">Correct</span>
    : <span className="er-q-tag tag-red">Incorrect</span>;
};

const renderSetScore = (questions) => (
  <span className="rql-meta-text">
    {questions.filter((question) => question.isCorrect).length}/{questions.length} correct
  </span>
);

const getSelectionProps = (question) => ({ selectedAnswerId: question.userAnswer || null });

const ChevronIcon = ({ isExpanded }) => (
  <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </div>
);

// A subject of one person's attempt, as a topic row of the Overall tab
const SubjectBreakdownRow = memo(({ subject, threshold, questionContent, isExpanded, onToggle }) => {
  const statusClass = getStatusClass(subject.percentage, threshold);
  // The exam's question content, with this person's answer
  const questions = useMemo(
    () => (subject.questions || []).map((answer) => ({ ...questionContent[answer.questionId], ...answer })),
    [subject.questions, questionContent]
  );

  return (
    <div className="er-topic-wrapper">
      <button type="button" className="er-topic-row" onClick={onToggle} aria-expanded={isExpanded}>
        <div className="er-topic-main">
          <div className={`er-topic-name status-${statusClass}`}>{subject.subjectName}</div>
          <div className="er-topic-mini-meta">{subject.correct}/{subject.total} correct</div>
        </div>
        <div className="er-topic-bar-col">
          <div className="er-topic-bar-bg">
            <div className={`er-topic-bar-fill bg-${statusClass}`} style={{ width: `${subject.percentage}%` }} />
          </div>
        </div>
        <div className="er-topic-score-group">
          <div className={`er-topic-pct status-${statusClass}`}>{subject.percentage}%</div>
        </div>
        <ChevronIcon isExpanded={isExpanded} />
      </button>
      {isExpanded && (
        <div className="er-questions-list">
          <ResultQuestionList
            questions={questions}
            renderMeta={renderAnswerResult}
            renderSetMeta={renderSetScore}
            getPanelProps={getSelectionProps}
          />
        </div>
      )}
    </div>
  );
});

// A person's card: the header opens it, then its subjects are rows split by lines.
// Alumni pick one attempt at a time from capsules (their highest is shown first).
const StudentResultCard = memo(({ studentData, threshold, questionContent, isCardExpanded, onToggleCard, audience }) => {
  const { student, overallPercentage, passed, subjectBreakdowns, attempts } = studentData;
  const isAlumni = audience === 'alumni';
  const [openSubjectId, setOpenSubjectId] = useState(null);

  const sortedAttempts = useMemo(
    () => (attempts || []).slice().sort((a, b) => (a.attemptNumber || 0) - (b.attemptNumber || 0)),
    [attempts]
  );
  const bestAttempt = sortedAttempts.find((attempt) => attempt.attemptNumber === studentData.attemptNumber)
    || sortedAttempts[0];
  const [selectedAttemptId, setSelectedAttemptId] = useState(bestAttempt ? String(bestAttempt.attemptId) : null);
  const selectedAttempt = sortedAttempts.find((attempt) => String(attempt.attemptId) === selectedAttemptId) || bestAttempt;
  const subjects = isAlumni ? (selectedAttempt?.subjectBreakdowns || []) : subjectBreakdowns;

  return (
    <div className={`er-ind-student-card ${isCardExpanded ? 'is-open' : ''}`}>
      <button type="button" className="er-ind-student-header" onClick={onToggleCard} aria-expanded={isCardExpanded}>
        <div className="er-ind-student-info">
          <div className="er-ind-student-name">
            {student.name}
            {student.studentId && <span className="er-ind-student-badge">{student.studentId}</span>}
            {isAlumni && (
              <span className="er-ind-student-badge">
                {studentData.attemptCount || 0} attempt{Number(studentData.attemptCount || 0) === 1 ? '' : 's'}
              </span>
            )}
          </div>
          <div className="er-ind-student-email">{student.email}</div>
        </div>
        <div className="er-ind-student-score">
          <div className="er-ind-student-pct">{overallPercentage}% / 100%</div>
          <div className={`er-ind-student-status-badge ${passed ? 'passed' : 'failed'}`}>
            {passed ? 'passed' : 'failed'}
          </div>
        </div>
        <ChevronIcon isExpanded={isCardExpanded} />
      </button>
      {isCardExpanded && (
        <div className="er-ind-student-body">
          {isAlumni && selectedAttempt && (
            <div className="er-ind-attempt-bar">
              {sortedAttempts.length > 1 && (
                <CapsuleFilters
                  ariaLabel={`Attempts of ${student.name}`}
                  options={sortedAttempts.map((attempt) => ({
                    value: String(attempt.attemptId),
                    label: `Attempt ${attempt.attemptNumber}`,
                    count: `${attempt.overallPercentage}%`,
                  }))}
                  value={String(selectedAttempt.attemptId)}
                  onChange={setSelectedAttemptId}
                />
              )}
              <div className="er-ind-attempt-meta">
                <span className="er-ind-attempt-name">Attempt {selectedAttempt.attemptNumber}</span>
                <span className={`er-ind-student-status-badge ${selectedAttempt.passed ? 'passed' : 'failed'}`}>
                  {selectedAttempt.passed ? 'passed' : 'failed'}
                </span>
                {selectedAttempt === bestAttempt && sortedAttempts.length > 1 && (
                  <span className="er-ind-student-badge">Highest score</span>
                )}
                {selectedAttempt.submittedAt && (
                  <span className="er-ind-attempt-date">Submitted {formatSubmittedAt(selectedAttempt.submittedAt)}</span>
                )}
              </div>
            </div>
          )}
          {subjects.map(subject => (
            <SubjectBreakdownRow
              key={subject.subjectId}
              subject={subject}
              threshold={threshold}
              questionContent={questionContent}
              isExpanded={openSubjectId === subject.subjectId}
              onToggle={() => setOpenSubjectId((prev) => (prev === subject.subjectId ? null : subject.subjectId))}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function IndividualReportView({ examId, threshold, audience = 'student' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentsData, setStudentsData] = useState([]);
  // Each question of the exam (text, images, answer choices), keyed by question id
  const [questionContent, setQuestionContent] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('name_asc');
  // One person open at a time
  const [openCardId, setOpenCardId] = useState(null);

  const fetchResults = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getExamStudentResults(examId);
      setStudentsData(res.students || []);
      setQuestionContent(res.questions || {});
    } catch (err) {
      setError(err.message || 'Failed to fetch individual results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const filteredAndSorted = useMemo(() => {
    let filtered = studentsData;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(d =>
        d.student.name.toLowerCase().includes(lowerQ) ||
        (d.student.studentId && d.student.studentId.toLowerCase().includes(lowerQ)) ||
        d.student.email.toLowerCase().includes(lowerQ)
      );
    }

    return filtered.slice().sort((a, b) => {
      if (sortOrder === 'name_asc') return a.student.name.localeCompare(b.student.name);
      if (sortOrder === 'name_desc') return b.student.name.localeCompare(a.student.name);
      if (sortOrder === 'score_asc') return a.overallPercentage - b.overallPercentage;
      if (sortOrder === 'score_desc') return b.overallPercentage - a.overallPercentage;
      return 0;
    });
  }, [studentsData, searchQuery, sortOrder]);

  const audienceNoun = audience === 'alumni' ? 'alumni' : 'students';

  if (loading) return <div className="er-ind-loading">Loading individual results...</div>;
  if (error) return <div className="er-ind-error">{error}</div>;

  return (
    <div className="er-ind-container">
      <div className="er-ind-controls">
        <SearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={`Search ${audienceNoun} by name, ID, or email...`}
          className="er-ind-search"
        />
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value)}
          className="er-ind-sort"
          aria-label={`Sort ${audienceNoun}`}
        >
          <option value="name_asc">Sort A-Z</option>
          <option value="name_desc">Sort Z-A</option>
          <option value="score_desc">Highest Score</option>
          <option value="score_asc">Lowest Score</option>
        </select>
        <button onClick={fetchResults} className="er-ind-refresh-btn">Refresh</button>
      </div>

      <div className="er-ind-list">
        {filteredAndSorted.length === 0 ? (
          <div className="er-ind-empty">No {audienceNoun} found matching your criteria.</div>
        ) : (
          filteredAndSorted.map(data => {
            const cardId = String(data.attemptId || data.student._id);

            return (
              <StudentResultCard
                key={cardId}
                studentData={data}
                threshold={threshold}
                questionContent={questionContent}
                audience={audience}
                isCardExpanded={openCardId === cardId}
                onToggleCard={() => setOpenCardId((prev) => (prev === cardId ? null : cardId))}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
