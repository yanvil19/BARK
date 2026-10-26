import React, { useEffect, useState, useMemo, memo } from 'react';
import { getExamStudentResults } from '../../services/mockExamResultService';
import ResultQuestionList from '../../components/ResultQuestionList.jsx';

// Same colors as the topics of the Overall tab
const getStatusClass = (avg, threshold) => {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
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

const SubjectBreakdownRow = memo(({ subject, threshold, questionContent, isExpanded, onToggle }) => {
  const statusClass = getStatusClass(subject.percentage, threshold);
  // The exam's question content, with this person's answer
  const questions = useMemo(
    () => (subject.questions || []).map((answer) => ({ ...questionContent[answer.questionId], ...answer })),
    [subject.questions, questionContent]
  );

  return (
    <div className="er-ind-sub-wrapper">
      <button type="button" className="er-ind-sub-row" onClick={onToggle}>
        <div className="er-ind-sub-info">
          <div className={`er-ind-sub-name status-${statusClass}`}>{subject.subjectName}</div>
          <div className="er-ind-sub-meta-sm">{subject.correct}/{subject.total} correct</div>
        </div>
        <div className="er-ind-sub-bar-container">
          <div className="er-ind-sub-bar-bg">
            <div className={`er-ind-sub-bar-fill bg-${statusClass}`} style={{ width: `${subject.percentage}%` }} />
          </div>
        </div>
        <div className="er-ind-sub-score">
          <div className={`er-ind-sub-pct status-${statusClass}`}>{subject.percentage}%</div>
        </div>
        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {isExpanded && (
        <div className="er-ind-q-list">
          <div className="er-ind-q-list-title">Questions</div>
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

const AlumniAttemptRow = memo(({ attempt, threshold, questionContent, isExpanded, onToggle, expandedSubjects, onToggleSubject }) => {
  return (
    <div className="er-ind-sub-wrapper" style={{ marginTop: '0.5rem' }}>
      <button
        type="button"
        className="er-ind-sub-row"
        onClick={onToggle}
        style={{ gridTemplateColumns: 'minmax(180px, 230px) minmax(0, 1fr) auto 32px' }}
      >
        <div className="er-ind-sub-info">
          <div className="er-ind-sub-name" style={{ color: 'var(--er-navy)', fontSize: '15px' }}>Attempt #{attempt.attemptNumber}</div>
        </div>
        <div></div>
        <div className="er-ind-sub-score" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
          <div className="er-ind-sub-pct" style={{ color: 'var(--er-navy)' }}>{attempt.overallPercentage}%</div>
          <div className={`er-ind-student-status-badge ${attempt.passed ? 'passed' : 'failed'}`}>
            {attempt.passed ? 'passed' : 'failed'}
          </div>
        </div>
        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="er-ind-q-list">
          {attempt.subjectBreakdowns.map(subject => (
            <SubjectBreakdownRow
              key={subject.subjectId}
              subject={subject}
              threshold={threshold}
              questionContent={questionContent}
              isExpanded={expandedSubjects.has(subject.subjectId)}
              onToggle={() => onToggleSubject(subject.subjectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const StudentResultCard = memo(({ studentData, threshold, questionContent, expandedSubjects, onToggleSubject, isCardExpanded, onToggleCard, audience, expandedAttempts, onToggleAttempt }) => {
  const { student, overallPercentage, passed, subjectBreakdowns, attempts } = studentData;
  const isAlumni = audience === 'alumni';
  return (
    <div className="er-ind-student-card">
      <button type="button" className="er-ind-student-header" onClick={onToggleCard}>
        <div className="er-ind-student-chevron">
          <div className={`er-chevron er-chevron-side ${isCardExpanded ? 'expanded' : ''}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </div>
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
      </button>
      {isCardExpanded && (
        <div className="er-ind-student-body">
          {!isAlumni && subjectBreakdowns.map(subject => (
            <SubjectBreakdownRow
              key={subject.subjectId}
              subject={subject}
              threshold={threshold}
              questionContent={questionContent}
              isExpanded={expandedSubjects.has(subject.subjectId)}
              onToggle={() => onToggleSubject(subject.subjectId)}
            />
          ))}
          {isAlumni && attempts && attempts.map(attempt => (
            <AlumniAttemptRow
              key={attempt.attemptId}
              attempt={attempt}
              threshold={threshold}
              questionContent={questionContent}
              isExpanded={expandedAttempts.has(attempt.attemptId)}
              onToggle={() => onToggleAttempt(attempt.attemptId)}
              expandedSubjects={expandedSubjects[attempt.attemptId] || new Set()}
              onToggleSubject={(subId) => onToggleSubject(attempt.attemptId, subId)}
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
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [expandedAttempts, setExpandedAttempts] = useState(new Set());
  const [expandedSubjectsByCard, setExpandedSubjectsByCard] = useState({});

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

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const toggleAttempt = (attemptId) => {
    setExpandedAttempts(prev => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  };

  // For students, parentId is cardId. For alumni, parentId is attemptId.
  const toggleSubject = (parentId, subjectId) => {
    setExpandedSubjectsByCard(prev => {
      const cardExpanded = new Set(prev[parentId] || []);
      if (cardExpanded.has(subjectId)) cardExpanded.delete(subjectId);
      else cardExpanded.add(subjectId);
      return { ...prev, [parentId]: cardExpanded };
    });
  };

  const filteredAndSorted = useMemo(() => {
    let filtered = studentsData;
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.student.name.toLowerCase().includes(lowerQ) ||
        (d.student.studentId && d.student.studentId.toLowerCase().includes(lowerQ)) ||
        d.student.email.toLowerCase().includes(lowerQ)
      );
    }

    filtered.sort((a, b) => {
      if (sortOrder === 'name_asc') return a.student.name.localeCompare(b.student.name);
      if (sortOrder === 'name_desc') return b.student.name.localeCompare(a.student.name);
      if (sortOrder === 'score_asc') return a.overallPercentage - b.overallPercentage;
      if (sortOrder === 'score_desc') return b.overallPercentage - a.overallPercentage;
      return 0;
    });

    return filtered;
  }, [studentsData, searchQuery, sortOrder]);

  const audienceNoun = audience === 'alumni' ? 'alumni' : 'students';

  if (loading) return <div className="er-ind-loading">Loading individual results...</div>;
  if (error) return <div className="er-ind-error">{error}</div>;

  return (
    <div className="er-ind-container">
      <div className="er-ind-controls">
        <input
          type="text"
          placeholder={`Search ${audienceNoun}...`}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="er-ind-search"
        />
        <select
          value={sortOrder}
          onChange={e => setSortOrder(e.target.value)}
          className="er-ind-sort"
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
            const cardId = data.attemptId || data.student._id;

            return (
              <StudentResultCard
                key={cardId}
                studentData={data}
                threshold={threshold}
                questionContent={questionContent}
                audience={audience}
                isCardExpanded={expandedCards.has(cardId)}
                onToggleCard={() => toggleCard(cardId)}
                expandedAttempts={expandedAttempts}
                onToggleAttempt={toggleAttempt}
                expandedSubjects={audience === 'alumni' ? expandedSubjectsByCard : (expandedSubjectsByCard[cardId] || new Set())}
                onToggleSubject={(subIdOrAttemptId, maybeSubId) => {
                  if (audience === 'alumni') {
                    toggleSubject(subIdOrAttemptId, maybeSubId);
                  } else {
                    toggleSubject(cardId, subIdOrAttemptId);
                  }
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
