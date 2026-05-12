import React, { useState, useEffect } from 'react';
import '../../styles/StudentDashboard.css';

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
// All of this will be replaced with real API calls once the backend endpoint
// GET /api/student-exams/my-attempts is implemented.

const MOCK_ATTEMPTS = [
  {
    id: '1',
    examName: 'Structural Analysis — Set A',
    date: new Date('2025-04-10T09:04:00'),
    totalItems: 60,
    durationMinutes: 134,
    rawScore: 92,
    totalScore: 100,
    status: 'passed',
    subjectScores: [
      { name: 'Structural Analysis', correct: 9,  total: 10 },
      { name: 'Fluid Mechanics',     correct: 11, total: 13 },
      { name: 'Geotech Engineering', correct: 8,  total: 10 },
      { name: 'Engineering Math',    correct: 9,  total: 16 },
      { name: 'Mixed Topics',        correct: 3,  total:  9 },
    ],
    resultReleasedAt: new Date('2025-04-12T09:00:00'),
  },
  {
    id: '2',
    examName: 'Geotechnical Engineering',
    date: new Date('2025-03-22T14:30:00'),
    totalItems: 50,
    durationMinutes: 118,
    rawScore: 84,
    totalScore: 100,
    status: 'passed',
    subjectScores: [],
    resultReleasedAt: new Date('2025-03-24T09:00:00'),
  },
  {
    id: '3',
    examName: 'Engineering Mathematics',
    date: new Date('2025-03-05T10:00:00'),
    totalItems: 80,
    durationMinutes: 180,
    rawScore: 72,
    totalScore: 100,
    status: 'near_pass',
    subjectScores: [],
    resultReleasedAt: new Date('2025-03-07T09:00:00'),
  },
  {
    id: '4',
    examName: 'Mixed Topics',
    date: new Date('2025-02-14T08:00:00'),
    totalItems: 70,
    durationMinutes: 165,
    rawScore: 61,
    totalScore: 100,
    status: 'failed',
    subjectScores: [],
    resultReleasedAt: new Date('2025-02-16T09:00:00'),
  },
  // Demo: unreleased result — far future date keeps countdown visible
  {
    id: '5',
    examName: 'CE Board Exam Set B',
    date: new Date('2026-05-10T09:00:00'),
    totalItems: 100,
    durationMinutes: null,
    rawScore: null,
    totalScore: 100,
    status: null,
    subjectScores: [],
    resultReleasedAt: new Date('2099-06-05T21:00:00'),
  },
];

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
  return new Date(date).toLocaleString('en-PH', {
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
    case 'passed':    return { label: 'Passed',    color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' };
    case 'near_pass': return { label: 'Near pass', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    case 'failed':    return { label: 'Failed',    color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    default:          return null;
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
    function compute() {
      const diff = new Date(targetDate) - new Date();
      if (diff <= 0) { setTimeLeft(''); return; }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000) / 60000);
      const secs  = Math.floor((diff % 60000) / 1000);
      if (days > 0)       setTimeLeft(`${days}d ${hours}h ${mins}m`);
      else if (hours > 0) setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      else                setTimeLeft(`${mins}m ${secs}s`);
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  return timeLeft;
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function StatCard({ accentColor, bigLabel, subLabel, subtitle }) {
  return (
    <div className="sd-stat-card" style={{ '--sd-accent': accentColor }}>
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
  const released   = isReleased(attempt);
  const statusMeta = released ? getStatusMeta(attempt.status) : null;
  const countdown  = useCountdown(attempt.resultReleasedAt);
  const duration   = formatDuration(attempt.durationMinutes);
  const isClickable = released;

  return (
    <div
      className={[
        'sd-attempt-row',
        !released   ? 'sd-attempt-row--pending'  : '',
        isSelected  ? 'sd-attempt-row--selected' : '',
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
          {!released && <span className="sd-pending-badge">Pending release</span>}
        </div>
        <div className="sd-attempt-meta">
          {attempt.totalItems} items
          {duration && ` · ${duration}`}
        </div>
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
                }}
              >
                {statusMeta.label}
              </span>
            )}
          </>
        ) : (
          <div className="sd-release-teaser">
            <div className="sd-release-label">Results release in</div>
            <div className="sd-release-countdown">{countdown || '—'}</div>
            <div className="sd-release-on">
              {formatReleaseDate(attempt.resultReleasedAt)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubjectBar({ subject }) {
  const pct   = Math.round((subject.correct / subject.total) * 100);
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
  const releasedAttempts = MOCK_ATTEMPTS.filter(isReleased);
  const totalTaken = MOCK_ATTEMPTS.length;
  const passed     = releasedAttempts.filter(a => a.status === 'passed').length;
  const toImprove  = releasedAttempts.filter(a => a.status !== 'passed').length;

  const scores    = releasedAttempts.map(a => a.rawScore).filter(s => s != null);
  const avgScore  = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const highScore = scores.length ? Math.max(...scores) : null;
  const lowScore  = scores.length ? Math.min(...scores) : null;

  const highAttempt = releasedAttempts.find(a => a.rawScore === highScore);
  const lowAttempt  = releasedAttempts.find(a => a.rawScore === lowScore);

  // Selected attempt for the right panel — defaults to the latest with subject data
  const defaultSelected = releasedAttempts.find(a => a.subjectScores?.length > 0) ?? null;
  const [selectedAttempt, setSelectedAttempt] = useState(defaultSelected);

  // All attempts newest-first for the log
  const sortedAttempts = [...MOCK_ATTEMPTS].sort((a, b) => new Date(b.date) - new Date(a.date));

  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'Student';

  return (
    <main className="s-dashboard-container">

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header className="s-dashboard-header">
        <h2>Dashboard</h2>
        <p className="s-dashboard-subtitle">Check your past results and explore!</p>
      </header>

      <div className="sd-body">

        {/* ── STAT CARDS ─────────────────────────────────────────── */}
        <div className="sd-stats-row">
          <StatCard
            accentColor="#35408E"
            bigLabel={totalTaken}
            subLabel="Exams taken"
            subtitle={`${passed} passed · ${toImprove} to improve`}
          />
          <StatCard
            accentColor="#16a34a"
            bigLabel={avgScore != null ? `${avgScore}/100` : '—/100'}
            subLabel="Average score"
            subtitle="Across all exams"
          />
          <StatCard
            accentColor="#d97706"
            bigLabel={highScore != null ? `${highScore}/100` : '—/100'}
            subLabel="Highest score"
            subtitle={highAttempt?.examName ?? '—'}
          />
          <StatCard
            accentColor="#dc2626"
            bigLabel={lowScore != null ? `${lowScore}/100` : '—/100'}
            subLabel="Lowest score"
            subtitle={lowAttempt?.examName ?? '—'}
          />
        </div>

        {/* ── BOTTOM GRID ────────────────────────────────────────── */}
        <div className="sd-bottom-grid">

          {/* LEFT — Attempt Log */}
          <div className="sd-card">
            <div className="sd-card-header">
              <span className="sd-card-title">Chronological log of all attempts</span>
            </div>
            <div className="sd-card-body">
              {sortedAttempts.length === 0 ? (
                <p className="sd-empty">No attempts yet.</p>
              ) : (
                <div className="sd-timeline">
                  {sortedAttempts.map(a => (
                    <AttemptRow
                      key={a.id}
                      attempt={a}
                      isSelected={selectedAttempt?.id === a.id}
                      onClick={() => setSelectedAttempt(a)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — Selected Exam Subject Breakdown */}
          <div className="sd-card">
            <div className="sd-card-header">
              <span className="sd-card-title">Exam breakdown</span>
              {selectedAttempt && (
                <span className="sd-card-subtitle">
                  · {selectedAttempt.examName}
                </span>
              )}
            </div>
            <div className="sd-card-body">
              {!selectedAttempt ? (
                <div className="sd-empty-state">
                  <p className="sd-empty-text">No exam selected.</p>
                  <p className="sd-empty-hint">Click an attempt from the log to view its breakdown.</p>
                </div>
              ) : !isReleased(selectedAttempt) ? (
                <div className="sd-empty-state">
                  <p className="sd-empty-text">Results not yet released.</p>
                  <p className="sd-empty-hint">The Dean hasn't released results for this exam yet.</p>
                </div>
              ) : selectedAttempt.subjectScores?.length === 0 ? (
                <div className="sd-empty-state">
                  <p className="sd-empty-text">No subject breakdown for this exam.</p>
                  <p className="sd-empty-hint">Subject-level data wasn't recorded for this attempt.</p>
                </div>
              ) : (
                <div className="sd-subject-list">
                  {selectedAttempt.subjectScores.map((s, i) => (
                    <SubjectBar key={i} subject={s} />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </main>
  );
};

export default StudentDashboard;
