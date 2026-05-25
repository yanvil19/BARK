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

const ResultDetailsModal = ({ exam, onClose, subjectScores }) => {
  if (!exam) return null;

  const avgScore = subjectScores?.length > 0
    ? Math.round(subjectScores.reduce((acc, s) => acc + (s.correct / s.total) * 100, 0) / subjectScores.length)
    : 0;

  return (
    <div className="ser-modal-overlay" onClick={onClose}>
      <div className="ser-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="ser-modal-header">
          <h2>{exam.examName} - Results</h2>
          <button className="ser-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="ser-modal-body">
          <div className="ser-results-summary">
            <div className="ser-summary-item">
              <div className="ser-summary-label">Score</div>
              <div className="ser-summary-value">
                {exam.rawScore}/{exam.totalScore}
              </div>
            </div>
            <div className="ser-summary-item">
              <div className="ser-summary-label">Percentage</div>
              <div className="ser-summary-value">
                {exam.totalScore > 0 ? Math.round((exam.rawScore / exam.totalScore) * 100) : 0}%
              </div>
            </div>
            <div className="ser-summary-item">
              <div className="ser-summary-label">Status</div>
              {getStatusMeta(exam.status) && (
                <span
                  style={{
                    color: getStatusMeta(exam.status).color,
                    background: getStatusMeta(exam.status).bg,
                    border: `1px solid ${getStatusMeta(exam.status).border}`,
                    padding: '4px 8px',
                    borderRadius: '9999px',
                    fontSize: '13px',
                    fontWeight: '600'
                  }}
                >
                  {getStatusMeta(exam.status).label}
                </span>
              )}
            </div>
            <div className="ser-summary-item">
              <div className="ser-summary-label">Date</div>
              <div className="ser-summary-value">{formatDate(exam.date)}</div>
            </div>
          </div>

          {subjectScores && subjectScores.length > 0 && (
            <div className="ser-breakdown-section">
              <h3>Score Breakdown by Subject</h3>
              <div className="ser-subject-list">
                <div className="ser-subject-header">
                  <span>Subject</span>
                  <span>Progress</span>
                  <span></span>
                  <span className="ser-header-score">Score</span>
                </div>
                <div>
                  {subjectScores.map((s, i) => (
                    <SubjectBar key={i} subject={s} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="ser-modal-footer">
          <button className="ser-btn-close" onClick={onClose}>Close</button>
        </div>
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

      <ResultDetailsModal
        exam={selectedAttempt}
        subjectScores={selectedAttempt?.subjectScores}
        onClose={() => setSelectedAttempt(null)}
      />
    </main>
  );
};

export default StudentExamResults;
