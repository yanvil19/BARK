import React, { useEffect, useState, useMemo, memo } from 'react';
import { getExamStudentResults } from '../../services/mockExamResultService';

const QuestionBreakdownRow = memo(({ question, audience }) => {
  const isAlumni = audience === 'alumni';
  
  if (!isAlumni) {
    return (
      <div className="er-ind-q-row">
        <div className="er-ind-q-prompt">{question.label}</div>
        <div className={`er-ind-q-points ${question.isCorrect ? 'correct' : 'incorrect'}`}>
          {question.points} point{question.points !== 1 ? 's' : ''}
        </div>
      </div>
    );
  }

  return (
    <div className="ser-question-item" style={{ 
      background: '#fff', 
      border: '1px solid #e5e7eb', 
      borderRadius: '0.5rem', 
      padding: '1.5rem',
      marginBottom: '1rem'
    }}>
      <div className="ser-question-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
          {question.label}
        </h3>
        <span style={{ 
          padding: '0.25rem 0.75rem', 
          borderRadius: '9999px', 
          fontSize: '0.875rem', 
          fontWeight: '500',
          backgroundColor: question.isCorrect ? '#dcfce7' : '#fee2e2',
          color: question.isCorrect ? '#166534' : '#991b1b'
        }}>
          {question.isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>
      
      {question.description && (
        <p style={{ color: '#4b5563', marginBottom: '1rem' }}>{question.description}</p>
      )}
      
      {question.images && question.images.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          {question.images.map((img, i) => (
            <img key={i} src={img} alt="Question figure" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '0.375rem' }} />
          ))}
        </div>
      )}
      
      <div className="ser-answers-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {question.answers && question.answers.map(ans => {
          const isUserSelection = ans._id === question.userAnswer;
          const isActualCorrect = ans._id === question.correctAnswer;
          
          let bg = '#f9fafb';
          let border = '1px solid #e5e7eb';
          
          if (isActualCorrect) {
            bg = '#ecfdf5';
            border = '1px solid #34d399';
          } else if (isUserSelection && !isActualCorrect) {
            bg = '#fef2f2';
            border = '1px solid #f87171';
          }

          return (
            <div key={ans._id} style={{
              padding: '1rem',
              borderRadius: '0.375rem',
              background: bg,
              border: border,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              <div style={{
                width: '1.25rem',
                height: '1.25rem',
                borderRadius: '50%',
                border: '1px solid',
                borderColor: isUserSelection ? (question.isCorrect ? '#10b981' : '#ef4444') : '#d1d5db',
                background: isUserSelection ? (question.isCorrect ? '#10b981' : '#ef4444') : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {isUserSelection && (
                  <div style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: '#fff' }} />
                )}
              </div>
              <span style={{ 
                color: '#374151',
                fontWeight: isActualCorrect ? '600' : '400' 
              }}>
                {ans.text}
              </span>
              {isActualCorrect && (
                <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#10b981', fontWeight: '600' }}>
                  ✓ Correct Answer
                </span>
              )}
              {isUserSelection && !isActualCorrect && (
                <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#ef4444', fontWeight: '600' }}>
                  ✗ Your Answer
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const SubjectBreakdownRow = memo(({ subject, isExpanded, onToggle, audience }) => {
  const statusClass = subject.percentage >= 70 ? 'green' : (subject.percentage >= 50 ? 'orange' : 'red');

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
          <div className="er-ind-sub-meta-sm">{subject.correct}/{subject.total} correct</div>
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
          {subject.questions.map(q => <QuestionBreakdownRow key={q.questionId} question={q} audience={audience} />)}
        </div>
      )}
    </div>
  );
});

const AlumniAttemptRow = memo(({ attempt, audience, isExpanded, onToggle, expandedSubjects, onToggleSubject }) => {
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
              isExpanded={expandedSubjects.has(subject.subjectId)}
              onToggle={() => onToggleSubject(subject.subjectId)}
              audience={audience}
            />
          ))}
        </div>
      )}
    </div>
  );
});

const StudentResultCard = memo(({ studentData, expandedSubjects, onToggleSubject, isCardExpanded, onToggleCard, audience, expandedAttempts, onToggleAttempt }) => {
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
              isExpanded={expandedSubjects.has(subject.subjectId)}
              onToggle={() => onToggleSubject(subject.subjectId)}
              audience={audience}
            />
          ))}
          {isAlumni && attempts && attempts.map(attempt => (
            <AlumniAttemptRow
              key={attempt.attemptId}
              attempt={attempt}
              audience={audience}
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
                audience={audience}
                isCardExpanded={expandedCards.has(cardId)}
                onToggleCard={() => toggleCard(cardId)}
                expandedAttempts={expandedAttempts}
                onToggleAttempt={toggleAttempt}
                // For students, expandedSubjectsByCard uses cardId. 
                // For alumni, expandedSubjects uses attemptId (passed as the whole map, and the card extracts it).
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
