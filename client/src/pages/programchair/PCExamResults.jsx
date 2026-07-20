import React, { useEffect, useState, useMemo, memo, useCallback } from 'react';
import { listExamsWithStatus, getExamResult, computeExamResult } from '../../services/mockExamResultService';
import '../../styles/programchair/PCExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';
import { useToast } from '../../components/Toast.jsx';
import IndividualReportView from "./PCIndividualReportView.jsx";

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
  if ((exam.targetAudience || 'student') === 'alumni') return 'No attempts';
  if (exam.status === 'finished') return 'Ready to compute';
  return 'Pending';
};

const getComputationTone = (exam) => {
  if (exam.computationStatus === 'computed') return 'ready';
  if (exam.status === 'finished') return 'action';
  return 'pending';
};

const getAudienceLabel = (exam) => ((exam.targetAudience || 'student') === 'alumni' ? 'Alumni' : 'Students');

const QuestionRow = memo(({ question, isExpanded, onToggle }) => {
  const tagInfo = getQuestionTagInfo(question.correctRate);
  const answerCounts = question.answerCounts || [];
  const totalAnswers = answerCounts.reduce((sum, answer) => sum + (answer.count || 0), 0) + (question.unansweredCount || 0);

  return (
    <div className="er-question-item">
      <button type="button" className="er-question-row" onClick={onToggle}>
        <div className="er-question-main">
          <span className="er-q-label">{question.label}</span>
          <div className={`er-q-tag ${tagInfo.className}`}>{tagInfo.text}</div>
        </div>

        <div className="er-question-row-meta">
          <span className="er-q-rate">{question.correctRate}% correct</span>
          <span className="er-q-respondents">{totalAnswers} responses</span>
        </div>

        <div className={`er-chevron ${isExpanded ? 'expanded' : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="er-question-details">
          <div className="er-question-prompt-card">
            <span className="er-question-detail-label">Question</span>
            <p>{question.description || question.label}</p>
          </div>

          <div className="er-answer-breakdown">
            <span className="er-question-detail-label">Answer choices</span>
            {answerCounts.length > 0 ? (
              answerCounts.map((answer) => (
                <div key={answer.answerId || answer.text} className={`er-answer-row ${answer.isCorrect ? 'correct' : ''}`}>
                  <div className="er-answer-copy">
                    <span className="er-answer-text">{answer.text || 'Untitled answer'}</span>
                    {answer.isCorrect && <span className="er-answer-correct-pill">Correct answer</span>}
                  </div>
                  <strong>{answer.count || 0}</strong>
                </div>
              ))
            ) : (
              <div className="er-answer-empty">No answer choices were stored for this question.</div>
            )}
            {(question.unansweredCount || 0) > 0 && (
              <div className="er-answer-row muted">
                <span className="er-answer-text">No answer submitted</span>
                <strong>{question.unansweredCount}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const TopicRow = memo(({ subject, isExpanded, onToggle, expandedQuestionKey, onQuestionToggle }) => {
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
        <div className="er-questions-list">
          {subject.questions.map((question, idx) => (
            <QuestionRow
              key={question.questionId || `${subject.name}-${idx}`}
              question={question}
              isExpanded={expandedQuestionKey === `${subject.name}-${question.questionId || idx}`}
              onToggle={() => onQuestionToggle(`${subject.name}-${question.questionId || idx}`)}
            />
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
        <span className="er-side-threshold">{getAudienceLabel(exam)}</span>
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

const ReportTabToggle = ({ activeTab, onChange, showIndividual = true }) => (
  <div className="er-report-tab-toggle">
    <button 
      className={`er-tab-btn ${activeTab === 'overall' ? 'active' : ''}`}
      onClick={() => onChange('overall')}
    >
      Overall
    </button>
    {showIndividual && (
      <button
        className={`er-tab-btn ${activeTab === 'individual' ? 'active' : ''}`}
        onClick={() => onChange('individual')}
      >
        Individual
      </button>
    )}
  </div>
);

const ExamResults = ({ me }) => {
  const { notify } = useToast();
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [activeReport, setActiveReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [computingId, setComputingId] = useState(null);
  const [threshold, setThreshold] = useState(70);
  const [expandedSubjectName, setExpandedSubjectName] = useState(null);
  const [expandedQuestionKey, setExpandedQuestionKey] = useState(null);
  
  const isProgramChair = me?.role === 'program_chair';
  const userProgramId = me?.program?._id || me?.program;
  const initialProgramId = isProgramChair && userProgramId ? String(userProgramId) : 'all';
  
  const [selectedProgramId, setSelectedProgramId] = useState(initialProgramId);
  const [selectedAudience, setSelectedAudience] = useState('student');
  const [activeTab, setActiveTab] = useState('overall');

  const fetchExams = useCallback(async () => {
    try {
      const data = await listExamsWithStatus();
      let allExams = data.exams || [];
      if (me?.role === 'program_chair') {
        const myProgramId = me?.program?._id || me?.program;
        allExams = allExams.filter(e => String(e.program?._id || e.program) === String(myProgramId));
      }
      setExams(allExams);
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
      setExpandedQuestionKey(null);
      setActiveTab('overall');
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
    let next = exams;
    if (selectedProgramId !== 'all') {
      next = next.filter((exam) => String(exam.program?._id || exam.program) === String(selectedProgramId));
    }
    if (selectedAudience !== 'all') {
      next = next.filter((exam) => (exam.targetAudience || 'student') === selectedAudience);
    }
    return next;
  }, [exams, selectedProgramId, selectedAudience]);

  const examStats = useMemo(() => {
    const total = filteredExams.length;
    const studentExams = filteredExams.filter((exam) => (exam.targetAudience || 'student') === 'student');
    const ready = studentExams.filter((exam) => exam.computationStatus === 'computed').length;
    const readyToCompute = studentExams.filter((exam) => exam.computationStatus !== 'computed' && exam.status === 'finished').length;
    return { total, ready, readyToCompute };
  }, [filteredExams]);

  useEffect(() => {
    if (!selectedExamId) return;
    const selectedStillVisible = filteredExams.some((exam) => exam._id === selectedExamId);
    if (!selectedStillVisible) {
      setSelectedExamId(null);
      setActiveReport(null);
      setExpandedSubjectName(null);
      setExpandedQuestionKey(null);
    }
  }, [filteredExams, selectedExamId]);

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
      overallAvg: activeReport.overallAverageScore ?? avg,
      highestScore: activeReport.highestScore ?? 0,
      lowestScore: activeReport.lowestScore ?? 0,
      takers: activeReport.totalTakers,
      totalEligible: activeReport.totalEligibleStudents ?? 0,
      totalAttempts: activeReport.totalAttempts,
      date: formatShortDate(activeReport.dateConducted),
      computedAt: formatDateTime(activeReport.computedAt)
    };
  }, [activeReport]);

  return (
    <div className="er-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Mock Board Exam Results"
        subtitle="Review computed analytics, pending exams, and topic-level performance in one place."
      />

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
                disabled={isProgramChair}
              >
                <option value="all">All programs</option>
                {programs.map((program) => (
                  <option key={program._id} value={program._id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="er-program-filter">
              <span>Exam Audience</span>
              <select
                value={selectedAudience}
                onChange={(event) => setSelectedAudience(event.target.value)}
              >
                <option value="student">Student Exams</option>
                <option value="alumni">Alumni Exams</option>
                <option value="all">All Audiences</option>
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

          {selectedExamId && !loading && selectedExam?.targetAudience === 'alumni' && !activeReport && (
            <EmptyStatePanel
              eyebrow="No Attempts"
              title="No alumni attempts yet"
              message="Once alumni submit attempts for this exam, this page will show the average of each alumni's highest score."
            >
              <div className="er-empty-meta-grid">
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Exam</span>
                  <strong>{selectedExam?.name || 'Selected exam'}</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Audience</span>
                  <strong>Alumni</strong>
                </div>
                <div className="er-empty-meta-card">
                  <span className="er-empty-meta-label">Threshold</span>
                  <strong>{threshold}%</strong>
                </div>
              </div>
            </EmptyStatePanel>
          )}

          {selectedExamId && !loading && selectedExam?.targetAudience !== 'alumni' && !activeReport && (
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
            <>
              <div style={{ display: 'flex' }}>
                <ReportTabToggle
                  activeTab={activeTab}
                  onChange={setActiveTab}
                  showIndividual
                />
              </div>
              <div className="er-report-view">
                <div className="er-report-header">
                  <div className="er-report-title-group">
                    <span className="er-report-kicker">
                      {activeReport.targetAudience === 'alumni' ? 'Alumni Highest Score Report' : 'Computed Report'}
                    </span>
                    <h2 className="er-report-title">{activeReport.examName}</h2>
                  </div>
                <div className="er-report-meta">
                  <span className="er-report-ts">Last computed: {summary.computedAt}</span>
                  <span className="er-divider">|</span>
                  <div className="er-threshold-badge">
                    Threshold: {threshold}%
                  </div>
                </div>
              </div>

              {activeTab === 'overall' ? (
                <>
                  <section className="er-hero-card">
                    <div className="er-hero-topline">
                      <span className="er-hero-eyebrow">
                        {activeReport.targetAudience === 'alumni'
                          ? "Average of each alumni's highest score"
                          : 'Overall performance snapshot'}
                      </span>
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
                        <span className="m-value">{summary.highestScore}%</span>
                        <span className="m-label">Highest score</span>
                      </div>
                      <div className="er-metric-item">
                        <span className="m-value">{summary.lowestScore}%</span>
                        <span className="m-label">Lowest score</span>
                      </div>
                      <div className="er-metric-item">
                        <span className="m-value">
                          {activeReport.targetAudience === 'alumni'
                            ? summary.totalAttempts
                            : summary.takers}
                        </span>
                        <span className="m-label">
                          {activeReport.targetAudience === 'alumni' ? 'Total attempts' : 'Total takers'}
                        </span>
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
                          expandedQuestionKey={expandedQuestionKey}
                          onToggle={() => {
                            setExpandedSubjectName((prev) => {
                              const next = prev === subject.name ? null : subject.name;
                              if (next !== subject.name) setExpandedQuestionKey(null);
                              return next;
                            });
                          }}
                          onQuestionToggle={(questionKey) => setExpandedQuestionKey((prev) => (prev === questionKey ? null : questionKey))}
                        />
                      ))}
                    </div>
                  </section>
                </>
              ) : (
                <IndividualReportView
                  examId={selectedExamId}
                  threshold={threshold}
                  audience={activeReport.targetAudience === 'alumni' ? 'alumni' : 'student'}
                />
              )}
            </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default ExamResults;
