import React, { useEffect, useState, useMemo, memo } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/AvailableExams.css';
import '../../styles/StudentExamResults.css';

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
    case 'passed': return { label: 'Passed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
    case 'near_pass': return { label: 'Near pass', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'failed': return { label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    default: return null;
  }
}

function getBarColor(pct) {
  if (pct >= 75) return '#16a34a';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
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

const SubjectBar = memo(({ subject }) => {
  const pct = Math.round((subject.correct / subject.total) * 100);
  const color = getBarColor(pct);

  return (
    <div className="ser-subject-row">
      <div className="ser-subject-name">{subject.name}</div>
      <div className="ser-subject-bar-track">
        <div
          className="ser-subject-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="ser-subject-pct" style={{ color }}>{pct}%</div>
      <div className="ser-subject-fraction">{subject.correct}/{subject.total}</div>
    </div>
  );
});

const getStatusClass = (avg, threshold) => {
  if (avg >= threshold) return 'green';
  if (avg >= threshold * 0.7) return 'orange';
  return 'red';
};

const CircularProgress = ({ percentage, threshold }) => {
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="ser-circular-container">
      <svg className="ser-circular-svg">
        <circle className="ser-circular-bg" cx="90" cy="90" r={radius} />
        <circle 
          className="ser-circular-fill" 
          cx="90" 
          cy="90" 
          r={radius} 
          style={{ 
            strokeDasharray: circumference, 
            strokeDashoffset: offset 
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
};

const StudentExamResults = () => {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState(null);

  useEffect(() => {
    async function fetchAttempts() {
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/student-exams/my-attempts`);
        const sorted = (data.attempts || [])
          .filter(a => a.status !== 'pending')
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setAttempts(sorted);
      } catch (err) {
        console.error('Failed to load attempts:', err);
        setAttempts([]);
      } finally {
        setLoading(false);
      }
    }
    fetchAttempts();
  }, []);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((exam) =>
      String(exam?.examName || '').toLowerCase().includes(q)
    );
  }, [attempts, search]);

  const hasResults = filteredAttempts.length > 0;

  return (
    <main className="sae-page-container">
      <header className="sae-page-header">
        <h2>Exam Results</h2>
        <p className="sae-header-subtitle">View your completed exam results and performance breakdown</p>
      </header>

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
          <>
            <div style={{ marginBottom: '16px', marginTop: '24px' }}>
              <button className="ser-back-btn" onClick={() => setSelectedAttempt(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back to Results
              </button>
            </div>

            {/* Exam Specific Header */}
            <div className="ser-report-header" style={{ marginBottom: '24px' }}>
              <h2 style={{ margin: 0, fontSize: '26px', fontWeight: '800', color: '#1e2d6b' }}>{selectedAttempt.examName}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '14px', color: '#8c96ae' }}>Date Taken: {formatDate(selectedAttempt.date)}</span>
                <span style={{ color: '#cbd5e1' }}>|</span>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#35408e', background: '#f0f4ff', padding: '4px 12px', borderRadius: '6px' }}>
                  Threshold: {selectedAttempt.passingThreshold || 70}%
                </div>
              </div>
            </div>

            {/* Hero Card */}
            <section className="ser-hero-card">
              <CircularProgress 
                percentage={selectedAttempt.totalScore > 0 ? Math.round((selectedAttempt.rawScore / selectedAttempt.totalScore) * 100) : 0} 
                threshold={selectedAttempt.passingThreshold || 70} 
              />
              <div className="ser-hero-metrics">
                <div className="ser-metric-item">
                  <span className="m-value">
                    {selectedAttempt.totalScore > 0 ? Math.round((selectedAttempt.rawScore / selectedAttempt.totalScore) * 100) : 0}%
                  </span>
                  <span className="m-label">Avg Score</span>
                </div>
                <div className="ser-metric-item">
                  <span className="m-value">{selectedAttempt.rawScore} / {selectedAttempt.totalScore}</span>
                  <span className="m-label">Raw Score</span>
                </div>
                <div className="ser-metric-item">
                  <span className="m-value">
                    {new Date(selectedAttempt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className="m-label">Date Conducted</span>
                </div>
              </div>
            </section>

            {/* Breakdown Card */}
            {selectedAttempt.subjectScores && selectedAttempt.subjectScores.length > 0 && (
              <section className="ser-breakdown-card">
                <div className="ser-breakdown-header">
                  <h2>Score Breakdown by Topic</h2>
                  <p>Performance across each subject area in this exam</p>
                </div>
                <div className="ser-topic-list">
                  {selectedAttempt.subjectScores.map((subject, idx) => {
                    const pct = subject.total > 0 ? Math.round((subject.correct / subject.total) * 100) : 0;
                    const status = getStatusClass(pct, selectedAttempt.passingThreshold || 70);
                    return (
                      <div key={idx} className="ser-topic-row">
                        <div className={`ser-topic-name status-${status}`}>{subject.name}</div>
                        <div className="ser-topic-bar-bg">
                          <div 
                            className={`ser-topic-bar-fill bg-${status}`} 
                            style={{ width: `${pct}%` }} 
                          />
                        </div>
                        <div className={`ser-topic-pct status-${status}`}>{pct}%</div>
                        <div className="ser-topic-fraction">{subject.correct}/{subject.total}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            {loading && (
              <section className="ae-grid" aria-label="Loading exams">
                {[0, 1, 2].map((i) => (
                  <SkeletonCard key={i} />
                ))}
              </section>
            )}

            {!loading && attempts.length === 0 && (
              <div className="ae-empty" role="status">
                No exam results available yet.
              </div>
            )}

            {!loading && attempts.length > 0 && !hasResults && (
              <div className="ae-empty" role="status">
                No results found matching your search.
              </div>
            )}

            {!loading && hasResults && (
              <section className="ae-grid" aria-label="Exam results">
                {filteredAttempts.map((attempt) => {
                  const statusMeta = getStatusMeta(attempt.status);
                  const duration = formatDuration(attempt.durationMinutes);
                  const percentage = attempt.totalScore > 0
                    ? Math.round((attempt.rawScore / attempt.totalScore) * 100)
                    : 0;

                  return (
                    <article key={attempt.id} className="ae-card ae-card--normal">
                      <div className="ae-card-body">
                        <h3 className="ae-title">{attempt.examName}</h3>
                        <div className="ae-subtitle">{formatDate(attempt.date)}</div>

                        <div className="ae-pills">
                          <div className="ae-pill" title="Score">
                            <span>
                              {attempt.rawScore}/{attempt.totalScore}
                              ({percentage}%)
                            </span>
                          </div>
                          {duration && (
                            <div className="ae-pill" title="Duration">
                              <span>{duration}</span>
                            </div>
                          )}
                          {statusMeta && (
                            <div
                              className="ae-pill"
                              style={{
                                background: statusMeta.bg,
                                color: statusMeta.color,
                                border: `1px solid ${statusMeta.border}`,
                              }}
                            >
                              <span>{statusMeta.label}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="ae-btn ae-btn--normal"
                        onClick={() => setSelectedAttempt(attempt)}
                      >
                        View Result Details →
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
};

export default StudentExamResults;
