import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { listExamsWithStatus, getExamResult, computeExamResult } from '../../services/mockExamResultService';
import '../../styles/ExamResults.css';

// --- SHARED UI HELPERS ---
const getPriorityBadge = (avg, threshold) => {
  if (avg >= threshold) return <span className="er-badge er-badge-on-track">On track</span>;
  if (avg >= threshold * 0.7) return <span className="er-badge er-badge-attention">Needs attention</span>;
  return <span className="er-badge er-badge-focus">Priority focus</span>;
};

const getBarColor = (avg, threshold) => {
  if (avg >= threshold) return '#22c55e';
  if (avg >= threshold * 0.7) return '#eab308';
  return '#ef4444';
};

const getQuestionTag = (rate) => {
  if (rate >= 75) return <span className="er-tag er-tag-right">Most got this right</span>;
  if (rate >= 50) return <span className="er-tag er-tag-mixed">Mixed results</span>;
  return <span className="er-tag er-tag-wrong">Most got this wrong</span>;
};

// --- MEMOIZED COMPONENTS ---

const QuestionRow = memo(({ question }) => (
  <div className="er-question-item">
    <div className="er-q-header">
      <span className="er-q-label">{question.label}</span>
      <span className="er-q-rate">{question.correctRate}%</span>
    </div>
    {getQuestionTag(question.correctRate)}
  </div>
));

const SubjectBar = memo(({ subject, isExpanded, onToggle }) => (
  <div className="er-subject-row">
    <div className="er-subject-info">
      <div className="er-subject-name-wrap">
        <h3>{subject.name}</h3>
        {subject.badge}
      </div>
      <div className="er-subject-stats">
        <div className="er-subject-avg">{subject.averageScore}%</div>
        <div className="er-subject-frac">
          {subject.correctCount} / {subject.totalItems} Items Avg.
        </div>
      </div>
    </div>
    
    <div className="er-perf-bar-bg">
      <div 
        className="er-perf-bar-fill" 
        style={{ 
          width: `${subject.averageScore}%`, 
          backgroundColor: subject.color 
        }}
      />
      <div className="er-threshold-line" style={{ left: `${subject.threshold}%` }} />
    </div>

    <button className="er-expand-btn" onClick={onToggle}>
      {isExpanded ? '▴ Hide Question Breakdown' : '▾ View Question Breakdown'}
    </button>

    {/* Lazy Rendering of Questions */}
    {isExpanded && (
      <div className="er-questions-grid">
        {subject.questions.map((q, idx) => (
          <QuestionRow key={idx} question={q} />
        ))}
      </div>
    )}
  </div>
));

// --- MAIN PAGE ---

const ExamResults = () => {
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computingId, setComputingId] = useState(null);
  const [expandedSubjectName, setExpandedSubjectName] = useState(null);

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
    try {
      const data = await getExamResult(examId);
      setActiveReport(data.result);
      setExpandedSubjectName(null);
    } catch (err) {
      setActiveReport(null);
      if (err.message !== 'Result not found or not yet computed') {
        console.warn('Report load warning:', err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-polling for pending status - Ensures cleanup and prevents memory leaks
  useEffect(() => {
    // Only poll if an exam is selected AND we either have no report or it's still pending
    if (!selectedExamId || (activeReport && activeReport.status === 'computed')) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getExamResult(selectedExamId);
        if (data.result) {
          setActiveReport(data.result);
          // If it just finished computing, the interval will be cleared on the next effect run
          // because activeReport.status will be 'computed'
        }
      } catch (err) {
        // Silently ignore 404s during polling
        if (err.message !== 'Result not found or not yet computed') {
          console.error('Polling error:', err);
        }
      }
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [selectedExamId, activeReport?.status]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleCompute = async (examId) => {
    setComputingId(examId);
    try {
      const data = await computeExamResult(examId);
      fetchExams();
      if (selectedExamId === examId) {
        setActiveReport(data.result);
      }
    } catch (err) {
      alert('Computation failed: ' + err.message);
    } finally {
      setComputingId(null);
    }
  };

  // Stable props for SubjectBar via useMemo
  const enrichedSubjects = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.subjects.map(s => ({
      ...s,
      color: getBarColor(s.averageScore, activeReport.passingThreshold),
      badge: getPriorityBadge(s.averageScore, activeReport.passingThreshold),
      threshold: activeReport.passingThreshold
    }));
  }, [activeReport]);

  // Summary Metrics
  const summary = useMemo(() => {
    if (!activeReport) return null;
    const threshold = activeReport.passingThreshold;
    return {
      totalSubjects: activeReport.subjects.length,
      overallAvg: (activeReport.subjects.reduce((acc, s) => acc + s.averageScore, 0) / activeReport.subjects.length).toFixed(1),
      onTrack: activeReport.subjects.filter(s => s.averageScore >= threshold).length,
      needsFocus: activeReport.subjects.filter(s => s.averageScore < threshold).length
    };
  }, [activeReport]);

  return (
    <div className="er-page">
      <header className="er-header">
        <div className="er-header-title">
          <h1>Mock Board Exam Results</h1>
          <p>Automated performance analysis for department mock board exams.</p>
        </div>
        <button className="er-btn-add" onClick={fetchExams} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh List'}
        </button>
      </header>

      <div className="er-layout" style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '24px', padding: '0 24px' }}>
        
        {/* Exam List Sidebar */}
        <aside className="er-sidebar">
          <div className="er-exam-list-card" style={{ background: 'white', borderRadius: '12px', border: '1px solid #e1e3ed', padding: '16px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', color: 'var(--primary-bg)' }}>Exams</h3>
            <div className="er-sidebar-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              {exams.length === 0 && !loading && <p style={{ color: '#8c96ae', fontSize: '13px' }}>No exams found.</p>}
              {exams.map(exam => (
                <div 
                  key={exam._id} 
                  className={`er-sidebar-item ${selectedExamId === exam._id ? 'active' : ''}`}
                  onClick={() => handleViewReport(exam._id)}
                  style={{ 
                    padding: '12px', 
                    borderRadius: '8px', 
                    border: '1px solid #f3f4f6', 
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    background: selectedExamId === exam._id ? '#f0f4ff' : 'white',
                    borderColor: selectedExamId === exam._id ? '#3b82f6' : '#f3f4f6'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#1f2937' }}>{exam.name}</div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                    {new Date(exam.startDateTime).toLocaleDateString()} • {exam.status.toUpperCase()}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ 
                      fontSize: '10px', 
                      padding: '2px 8px', 
                      borderRadius: '10px', 
                      background: exam.computationStatus === 'computed' ? '#dcfce7' : '#f3f4f6',
                      color: exam.computationStatus === 'computed' ? '#166534' : '#6b7280'
                    }}>
                      {exam.computationStatus === 'computed' ? 'Results Ready' : 'Processing'}
                    </span>
                    {exam.status === 'finished' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleCompute(exam._id); }}
                        disabled={computingId === exam._id}
                        style={{ fontSize: '10px', background: 'var(--primary-bg)', color: '#fad227', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                      >
                        {computingId === exam._id ? '...' : 'Compute'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Report Content */}
        <main className="er-content">
          {loading && !activeReport && <div style={{ textAlign: 'center', padding: '100px' }}>Loading Report...</div>}
          
          {!loading && !activeReport && selectedExamId && (
            <div className="er-empty-report" style={{ textAlign: 'center', padding: '100px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb' }}>
              <h3>Result Not Computed</h3>
              <p style={{ color: '#6b7280' }}>The results for this exam haven't been processed yet.</p>
              <button 
                className="er-btn-add" 
                style={{ marginTop: '16px' }}
                onClick={() => handleCompute(selectedExamId)}
                disabled={computingId === selectedExamId}
              >
                {computingId === selectedExamId ? 'Processing...' : 'Compute Results Now'}
              </button>
            </div>
          )}

          {!selectedExamId && !loading && (
            <div className="er-empty-report" style={{ textAlign: 'center', padding: '100px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #e5e7eb' }}>
              <h2 style={{ color: '#374151' }}>Select an Exam</h2>
              <p style={{ color: '#6b7280' }}>Choose an exam from the left sidebar to view its performance analysis.</p>
            </div>
          )}

          {activeReport && (
            <div className="er-report-container">
              {/* Summary Metrics */}
              {summary && (
                <div className="er-summary-grid" style={{ margin: '0 0 24px 0' }}>
                  <div className="er-summary-card">
                    <h3>Total Subjects</h3>
                    <div className="value">{summary.totalSubjects}</div>
                  </div>
                  <div className="er-summary-card">
                    <h3>Overall Average</h3>
                    <div className="value">{summary.overallAvg}%</div>
                  </div>
                  <div className="er-summary-card">
                    <h3>On Track</h3>
                    <div className="value" style={{ color: '#16a34a' }}>{summary.onTrack}</div>
                  </div>
                  <div className="er-summary-card">
                    <h3>Needs Focus</h3>
                    <div className="value" style={{ color: '#dc2626' }}>{summary.needsFocus}</div>
                  </div>
                </div>
              )}

              {/* Report Header */}
              <div className="er-exam-card" style={{ marginBottom: '24px' }}>
                <div className="er-exam-header" style={{ borderBottom: 'none' }}>
                  <div className="er-exam-title-wrap">
                    <h2>{activeReport.examName} Analysis</h2>
                    <div className="er-exam-meta">
                      <span>📅 Conducted: {new Date(activeReport.dateConducted).toLocaleDateString()}</span>
                      <span>👥 {activeReport.totalTakers} Takers</span>
                      <span>🎯 Threshold: {activeReport.passingThreshold}%</span>
                    </div>
                  </div>
                  <button onClick={() => handleCompute(selectedExamId)} className="er-btn-add" style={{ padding: '6px 12px', fontSize: '12px' }}>Re-Compute</button>
                </div>
              </div>

              {/* Subjects List */}
              <div className="er-results-list" style={{ margin: 0 }}>
                {enrichedSubjects.map((subject, idx) => (
                  <div key={idx} className="er-exam-card" style={{ marginBottom: '16px' }}>
                    <div className="er-subjects-container" style={{ padding: '20px' }}>
                      <SubjectBar 
                        subject={subject}
                        isExpanded={expandedSubjectName === subject.name}
                        onToggle={() => setExpandedSubjectName(prev => prev === subject.name ? null : subject.name)}
                      />
                    </div>
                  </div>
                ))}
              </div>

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ExamResults;
