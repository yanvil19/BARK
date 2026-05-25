import React, { useState, useEffect } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/StudentDashboard.css';
import '../../styles/global.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function isReleased(attempt) {
  if (!attempt.resultReleasedAt) return false;
  return new Date() >= new Date(attempt.resultReleasedAt);
}

function formatDate(date) {
  return new Date(date).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReleaseDate(date) {
  if (!date) return 'TBA';
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'TBA';

  return d.toLocaleString('en-PH', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
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
    case 'passed': return { label: 'Passed', color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', padding: '4px 8px' };
    case 'near_pass': return { label: 'Near pass', color: '#d97706', bg: '#fffbeb', border: '#fde68a', padding: '4px 8px' };
    case 'failed': return { label: 'Failed', color: '#dc2626', bg: '#fef2f2', border: '#fecaca', padding: '3px 10px', borderRadius: '9999px', marginTop: '0.5em' };
    default: return null;
  }
}

function getBarColor(pct) {
  if (pct >= 75) return '#16a34a';
  if (pct >= 50) return '#d97706';
  return '#dc2626';
}

// ─── COUNTDOWN HOOK ───────────────────────────────────────────────────────────

function useCountdown(targetDate) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!targetDate) {
      setTimeLeft('TBA');
      return;
    }

    function compute() {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setTimeLeft(''); return; }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (days > 0) setTimeLeft(`${days}d ${hours}h ${mins}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else setTimeLeft(`${mins}m ${secs}s`);
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatCard({ accentColor, bigLabel, subLabel, subtitle, className = "", subtitleClass = "" }) {
  return (
    <div className={`sd-stat-card ${className}`} style={{ '--sd-accent': accentColor }}>
      <div className="sd-stat-top-bar" />
      <div className="sd-stat-body">
        <div className="sd-stat-big">{bigLabel}</div>
        <div className="sd-stat-label">{subLabel}</div>
        {subtitle && <div className="sd-stat-subtitle">{subtitle}</div>}
      </div>
    </div>
  );
}

function AttemptRow({ attempt, isSelected, onClick }) {
  const released = isReleased(attempt);
  const statusMeta = released ? getStatusMeta(attempt.status) : null;
  const countdown = useCountdown(attempt.resultReleasedAt);
  const duration = formatDuration(attempt.durationMinutes);
  const isClickable = released;

  return (
    <div
      className={[
        'sd-attempt-row',
        !released ? 'sd-attempt-row--pending' : '',
        isSelected ? 'sd-attempt-row--selected' : '',
        isClickable ? 'sd-attempt-row--clickable' : '',
      ].filter(Boolean).join(' ')}
      onClick={isClickable ? onClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (e => e.key === 'Enter' && onClick?.()) : undefined}
    >
      {/* Timeline dot */}
      <div className="sd-attempt-dot-col">
        <span className={`sd-dot${!released ? ' sd-dot--muted' : ''}${isSelected ? ' sd-dot--active' : ''}`} />
      </div>

      {/* Left: date + exam info */}
      <div className="sd-attempt-left">
        <div className="sd-attempt-date">
          {formatDate(attempt.date)}
        </div>

        <div className="sd-attempt-name">
          {attempt.examName}
        </div>


        <div className="sd-attempt-meta">
          {attempt.totalItems} items
          {duration && ` · ${duration}`}
        </div>

        {!released && (
          <div className="sd-attempt-status">
            <span className="sd-pending-badge">
              Pending release
            </span>
          </div>
        )}

      </div>


      {/* Right: score or countdown */}
      <div className="sd-attempt-right">
        {released ? (
          <>
            <div className="sd-score">
              {attempt.rawScore}
              <span className="sd-score-denom">/{attempt.totalScore}</span>
            </div>
            {statusMeta && (
              <span
                className="sd-status-badge"
                style={{
                  color: statusMeta.color,
                  background: statusMeta.bg,
                  border: `1px solid ${statusMeta.border}`,
                  padding: statusMeta.padding,
                  borderRadius: statusMeta.borderRadius || '9999px',
                  marginTop: statusMeta.marginTop || '0',
                }}
              >
                {statusMeta.label}
              </span>
            )}
          </>
        ) : (

          <div className="sd-release-teaser">
            <div className="sd-release-label">Results release in:</div>

            {attempt.resultReleasedAt ? (
              <>
                <div className="sd-release-countdown">
                  {countdown || '—'}
                </div>
                <div className="sd-release-on">
                  {formatReleaseDate(attempt.resultReleasedAt)}
                </div>
              </>
            ) : (
              <>
                <div className="sd-release-countdown">Countdown: TBA</div>
                <div className="sd-release-on">Date and Time: TBA</div>
              </>
            )}
          </div>

        )}
      </div>
    </div>
  );
}

function SubjectBar({ subject }) {
  const pct = Math.round((subject.correct / subject.total) * 100);
  const color = getBarColor(pct);

  return (
    <div className="sd-subject-row">
      <div className="sd-subject-name">{subject.name}</div>
      <div className="sd-subject-bar-track">
        <div
          className="sd-subject-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <div className="sd-subject-pct" style={{ color }}>{pct}%</div>
      <div className="sd-subject-fraction">{subject.correct}/{subject.total}</div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

const StudentDashboard = ({ me, onNavigate }) => {
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  useEffect(() => {
    async function fetchAttempts() {
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/student-exams/my-attempts`);
        const sorted = (data.attempts || []).sort((a, b) => new Date(b.date) - new Date(a.date));
        setAttempts(sorted);

        // Default selection: latest with subject scores
        const released = sorted.filter(isReleased);
        const defaultSelected = released.find(a => a.subjectScores?.length > 0) ?? null;
        setSelectedAttempt(defaultSelected);
      } catch (err) {
        console.error('Failed to load attempts:', err);
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    fetchAttempts();
  }, []);

  const releasedAttempts = attempts.filter(isReleased);
  const totalTaken = attempts.length;
  const passed = releasedAttempts.filter(a => a.status === 'passed').length;
  const toImprove = releasedAttempts.filter(a => a.status !== 'passed').length;

  const scoredAttempts = releasedAttempts.filter(
    a => a.rawScore != null && a.totalScore && a.totalScore > 0
  );

  const totalEarned = scoredAttempts.reduce(
    (sum, a) => sum + a.rawScore,
    0
  );

  const totalPossible = scoredAttempts.reduce(
    (sum, a) => sum + a.totalScore,
    0
  );

  const overallScore =
    totalPossible > 0 ? `${totalEarned}/${totalPossible}` : '—';

  const highestAttempt = scoredAttempts.length
    ? scoredAttempts.reduce((prev, curr) =>
      (curr.rawScore / curr.totalScore) >
        (prev.rawScore / prev.totalScore)
        ? curr
        : prev
    )
    : null;

  const lowestAttempt = scoredAttempts.length
    ? scoredAttempts.reduce((prev, curr) =>
      (curr.rawScore / curr.totalScore) <
        (prev.rawScore / prev.totalScore)
        ? curr
        : prev
    )
    : null;

  // Pagination logic
  const totalPages = Math.ceil(attempts.length / pageSize);
  const paginatedAttempts = attempts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'Student';

  if (loading) return <div className="sd-loading">Loading dashboard...</div>;
  if (error) return <div className="sd-error">{error}</div>;

  return (
    <main className="s-dashboard-container">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="s-dashboard-header">
        <h2>Dashboard</h2>
        <p className="s-dashboard-subtitle">Check your past results and explore!</p>
      </header>

      <div className="sd-body">

        <div className="sd-grid">

          {/* 0 — Exam Breakdown */}
          <div className="sd-grid-item sd-grid-item-0">
            <div className="sd-card">
              <div className="sd-card-header">
                <span className="sd-card-title">Exam breakdown</span>
                {selectedAttempt && (
                  <span className="sd-card-subtitle">
                    · {selectedAttempt.examName}
                  </span>
                )}
              </div>

              <div className="">
                {!selectedAttempt ? (
                  <div className="sd-empty-state">
                    <p className="sd-empty-text">No exam selected.</p>
                    <p className="sd-empty-hint">
                      Click an attempt below.
                    </p>
                  </div>
                ) : !isReleased(selectedAttempt) ? (
                  <div className="sd-empty-state">
                    <p className="sd-empty-text">Results not yet released.</p>
                  </div>
                ) : selectedAttempt.subjectScores?.length === 0 ? (
                  <div className="sd-empty-state">
                    <p className="sd-empty-text">No subject breakdown.</p>
                  </div>
                ) : (
                  <div className="sd-subject-list">

                    <div className="sd-subject-header">
                      <span>Subject</span>
                      <span>Progress</span>
                      <span></span>
                      <span className="sd-header-score">Score</span>
                    </div>

                    <div className="sd-subject-list">
                      {selectedAttempt.subjectScores.map((s, i) => (
                        <SubjectBar key={i} subject={s} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 1 — Exams Taken */}
          <div className="sd-grid-item sd-grid-item-1">
            <StatCard
              div={true}
              className="stat-card-inside"
              accentColor="#35408E"
              bigLabel={totalTaken}
              subLabel="Exams taken"
              subtitle={
                <div className="sd-pill-group">
                  <span className="sd-pill sd-pill-pass">
                    {passed} passed
                  </span>
                  <span className="sd-pill sd-pill-improve">
                    {toImprove} to improve
                  </span>
                </div>
              }

            />
          </div>

          {/* 2 — Average */}
          <div className="sd-grid-item sd-grid-item-2">
            <StatCard
              accentColor="#16a34a"

              bigLabel={overallScore}

              subLabel="Correct/Total Score"
            />
          </div>

          {/* 3 — Highest */}
          <div className="sd-grid-item sd-grid-item-3">
            <StatCard
              accentColor="#d97706"
              bigLabel={
                highestAttempt
                  ? `${highestAttempt.rawScore}/${highestAttempt.totalScore}`
                  : '—'
              }
              subLabel="Highest score"
              subtitle={highestAttempt?.examName ?? '—'}
            />
          </div>

          {/* 4 — Lowest */}
          <div className="sd-grid-item sd-grid-item-4">
            <StatCard
              accentColor="#dc2626"
              bigLabel={
                lowestAttempt
                  ? `${lowestAttempt.rawScore}/${lowestAttempt.totalScore}`
                  : '—'
              }
              subLabel="Lowest score"
              subtitle={lowestAttempt?.examName ?? '—'}
            />
          </div>

          {/* 5 — Chronological Log */}
          <div className="sd-grid-item sd-grid-item-5">
            <div className="sd-card sd-card-chrono">
              <div className="sd-card-header chrono-header">
                <span className="sd-card-title chrono-title">
                  Chronological log of all attempts
                </span>
              </div>

              <div className="sd-card-body">
                {attempts.length === 0 ? (
                  <p className="sd-empty">No attempts yet.</p>
                ) : (
                  <>
                    <div className="sd-timeline-wrapper">
                      <div className="sd-timeline">
                        {paginatedAttempts.map(a => (
                          <AttemptRow
                            key={a.id}
                            attempt={a}
                            isSelected={selectedAttempt?.id === a.id}
                            onClick={() => setSelectedAttempt(a)}
                          />
                        ))}
                      </div>
                    </div>

                    {totalPages > 1 && (
                      <div className="sd-pagination">
                        <button
                          className="sd-pag-btn"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(p => p - 1)}
                        >
                          Previous
                        </button>

                        <span className="sd-pag-info">
                          Page {currentPage} of {totalPages}
                        </span>

                        <button
                          className="sd-pag-btn"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(p => p + 1)}
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
  );
};

export default StudentDashboard;
