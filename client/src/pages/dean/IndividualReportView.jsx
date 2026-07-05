import React, { useEffect, useState, useMemo, memo } from 'react';
import { getExamStudentResults } from '../../services/mockExamResultService';

const QuestionBreakdownRow = memo(({ question }) => (
  <div className="er-ind-q-row">
    <div className="er-ind-q-prompt">{question.label}</div>
    <div className={`er-ind-q-points ${question.isCorrect ? 'correct' : 'incorrect'}`}>
      {question.points} point{question.points !== 1 ? 's' : ''}
    </div>
  </div>
));

const SubjectBreakdownRow = memo(({ subject, isExpanded, onToggle }) => {
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
          {subject.questions.map(q => <QuestionBreakdownRow key={q.questionId} question={q} />)}
        </div>
      )}
    </div>
  );
});

const StudentResultCard = memo(({ studentData, expandedSubjects, onToggleSubject, isCardExpanded, onToggleCard }) => {
  const { student, overallPercentage, passed, subjectBreakdowns } = studentData;
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
          {subjectBreakdowns.map(subject => (
            <SubjectBreakdownRow 
              key={subject.subjectId} 
              subject={subject} 
              isExpanded={expandedSubjects.has(subject.subjectId)}
              onToggle={() => onToggleSubject(subject.subjectId)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default function IndividualReportView({ examId, threshold }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [studentsData, setStudentsData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('name_asc');
  const [expandedCards, setExpandedCards] = useState(new Set());
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

  const toggleCard = (attemptId) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(attemptId)) next.delete(attemptId);
      else next.add(attemptId);
      return next;
    });
  };

  const toggleSubject = (attemptId, subjectId) => {
    setExpandedSubjectsByCard(prev => {
      const cardExpanded = new Set(prev[attemptId] || []);
      if (cardExpanded.has(subjectId)) cardExpanded.delete(subjectId);
      else cardExpanded.add(subjectId);
      return { ...prev, [attemptId]: cardExpanded };
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

  if (loading) return <div className="er-ind-loading">Loading individual results...</div>;
  if (error) return <div className="er-ind-error">{error}</div>;

  return (
    <div className="er-ind-container">
      <div className="er-ind-controls">
        <input 
          type="text" 
          placeholder="Search students..." 
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
          <div className="er-ind-empty">No students found matching your criteria.</div>
        ) : (
          filteredAndSorted.map(data => (
            <StudentResultCard 
              key={data.attemptId}
              studentData={data}
              isCardExpanded={expandedCards.has(data.attemptId)}
              onToggleCard={() => toggleCard(data.attemptId)}
              expandedSubjects={expandedSubjectsByCard[data.attemptId] || new Set()}
              onToggleSubject={(subId) => toggleSubject(data.attemptId, subId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
