import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/AvailableExams.css';
import '../../styles/StudentExamResults.css';
import PageHeader from '../../components/PageHeader.jsx';

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ca-search"
          placeholder="Search exam results..."
          aria-label="Search exam results"
        />
      </div>

      <div className="ser-page-content-wrapper">
        {selectedAttempt ? (
          <div className="ser-detail-view">
            <div className="ser-detail-toolbar">
              <button className="ser-back-btn" onClick={() => setSelectedAttempt(null)}>
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
                {filteredAttempts.map((attempt) => {
                  const statusMeta = getStatusMeta(attempt.status);
                  const duration = formatDuration(attempt.durationMinutes);
                  const percentage = getAttemptPercentage(attempt);

                  return (
                    <article key={attempt.id} className="ae-card ae-card--normal ser-result-card">
                      <div className="ae-card-body ser-result-card-body">
                        <div className="ser-result-card-top">
                          <div className="ser-result-heading">
                            <h3 className="ae-title ser-result-title">{attempt.examName}</h3>
                            <div className="ae-subtitle ser-result-date">
                              Attempt {attempt.attemptNumber} - {formatDate(attempt.submittedAt || attempt.date)}
                            </div>
                          </div>

                          {statusMeta && (
                            <span
                              className="ser-result-status"
                              style={{
                                background: statusMeta.bg,
                                color: statusMeta.color,
                                border: `1px solid ${statusMeta.border}`,
                              }}
                            >
                              {statusMeta.label}
                            </span>
                          )}
                        </div>

                        <div className="ser-result-stats">
                          <div className="ser-result-stat">
                            <span className="ser-result-stat-label">Score</span>
                            <span className="ser-result-stat-value">{attempt.rawScore}/{attempt.totalScore}</span>
                          </div>
                          <div className="ser-result-stat">
                            <span className="ser-result-stat-label">Accuracy</span>
                            <span className="ser-result-stat-value">{percentage}%</span>
                          </div>
                          <div className="ser-result-stat">
                            <span className="ser-result-stat-label">Duration</span>
                            <span className="ser-result-stat-value">{duration || '--'}</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="ae-btn ae-btn--normal ser-result-btn"
                        onClick={() => setSelectedAttempt(attempt)}
                      >
                        View Result Details
                      </button>
                    </article>
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
