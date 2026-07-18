import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/shared/AvailableExams.css';
import '../../styles/shared/StudentExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';
import SearchBar from '../../components/SearchBar.jsx';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(date) {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function getStatusMeta(status) {
  switch (status) {
    case 'passed':
      return { label: 'Passed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
    case 'failed':
      return { label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    default:
      return null;
  }
}

function getStatusClass(avg, threshold) {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
}

function getAttemptPercentage(attempt) {
  if (!attempt || attempt.totalScore <= 0) return 0;
  return Math.round((attempt.rawScore / attempt.totalScore) * 100);
}

function SkeletonCard() {
  return (
    <div className="ae-card ae-card--skeleton">
      <div className="ae-skel-title ae-pulse" />
      <div className="ae-skel-subtitle ae-pulse" />
      <div className="ae-skel-row">
        <div className="ae-skel-pill ae-pulse" />
        <div className="ae-skel-pill ae-pulse" />
        <div className="ae-skel-pill ae-pulse" />
      </div>
      <div className="ae-skel-btn ae-pulse" />
    </div>
  );
}

function CircularProgress({ percentage, threshold }) {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="ser-circular-container">
      <svg className="ser-circular-svg" viewBox="0 0 180 180" aria-hidden="true">
        <circle className="ser-circular-bg" cx="90" cy="90" r={radius} />
        <circle
          className="ser-circular-fill"
          cx="90"
          cy="90"
          r={radius}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="ser-circular-text">
        <span className="big-pct">{percentage}%</span>
        <span className="small-total">/ 100%</span>
        <div className="ser-threshold-label">Threshold: {threshold}%</div>
      </div>
    </div>
  );
}

export default function AlumniExamResults({ examId }) {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [expandedExam, setExpandedExam] = useState(null);
  const [attemptDetails, setAttemptDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const handleSelectAttempt = async (attempt) => {
    setSelectedAttempt(attempt);
    setLoadingDetails(true);
    setAttemptDetails(null);
    try {
      const data = await apiAuth(`${BASE}/api/alumni-exams/attempt/${attempt.id}`);
      setAttemptDetails(data);
    } catch (err) {
      console.error('Failed to load attempt details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleBackToAttempts = () => {
    setSelectedAttempt(null);
    setAttemptDetails(null);
  };

  useEffect(() => {
    async function fetchAttempts() {
      setLoading(true);
      try {
        let allAttempts = [];

        if (examId) {
          const data = await apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(examId)}/my-attempts`);
          allAttempts = data.attempts || [];
        } else {
          const available = await apiAuth(`${BASE}/api/alumni-exams/available`);
          const exams = available.exams || [];
          const attemptsByExam = await Promise.all(
            exams.map((exam) =>
              apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(exam._id)}/my-attempts`)
                .then((data) => data.attempts || [])
                .catch(() => [])
            )
          );
          allAttempts = attemptsByExam.flat();
        }

        const sorted = allAttempts.sort((a, b) => {
          const dateDiff = new Date(b.submittedAt || b.date) - new Date(a.submittedAt || a.date);
          if (dateDiff !== 0) return dateDiff;
          return (b.attemptNumber || 0) - (a.attemptNumber || 0);
        });
        setAttempts(sorted);
        setSelectedAttempt(null);
      } catch (err) {
        console.error('Failed to load alumni attempts:', err);
        setAttempts([]);
        setSelectedAttempt(null);
      } finally {
        setLoading(false);
      }
    }

    fetchAttempts();
  }, [examId]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((attempt) =>
      String(attempt?.examName || '').toLowerCase().includes(q)
    );
  }, [attempts, search]);

  const groupedResults = useMemo(() => {
    const groups = {};

    filteredAttempts.forEach((attempt) => {
      const key = attempt.examId;

      if (!groups[key]) {
        groups[key] = {
          examId: attempt.examId,
          examName: attempt.examName,
          attempts: [],
        };
      }

      groups[key].attempts.push(attempt);
    });

    return Object.values(groups);
  }, [filteredAttempts]);

  const hasResults = filteredAttempts.length > 0;
  const selectedPercentage = getAttemptPercentage(selectedAttempt);
  const selectedThreshold = selectedAttempt?.passingThreshold || 70;

  return (
    <main className="sae-page-container">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Exam Results"
        subtitle="View your alumni exam attempts and performance breakdown"
      />

      <div className="ca-filters ae-filters">
        <SearchBar
          value={search}
          onChange={setSearch}
          className="ca-search"
          placeholder="Search exam results..."
          ariaLabel="Search exam results"
        />
      </div>

      <div className="ser-page-content-wrapper">
        {selectedAttempt ? (
          <div className="ser-detail-view">
            <div className="ser-detail-toolbar">
              <button className="ser-back-btn" onClick={handleBackToAttempts}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                Back to Attempts
              </button>
            </div>

            <div className="ser-report-header">
              <div className="ser-report-title-wrap">
                <h2 className="ser-report-title">{selectedAttempt.examName}</h2>
              </div>

              <div className="ser-report-meta">
                <span className="ser-report-date">Attempt {selectedAttempt.attemptNumber}</span>
                <span className="ser-report-separator">|</span>
                <span className="ser-report-date">Submitted: {formatDate(selectedAttempt.submittedAt || selectedAttempt.date)}</span>
                <span className="ser-report-separator">|</span>
                <span className="ser-meta-chip ser-meta-chip--threshold ser-meta-chip--compact">
                  Threshold: {selectedThreshold}%
                </span>
              </div>
            </div>

            <section className="ser-hero-card">
              <CircularProgress percentage={selectedPercentage} threshold={selectedThreshold} />

              <div className="ser-hero-metrics">
                <div className="ser-metric-item">
                  <span className="m-value">{selectedPercentage}%</span>
                  <span className="m-label">Avg Score</span>
                </div>
                <div className="ser-metric-item">
                  <span className="m-value">{selectedAttempt.rawScore} / {selectedAttempt.totalScore}</span>
                  <span className="m-label">Raw Score</span>
                </div>
                <div className="ser-metric-item">
                  <span className="m-value">
                    {new Date(selectedAttempt.submittedAt || selectedAttempt.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                  <span className="m-label">Date Submitted</span>
                </div>
              </div>
            </section>

            {selectedAttempt.subjectScores && selectedAttempt.subjectScores.length > 0 && (
              <section className="ser-breakdown-card">
                <div className="ser-breakdown-header">
                  <h2>Score Breakdown by Topic</h2>
                  <p>Performance across each subject area in this attempt</p>
                </div>

                <div className="ser-topic-list">
                  {selectedAttempt.subjectScores.map((subject, idx) => {
                    const pct = subject.total > 0 ? Math.round((subject.correct / subject.total) * 100) : 0;
                    const status = getStatusClass(pct, selectedThreshold);

                    return (
                      <div key={idx} className="ser-topic-row">
                        <div className="ser-topic-main">
                          <div className={`ser-topic-name status-${status}`}>{subject.name}</div>
                          <div className="ser-topic-score-group">
                            <div className={`ser-topic-pct status-${status}`}>{pct}%</div>
                            <div className="ser-topic-fraction">{subject.correct}/{subject.total}</div>
                          </div>
                        </div>

                        <div className="ser-topic-bar-bg">
                          <div className={`ser-topic-bar-fill bg-${status}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {loadingDetails && (
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>Loading questions...</div>
            )}

            {attemptDetails && attemptDetails.questions && (
              <section className="ser-breakdown-card" style={{ marginTop: '2rem' }}>
                <div className="ser-breakdown-header">
                  <h2>Exam Questions & Answers</h2>
                  <p>Review the questions and the answers you submitted</p>
                </div>
                
                <div className="ser-questions-list">
                  {attemptDetails.questions.map((q, idx) => {
                    const isCorrect = q.userAnswer === q.correctAnswer;
                    
                    return (
                      <div key={q._id} className="ser-question-item" style={{ 
                        background: '#fff', 
                        border: '1px solid #e5e7eb', 
                        borderRadius: '0.5rem', 
                        padding: '1.5rem',
                        marginBottom: '1rem'
                      }}>
                        <div className="ser-question-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                            {idx + 1}. {q.title}
                          </h3>
                          <span style={{ 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '9999px', 
                            fontSize: '0.875rem', 
                            fontWeight: '500',
                            backgroundColor: isCorrect ? '#dcfce7' : '#fee2e2',
                            color: isCorrect ? '#166534' : '#991b1b'
                          }}>
                            {isCorrect ? 'Correct' : 'Incorrect'}
                          </span>
                        </div>
                        
                        {q.description && (
                          <p style={{ color: '#4b5563', marginBottom: '1rem' }}>{q.description}</p>
                        )}
                        
                        {q.images && q.images.length > 0 && (
                          <div style={{ marginBottom: '1rem' }}>
                            {q.images.map((img, i) => (
                              <img key={i} src={img} alt="Question figure" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '0.375rem' }} />
                            ))}
                          </div>
                        )}
                        
                        <div className="ser-answers-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {q.answers.map(ans => {
                            const isUserSelection = ans._id === q.userAnswer;
                            const isActualCorrect = ans._id === q.correctAnswer;
                            
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
                                  borderColor: isUserSelection ? (isCorrect ? '#10b981' : '#ef4444') : '#d1d5db',
                                  background: isUserSelection ? (isCorrect ? '#10b981' : '#ef4444') : 'transparent',
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
                  })}
                </div>
              </section>
            )}
          </div>
        ) : (
          <>
            {loading && (
              <section className="ae-grid" aria-label="Loading attempts">
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </section>
            )}

            {!loading && attempts.length === 0 && (
              <div className="ae-empty" role="status">
                No alumni exam attempts available yet.
              </div>
            )}

            {!loading && attempts.length > 0 && !hasResults && (
              <div className="ae-empty" role="status">
                No results found matching your search.
              </div>
            )}

            {!loading && hasResults && (
              <section className="ae-grid" aria-label="Alumni exam attempts">
                {groupedResults.map((exam) => {

                  const latestAttempt = exam.attempts[0];

                  const bestAttempt = exam.attempts.reduce(
                    (best, current) => {
                      const currentPct =
                        (current.rawScore / current.totalScore) * 100;

                      const bestPct =
                        (best.rawScore / best.totalScore) * 100;

                      return currentPct > bestPct
                        ? current
                        : best;
                    },
                    exam.attempts[0]
                  );

                  return (
                    <div
                      key={exam.examId}
                      className="ae-card">
                      <div className="ae-card-header">
                        <h3 className="ae-card-title">
                          {exam.examName}
                        </h3>

                        <div className="ae-card-meta">
                          <span className="ae-meta-pill">
                            {exam.attempts.length} Attempts
                          </span>
                        </div>
                      </div>

                      <div className="ae-card-stats">
                        <div className="ae-stat">
                          <span className="ae-stat-label">
                            Best Score
                          </span>

                          <span className="ae-stat-value">
                            {Math.round(
                              (bestAttempt.rawScore / bestAttempt.totalScore) * 100
                            )}
                            %
                          </span>
                        </div>

                        <div className="ae-stat">
                          <span className="ae-stat-label">
                            Latest Attempt
                          </span>

                          <span className="ae-stat-value">
                            #{latestAttempt.attemptNumber}
                          </span>
                        </div>

                        <div className="ae-stat">
                          <span className="ae-stat-label">
                            Last Taken
                          </span>

                          <span className="ae-stat-value-small">
                            {formatDate(
                              latestAttempt.submittedAt || latestAttempt.date
                            )}
                          </span>
                        </div>
                      </div>

                      <button
                        className="ae-view-btn"
                        onClick={() =>
                          setExpandedExam(
                            expandedExam === exam.examId
                              ? null
                              : exam.examId
                          )
                        }
                      >
                        {expandedExam === exam.examId
                          ? "Hide Attempts"
                          : "View Attempts"}
                      </button>

                      {expandedExam === exam.examId && (
                        <div className="ae-attempt-history">
                          {exam.attempts.map((attempt) => {
                            const percentage = getAttemptPercentage(attempt);
                            const statusMeta = getStatusMeta(attempt.status);

                            return (
                              <div
                                key={attempt.id}
                                className="ae-attempt-row"
                              >
                                <div className="ae-attempt-left">
                                  <div className="ae-attempt-name">
                                    Attempt #{attempt.attemptNumber}
                                  </div>

                                  <div className="ae-attempt-date">
                                    {formatDate(
                                      attempt.submittedAt || attempt.date
                                    )}
                                  </div>
                                </div>

                                <div className="ae-attempt-center">
                                  {percentage}%
                                </div>

                                <div className="ae-attempt-right">
                                  {statusMeta && (
                                    <span
                                      className="ae-status-chip"
                                      style={{
                                        color: statusMeta.color,
                                        background: statusMeta.bg,
                                        border: `1px solid ${statusMeta.border}`,
                                      }}
                                    >
                                      {statusMeta.label}
                                    </span>
                                  )}

                                  <button
                                    className="ae-detail-btn"
                                    onClick={() => handleSelectAttempt(attempt)}
                                  >
                                    View Details
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
