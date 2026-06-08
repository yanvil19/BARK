import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { listExamsWithStatus, getExamResult, computeExamResult } from '../../services/mockExamResultService';
import '../../styles/ExamResults.css';
import { useToast } from '../../components/Toast.jsx';

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

const formatShortDate = (dateStr) => {
  if (!dateStr) return 'No date';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getComputationLabel = (exam) => {
  if (exam.computationStatus === 'computed') return 'Ready';
  if (exam.status === 'finished') return 'Ready to compute';
  return 'Pending';
};

const getComputationTone = (exam) => {
  if (exam.computationStatus === 'computed') return 'ready';
  if (exam.status === 'finished') return 'action';
  return 'pending';
};

const QuestionRow = memo(({ question }) => {
  const tagInfo = getQuestionTagInfo(question.correctRate);

  return (
    <div className="er-question-item">
      <div className="er-q-header">
        <span className="er-q-label">{question.label}</span>
        <span className="er-q-rate">{question.correctRate}%</span>
      </div>
      <div className={`er-q-tag ${tagInfo.className}`}>{tagInfo.text}</div>
    </div>
  );
});

const TopicRow = memo(({ subject, isExpanded, onToggle }) => {
  const status = getStatusClass(subject.averageScore, subject.threshold);

  return (
    <div className="er-topic-wrapper">
      <button type="button" className="er-topic-row" onClick={onToggle}>
        <div className="er-topic-main">
          <div className={`er-topic-name status-${status}`}>{subject.name}</div>
          <div className="er-topic-mini-meta">
            <span>{subject.correctCount}/{subject.totalItems} correct</span>
          </div>
        </div>

        <div className="er-topic-bar-col">
          <div className="er-topic-bar-bg">
            <div
              className={`er-topic-bar-fill bg-${status}`}
              style={{ width: `${subject.averageScore}%` }}
            />
          </div>
        </div>

        <div className="er-topic-score-group">
          <div className={`er-topic-pct status-${status}`}>{subject.averageScore}%</div>
          <div className="er-topic-fraction">{subject.correctCount}/{subject.totalItems}</div>
        </div>

        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="er-questions-grid">
          {subject.questions.map((question, idx) => (
            <QuestionRow key={idx} question={question} />
          ))}
        </div>
      )}
    </div>
  );
});

const EmptyStatePanel = ({ eyebrow, title, message, action, children, compact = false }) => (
  <section className={`er-empty-state-card ${compact ? 'compact' : ''}`}>
    {eyebrow && <span className="er-empty-eyebrow">{eyebrow}</span>}
    <h2 className="er-empty-title">{title}</h2>
    <p className="er-empty-message">{message}</p>
    {children}
    {action}
  </section>
);

const SidebarExamItem = memo(({ exam, isActive, onSelect }) => {
  const tone = getComputationTone(exam);

  return (
    <div
      className={`er-sidebar-item ${isActive ? 'active' : ''}`}
      onClick={() => onSelect(exam._id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(exam._id);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="er-sidebar-item-top">
        <div>
          <div className="er-side-name">{exam.name}</div>
          <div className="er-side-meta">{formatShortDate(exam.startDateTime)}</div>
        </div>
        <span className={`er-status-pill tone-${tone}`}>{getComputationLabel(exam)}</span>
      </div>

      <div className="er-sidebar-item-bottom">
        <span className="er-side-threshold">Threshold {exam.passingThreshold ?? 70}%</span>
      </div>
    </div>
  );
});

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
          cx="90"
          cy="90"
          r={radius}
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

const ExamResults = () => {
  const { notify } = useToast();
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computingId, setComputingId] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [expandedSubjectName, setExpandedSubjectName] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState('all');

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

    const exam = exams.find((item) => item._id === examId);
    if (exam && exam.passingThreshold !== undefined && exam.passingThreshold !== null) {
      setThreshold(exam.passingThreshold);
    }

    try {
      const data = await getExamResult(examId);
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

  useEffect(() => {
    if (!selectedExamId || (activeReport && activeReport.status === 'computed')) return;

    const pollInterval = setInterval(async () => {
      try {
        const data = await getExamResult(selectedExamId);
        if (data.result) {
          setActiveReport(data.result);
          fetchExams();
        }
      } catch (err) {
        // Keep polling quietly while a report is still unavailable.
      }
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
      notify('Computation failed: ' + (err.message || 'Unknown error'), { variant: 'error' });
    } finally {
      setComputingId(null);
    }
  };

  const selectedExam = useMemo(
    () => exams.find((exam) => exam._id === selectedExamId) || null,
    [exams, selectedExamId]
  );

  const programs = useMemo(() => {
    const programMap = new Map();

    exams.forEach((exam) => {
      const programId = exam.program?._id || exam.program;
      if (!programId || programMap.has(String(programId))) return;

      programMap.set(String(programId), {
        _id: String(programId),
        name: exam.program?.name || exam.program?.code || `Program ${String(programId).slice(-6)}`,
      });
    });

    return [...programMap.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [exams]);

  const filteredExams = useMemo(() => {
    if (selectedProgramId === 'all') return exams;
    return exams.filter((exam) => String(exam.program?._id || exam.program) === String(selectedProgramId));
  }, [exams, selectedProgramId]);

  const examStats = useMemo(() => {
    const total = filteredExams.length;
    const ready = filteredExams.filter((exam) => exam.computationStatus === 'computed').length;
    const readyToCompute = filteredExams.filter((exam) => exam.computationStatus !== 'computed' && exam.status === 'finished').length;
    return { total, ready, readyToCompute };
  }, [filteredExams]);

  useEffect(() => {
    if (!selectedExamId) return;
    if (selectedProgramId === 'all') return;

    const selectedStillVisible = filteredExams.some((exam) => exam._id === selectedExamId);
    if (!selectedStillVisible) {
      setSelectedExamId(null);
      setActiveReport(null);
      setExpandedSubjectName(null);
    }
  }, [filteredExams, selectedExamId, selectedProgramId]);

  const enrichedSubjects = useMemo(() => {
    if (!activeReport) return [];
    return activeReport.subjects.map((subject) => ({
      ...subject,
      threshold
    }));
  }, [activeReport, threshold]);

  const summary = useMemo(() => {
    if (!activeReport) return null;

    const avg = Math.round(
      activeReport.subjects.reduce((acc, subject) => acc + subject.averageScore, 0) /
      activeReport.subjects.length
    );

    return {
      overallAvg: avg,
      takers: activeReport.totalTakers,
      date: formatShortDate(activeReport.dateConducted),
      computedAt: formatDateTime(activeReport.computedAt)
    };
  }, [activeReport]);

  return (
    <div className="er-page">
      <header className="page-header">
        <h1 className="page-header-title">Mock Board Exam Results</h1>
        <p className="page-header-subtitle">Review computed analytics, pending exams, and topic-level performance in one place.</p>
      </header>

      <div className="er-layout">
        <aside className="er-sidebar">
          <div className="er-sidebar-card">
            <div className="er-sidebar-header">
              <div>
                <h3>Exams</h3>
                <p>Choose an exam to inspect or compute results.</p>
              </div>
              <div className="er-sidebar-count">{examStats.total}</div>
            </div>

            <div className="er-sidebar-summary">
              <div className="er-sidebar-summary-card">
                <span className="er-summary-label">Computed</span>
                <strong>{examStats.ready}</strong>
              </div>
              <div className="er-sidebar-summary-card">
                <span className="er-summary-label">To compute</span>
                <strong>{examStats.readyToCompute}</strong>
              </div>
            </div>

            <label className="er-program-filter">
              <span>Program</span>
              <select
                value={selectedProgramId}
                onChange={(event) => setSelectedProgramId(event.target.value)}
              >
                <option value="all">All programs</option>
                {programs.map((program) => (
                  <option key={program._id} value={program._id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="er-sidebar-scroll">
              {!loading && filteredExams.length === 0 && (
                <EmptyStatePanel
                  compact
                  eyebrow="No Exams"
                  title="No exam records yet"
                  message="Once mock board exams are created, they will appear here for analysis."
                />
              )}

              {filteredExams.map((exam) => (
                <SidebarExamItem
                  key={exam._id}
                  exam={exam}
                  isActive={selectedExamId === exam._id}
                  onSelect={handleViewReport}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="er-content">
          {loading && filteredExams.length === 0 && (
            <EmptyStatePanel
              eyebrow="Loading"
              title="Loading exam results"
              message="We're gathering the latest mock board exam records and analytics."
            />
          )}

          {!loading && filteredExams.length > 0 && !selectedExamId && (
            <EmptyStatePanel
              eyebrow="Nothing Selected"
              title="Choose an exam to open its report"
              message="Select any exam from the left panel to view computed results, topic breakdowns, and threshold tracking."
            >
              <div className="er-empty-chip-row">
                <span className="er-empty-chip">Computed results</span>
                <span className="er-empty-chip">Topic breakdowns</span>
                <span className="er-empty-chip">Threshold tracking</span>
              </div>
            </EmptyStatePanel>
          )}

          {selectedExamId && loading && (
            <EmptyStatePanel
              eyebrow="Loading"
              title="Preparing exam analytics"
              message="Fetching the latest result snapshot for the exam you selected."
            />
          )}

          {selectedExamId && !loading && !activeReport && (
            <EmptyStatePanel
              eyebrow="Analysis Pending"
              title="This exam does not have computed results yet"
              message="Generate the analytical breakdown to unlock topic performance, averages, and question-level insight."
              action={(
                <button
                  className="er-primary-btn"
                  onClick={() => handleCompute(selectedExamId)}
                  disabled={computingId === selectedExamId}
                >
                  {computingId === selectedExamId ? 'Starting analysis...' : 'Generate analysis'}
                </button>
              )}
            >
              <div className="er-empty-meta-grid">
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Exam</span>
                  <strong>{selectedExam?.name || 'Selected exam'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Date</span>
                  <strong>{formatShortDate(selectedExam?.startDateTime)}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Threshold</span>
                  <strong>{threshold}%</strong>
                </div>
              </div>
            </EmptyStatePanel>
          )}

          {activeReport && summary && (
            <div className="er-report-view">
              <div className="er-report-header">
                <div>
                  <span className="er-report-kicker">Computed Report</span>
                  <h2 className="er-report-title">{activeReport.examName}</h2>
                </div>
                <div className="er-report-meta">
                  <span className="er-report-ts">Last computed: {summary.computedAt}</span>
                  <span className="er-divider">|</span>
                  <div style={{ fontWeight: '600', color: '#35408e', background: '#f0f4ff', padding: '4px 12px', borderRadius: '6px' }}>
                    Threshold: {threshold}%
                  </div>
                </div>
              </div>

              <section className="er-hero-card">
                <div className="er-hero-topline">
                  <span className="er-hero-eyebrow">Overall performance snapshot</span>
                  <div className="er-hero-threshold-pill">Threshold {threshold}%</div>
                </div>

                <div className="er-hero-body">
                  <CircularProgress percentage={summary.overallAvg} threshold={threshold} />
                </div>

                <div className="er-hero-metrics">
                  <div className="er-metric-item">
                    <span className="m-value">{summary.overallAvg}%</span>
                    <span className="m-label">Average score</span>
                  </div>
                  <div className="er-metric-item">
                    <span className="m-value">{summary.takers}</span>
                    <span className="m-label">Total takers</span>
                  </div>
                  <div className="er-metric-item">
                    <span className="m-value">{summary.date}</span>
                    <span className="m-label">Date conducted</span>
                  </div>
                </div>
              </section>

              <section className="er-breakdown-card">
                <div className="er-breakdown-header">
                  <h2>Score Breakdown by Topic</h2>
                  <p>Performance across each subject area in this exam. Expand a row to inspect question-level trends.</p>
                </div>

                <div className="er-topic-list">
                  {enrichedSubjects.map((subject, idx) => (
                    <TopicRow
                      key={idx}
                      subject={subject}
                      isExpanded={expandedSubjectName === subject.name}
                      onToggle={() => setExpandedSubjectName((prev) => (prev === subject.name ? null : subject.name))}
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
