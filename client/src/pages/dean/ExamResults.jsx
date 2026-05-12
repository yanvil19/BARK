import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { listExamsWithStatus, getExamResult, computeExamResult } from '../../services/mockExamResultService';
import '../../styles/ExamResults.css';

// --- SHARED UI HELPERS ---
const getStatusClass = (avg, threshold) => {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
};

const getQuestionTagInfo = (rate) => {
  if (rate >= 75) return { text: 'Most got this right', className: 'tag-green' };
  if (rate >= 50) return { text: 'Mixed results', className: 'tag-yellow' };
  return { text: 'Most got this wrong', className: 'tag-red' };
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// --- MEMOIZED COMPONENTS ---

const QuestionRow = memo(({ question }) => {
  const tagInfo = getQuestionTagInfo(question.correctRate);
  return (
    <div className="er-question-item">
      <div className="er-q-header">
        <span className="er-q-label">{question.label}</span>
        <span className="er-q-rate">{question.correctRate}%</span>
      </div>
      <div className={`er-q-tag ${tagInfo.className}`}>
        {tagInfo.text}
      </div>
    </div>
  );
});

const TopicRow = memo(({ subject, isExpanded, onToggle }) => {
  const status = getStatusClass(subject.averageScore, subject.threshold);
  
  return (
    <div className="er-topic-wrapper">
      <div className="er-topic-row" onClick={onToggle}>
        <div className={`er-topic-name status-${status}`}>{subject.name}</div>
        <div className="er-topic-bar-bg">
          <div 
            className={`er-topic-bar-fill bg-${status}`} 
            style={{ width: `${subject.averageScore}%` }} 
          />
        </div>
        <div className={`er-topic-pct status-${status}`}>{subject.averageScore}%</div>
        <div className="er-topic-fraction">{subject.correctCount}/{subject.totalItems}</div>
        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className="er-questions-grid">
          {subject.questions.map((q, idx) => (
            <QuestionRow key={idx} question={q} />
          ))}
        </div>
      )}
    </div>
  );
});

// Circular Progress Component
const CircularProgress = ({ percentage, threshold }) => {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="er-circular-container">
      <svg className="er-circular-svg">
        <circle className="er-circular-bg" cx="90" cy="90" r={radius} />
        <circle 
          className="er-circular-fill" 
          cx="90" cy="90" r={radius} 
          style={{ 
            strokeDasharray: circumference, 
            strokeDashoffset: offset 
          }} 
        />
      </svg>
      <div className="er-circular-text">
        <span className="big-pct">{percentage}%</span>
        <span className="small-total">/ 100%</span>
        <div className="er-threshold-label">Threshold: {threshold}%</div>
      </div>
    </div>
  );
};

// --- MAIN PAGE ---

const ExamResults = () => {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computingId, setComputingId] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [expandedSubjectName, setExpandedSubjectName] = useState(null);

  // Threshold state is strictly managed via handleViewReport (from MockBoardExam metadata).
  // This ensures the current exam setting always wins over legacy computed reports.

  const fetchExams = useCallback(async () => {
    try {
      const data = await listExamsWithStatus();
      setExams(data.exams || []);
    } catch (err) {
      console.error('Failed to fetch exams:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleViewReport = useCallback(async (examId) => {
    setSelectedExamId(examId);
    setLoading(true);
    
    // Auto-sync threshold from exam list
    const exam = exams.find(e => e._id === examId);
    if (exam && (exam.passingThreshold !== undefined && exam.passingThreshold !== null)) {
      setThreshold(exam.passingThreshold);
    }

    try {
      const data = await getExamResult(examId);
      // Gracefully handle "not computed" without 404
      setActiveReport(data.result || null);
      setExpandedSubjectName(null);
    } catch (err) {
      setActiveReport(null);
      console.warn('Could not load report:', err.message);
    } finally {
      setLoading(false);
    }
  }, [exams]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  // Polling for pending status
  useEffect(() => {
    if (!selectedExamId || (activeReport && activeReport.status === 'computed')) return;
    const pollInterval = setInterval(async () => {
      try {
        const data = await getExamResult(selectedExamId);
        if (data.result) {
          setActiveReport(data.result);
          fetchExams(); // Refresh sidebar status too
        }
      } catch (err) {}
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [selectedExamId, activeReport?.status, fetchExams]);

  const handleCompute = async (examId) => {
    setComputingId(examId);
    try {
      const data = await computeExamResult(examId, threshold);
      fetchExams();
      if (selectedExamId === examId) setActiveReport(data.result);
    } catch (err) {
      alert('Computation failed: ' + err.message);
    } finally {
      setComputingId(null);
    }
  };

  // Enriched data for rendering
  const enrichedSubjects = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.subjects.map(s => ({
      ...s,
      threshold: threshold // Use the metadata threshold for breakdown colors
    }));
  }, [activeReport, threshold]);

  const summary = useMemo(() => {
    if (!activeReport) return null;
    const avg = Math.round(activeReport.subjects.reduce((acc, s) => acc + s.averageScore, 0) / activeReport.subjects.length);
    return {
      overallAvg: avg,
      takers: activeReport.totalTakers,
      date: new Date(activeReport.dateConducted).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      computedAt: formatDateTime(activeReport.computedAt),
      currentThreshold: threshold // Use the metadata threshold
    };
  }, [activeReport, threshold]);

  return (
    <div className="er-page">
      <header className="page-header">
        <h1 className="page-header-title">Mock Board Exam Results</h1>
        <p className="page-header-subtitle">Select an exam to view analysis</p>
      </header>

      <div className="er-layout">
        
        {/* Sidebar */}
        <aside className="er-sidebar">
          <div className="er-sidebar-card" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e1e3ed', padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '1px', color: '#8c96ae' }}>Exams</h3>
            <div className="er-sidebar-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '75vh', overflowY: 'auto' }}>
              {exams.map(exam => (
                <div 
                  key={exam._id} 
                  className={`er-sidebar-item ${selectedExamId === exam._id ? 'active' : ''}`}
                  onClick={() => handleViewReport(exam._id)}
                  style={{ 
                    padding: '12px', 
                    borderRadius: '8px', 
                    border: '1px solid #f0f4ff', 
                    cursor: 'pointer',
                    background: selectedExamId === exam._id ? '#1e2d6b' : 'white',
                  }}
                >
                  <div className="side-name" style={{ fontWeight: '600', fontSize: '13px', color: selectedExamId === exam._id ? 'white' : '#1f2937' }}>{exam.name}</div>
                  <div className="side-meta" style={{ fontSize: '11px', color: selectedExamId === exam._id ? 'rgba(255,255,255,0.7)' : '#6b7280', marginTop: '2px' }}>
                    {new Date(exam.startDateTime).toLocaleDateString()}
                  </div>
                  
                  {/* Status Indicator */}
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: '700',
                      color: selectedExamId === exam._id ? 'rgba(255,255,255,0.8)' : (exam.computationStatus === 'computed' ? '#16a34a' : '#9ca3af')
                    }}>
                      {exam.computationStatus === 'computed' ? '● READY' : '○ PENDING'}
                    </span>
                    {exam.computationStatus !== 'computed' && exam.status === 'finished' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleCompute(exam._id); }}
                        style={{ fontSize: '10px', background: '#f5c518', color: '#1e2d6b', border: 'none', padding: '2px 8px', borderRadius: '4px', fontWeight: 'bold' }}
                      >
                        {computingId === exam._id ? '...' : 'COMPUTE'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="er-content">
          {!selectedExamId && (
            <div style={{ textAlign: 'center', padding: '100px', opacity: 0.5 }}>
              <h3>Choose an exam to begin analysis</h3>
            </div>
          )}

          {selectedExamId && !loading && !activeReport && (
            <div className="er-empty-report" style={{ textAlign: 'center', padding: '60px 100px', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📊</div>
              <h2 style={{ color: '#1e2d6b', marginBottom: '12px', fontWeight: '800' }}>Results Ready to Compute</h2>
              <p style={{ color: '#6b7280', marginBottom: '32px' }}>Select your passing threshold and generate the analytical breakdown for this exam.</p>
              
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: '#35408e', background: '#f0f4ff', padding: '8px 16px', borderRadius: '8px' }}>
                  Threshold: <strong>{threshold}%</strong>
                </div>
              </div>

              <button 
                className="er-btn-add" 
                style={{ background: '#1e2d6b', color: 'white', border: 'none', padding: '12px 32px', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}
                onClick={() => handleCompute(selectedExamId)}
                disabled={computingId === selectedExamId}
              >
                {computingId === selectedExamId ? 'Starting Analysis...' : 'Generate Analysis'}
              </button>
            </div>
          )}

          {activeReport && (
            <div className="er-report-view">
              {/* Exam Specific Header */}
              <div className="er-report-header">
                <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '800', color: '#1e2d6b' }}>{activeReport.examName}</h2>
                <div className="er-report-meta">
                  <span className="er-report-ts">Last computed: {summary.computedAt}</span>
                  <span className="er-divider">|</span>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#35408e', background: '#f0f4ff', padding: '4px 12px', borderRadius: '6px' }}>
                    Threshold: {threshold}%
                  </div>
                </div>
              </div>
              
              {/* Hero Card */}
              <section className="er-hero-card">
                <CircularProgress percentage={summary.overallAvg} threshold={threshold} />
                <div className="er-hero-metrics">
                  <div className="er-metric-item">
                    <span className="m-value">{summary.overallAvg}%</span>
                    <span className="m-label">Avg Score</span>
                  </div>
                  <div className="er-metric-item">
                    <span className="m-value">{summary.takers}</span>
                    <span className="m-label">Total Takers</span>
                  </div>
                  <div className="er-metric-item">
                    <span className="m-value">{summary.date}</span>
                    <span className="m-label">Date Conducted</span>
                  </div>
                </div>
              </section>

              {/* Breakdown Card */}
              <section className="er-breakdown-card">
                <div className="er-breakdown-header">
                  <h2>Score Breakdown by Topic</h2>
                  <p>Performance across each subject area in this exam</p>
                </div>
                <div className="er-topic-list">
                  {enrichedSubjects.map((subject, idx) => (
                    <TopicRow 
                      key={idx} 
                      subject={subject} 
                      isExpanded={expandedSubjectName === subject.name}
                      onToggle={() => setExpandedSubjectName(prev => prev === subject.name ? null : subject.name)}
                    />
                  ))}
                </div>
              </section>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ExamResults;
