import React, { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { apiAuth } from '../../lib/api.js';
import '../../styles/alumni/AlumniDashboard.css';
import '../../styles/global.css';

const BASE = import.meta.env.VITE_API_URL;

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getScorePercent(attempt) {
  const total = Number(attempt?.totalScore || attempt?.totalItems || 0);
  const raw = Number(attempt?.rawScore || 0);
  return total > 0 ? Math.round((raw / total) * 100) : 0;
}

function getScoreText(attempt) {
  if (!attempt || attempt.rawScore == null) return 'No score';
  const total = attempt.totalScore || attempt.totalItems || 0;
  return `${attempt.rawScore}/${total}`;
}

function getAttemptStatus(attempt) {
  if (attempt?.status === 'passed' || attempt?.passed === true) return 'Passed';
  if (attempt?.status === 'near_pass') return 'Near pass';
  if (attempt?.status === 'failed' || attempt?.passed === false) return 'Needs review';
  return 'Completed';
}

function normalizeSubjectScore(subject) {
  const correct = Number(subject?.correct || 0);
  const total = Number(subject?.total || 0);

  return {
    name: subject?.name || 'Untitled subject',
    correct,
    total,
    percentage: total > 0 ? Math.round((correct / total) * 100) : 0,
  };
}

function StatCard({ label, value, detail }) {
  return (
    <article className="ad-stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <p>{detail}</p>}
    </article>
  );
}

function SubjectRow({ subject }) {
  return (
    <div className="ad-subject-row">
      <div className="ad-subject-top">
        <strong>{subject.name}</strong>
        <span>{subject.correct}/{subject.total}</span>
      </div>
      <div className="ad-progress-track" aria-hidden="true">
        <div className="ad-progress-fill" style={{ width: `${subject.percentage}%` }} />
      </div>
      <small>{subject.percentage}% mastery</small>
    </div>
  );
}

function AttemptCard({ attempt, active, onSelect }) {
  const percent = getScorePercent(attempt);
  const status = getAttemptStatus(attempt);

  return (
    <button
      type="button"
      className={`ad-attempt-card${active ? ' active' : ''}`}
      onClick={onSelect}
    >
      <div>
        <strong>{attempt.examName}</strong>
        <span>{formatDate(attempt.date || attempt.submittedAt)}</span>
      </div>
      <div className="ad-attempt-score">
        <span>{getScoreText(attempt)}</span>
        <small>{percent}%</small>
      </div>
      <span className={`ad-status-pill ${status.toLowerCase().replace(/\s+/g, '-')}`}>
        {status}
      </span>
    </button>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="ad-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

const AlumniDashboard = ({ me, onNavigate }) => {
  const [attempts, setAttempts] = useState([]);
  const [selectedAttempt, setSelectedAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  useEffect(() => {
    let alive = true;

    async function fetchAttempts() {
      setLoading(true);
      setError('');

      try {
        const data = await apiAuth(`${BASE}/api/alumni-exams/my-attempts`);
        const sorted = (data.attempts || [])
          .filter((attempt) => attempt.examName && attempt.examName !== 'Unknown Exam')
          .sort((a, b) => new Date(b.date || b.submittedAt || 0) - new Date(a.date || a.submittedAt || 0));

        if (!alive) return;
        setAttempts(sorted);
        setSelectedAttempt(sorted[0] || null);
      } catch (err) {
        if (!alive) return;
        console.error('Failed to load alumni dashboard:', err);
        setError(err.message || 'Failed to load dashboard data.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchAttempts();

    return () => {
      alive = false;
    };
  }, []);

  const summary = useMemo(() => {
    const scored = attempts.filter((attempt) => Number(attempt.totalScore || attempt.totalItems || 0) > 0 && attempt.rawScore != null);
    const best = scored.length
      ? scored.reduce((bestAttempt, attempt) => (
        getScorePercent(attempt) > getScorePercent(bestAttempt) ? attempt : bestAttempt
      ))
      : null;

    const latest = attempts[0] || null;
    const totalPercent = scored.reduce((sum, attempt) => sum + getScorePercent(attempt), 0);
    const average = scored.length ? Math.round(totalPercent / scored.length) : 0;
    const passed = attempts.filter((attempt) => getAttemptStatus(attempt) === 'Passed').length;

    const subjects = new Map();
    attempts.forEach((attempt) => {
      (attempt.subjectScores || []).forEach((item) => {
        const subject = normalizeSubjectScore(item);
        const current = subjects.get(subject.name) || { name: subject.name, correct: 0, total: 0 };
        current.correct += subject.correct;
        current.total += subject.total;
        subjects.set(subject.name, current);
      });
    });

    const subjectScores = Array.from(subjects.values())
      .map(normalizeSubjectScore)
      .filter((subject) => subject.total > 0)
      .sort((a, b) => b.percentage - a.percentage);

    return {
      totalAttempts: attempts.length,
      best,
      latest,
      average,
      passed,
      subjectScores,
    };
  }, [attempts]);

  const selectedSubjects = (selectedAttempt?.subjectScores || [])
    .map(normalizeSubjectScore)
    .filter((subject) => subject.total > 0)
    .sort((a, b) => b.percentage - a.percentage);

  const firstName = me?.firstName || me?.name?.split(' ')[0] || 'Alumni';
  const programName = me?.program?.name || 'Program not assigned';
  const departmentName = me?.department?.name || 'Department';

  if (loading) {
    return (
      <main className="ad-page">
        <PageHeader
          className="shared-page-header--bleed-lr"
          title={`${greeting}, ${firstName}`}
          subtitle={`${programName} - ${departmentName}`}
        />
        <div className="ad-loading">Loading dashboard...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ad-page">
        <PageHeader
          className="shared-page-header--bleed-lr"
          title={`${greeting}, ${firstName}`}
          subtitle={`${programName} - ${departmentName}`}
        />
        <div className="ad-error">{error}</div>
      </main>
    );
  }

  return (
    <main className="ad-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title={`${greeting}, ${firstName}`}
        subtitle={`${programName} - ${departmentName}`}
      />

      <section className="ad-shell">
        <div className="ad-hero-card">
          <div>
            <span className="ad-eyebrow">Alumni board exam dashboard</span>
            <h2>Your exam activity at a glance</h2>
            <p>
              Review your latest alumni exam attempts, strongest subjects, and score progress from released exam data.
            </p>
          </div>
          <div className="ad-hero-actions">
            <button type="button" onClick={() => onNavigate?.('alumniAvailableExams')}>
              Available Exams
            </button>
            <button type="button" onClick={() => onNavigate?.('alumniExamResults')}>
              Exam Results
            </button>
          </div>
        </div>

        <div className="ad-stats-grid">
          <StatCard
            label="Attempts"
            value={summary.totalAttempts}
            detail="Completed alumni exam attempts"
          />
          <StatCard
            label="Latest Score"
            value={summary.latest ? getScoreText(summary.latest) : 'No score'}
            detail={summary.latest ? summary.latest.examName : 'No attempt yet'}
          />
          <StatCard
            label="Highest Score"
            value={summary.best ? getScoreText(summary.best) : 'No score'}
            detail={summary.best ? summary.best.examName : 'No scored attempt'}
          />
          <StatCard
            label="Average"
            value={`${summary.average}%`}
            detail={`${summary.passed} passed attempt${summary.passed === 1 ? '' : 's'}`}
          />
        </div>

        <div className="ad-main-grid">
          <section className="ad-card ad-focus-card">
            <div className="ad-card-header">
              <div>
                <span className="ad-eyebrow">Selected attempt</span>
                <h3>{selectedAttempt?.examName || 'No attempt selected'}</h3>
              </div>
              {selectedAttempt && (
                <span className={`ad-status-pill ${getAttemptStatus(selectedAttempt).toLowerCase().replace(/\s+/g, '-')}`}>
                  {getAttemptStatus(selectedAttempt)}
                </span>
              )}
            </div>

            {selectedAttempt ? (
              <>
                <div className="ad-score-panel">
                  <div className="ad-score-ring" style={{ '--ad-score': `${getScorePercent(selectedAttempt)}%` }}>
                    <strong>{getScorePercent(selectedAttempt)}%</strong>
                    <span>{getScoreText(selectedAttempt)}</span>
                  </div>
                  <div className="ad-score-details">
                    <div>
                      <span>Date answered</span>
                      <strong>{formatDate(selectedAttempt.date || selectedAttempt.submittedAt)}</strong>
                    </div>
                    <div>
                      <span>Total items</span>
                      <strong>{selectedAttempt.totalScore || selectedAttempt.totalItems || 0}</strong>
                    </div>
                    <div>
                      <span>Passing mark</span>
                      <strong>{selectedAttempt.passingThreshold ? `${selectedAttempt.passingThreshold}%` : 'Not set'}</strong>
                    </div>
                  </div>
                </div>

                <div className="ad-section-head">
                  <h4>Subject breakdown</h4>
                  <span>{selectedSubjects.length} subject{selectedSubjects.length === 1 ? '' : 's'}</span>
                </div>
                {selectedSubjects.length ? (
                  <div className="ad-subject-list">
                    {selectedSubjects.map((subject) => (
                      <SubjectRow key={subject.name} subject={subject} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    title="No subject data"
                    detail="This attempt does not include a subject-level breakdown."
                  />
                )}
              </>
            ) : (
              <EmptyState
                title="No attempts yet"
                detail="Once you answer an ongoing alumni exam, your dashboard will show your activity here."
              />
            )}
          </section>

          <aside className="ad-card ad-overview-card">
            <div className="ad-card-header">
              <div>
                <span className="ad-eyebrow">Overall subjects</span>
                <h3>Where you stand</h3>
              </div>
            </div>

            {summary.subjectScores.length ? (
              <div className="ad-subject-list compact">
                {summary.subjectScores.slice(0, 6).map((subject) => (
                  <SubjectRow key={subject.name} subject={subject} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No overall breakdown"
                detail="Subject performance will appear after attempts with breakdown data are recorded."
              />
            )}
          </aside>
        </div>

        <section className="ad-card">
          <div className="ad-card-header">
            <div>
              <span className="ad-eyebrow">Recent attempts</span>
              <h3>Exam history</h3>
            </div>
            <button type="button" className="ad-text-button" onClick={() => onNavigate?.('alumniExamResults')}>
              View results
            </button>
          </div>

          {attempts.length ? (
            <div className="ad-attempt-grid">
              {attempts.slice(0, 8).map((attempt) => (
                <AttemptCard
                  key={attempt.id}
                  attempt={attempt}
                  active={selectedAttempt?.id === attempt.id}
                  onSelect={() => setSelectedAttempt(attempt)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No exam history"
              detail="Published exams can be viewed any time, while only on-going exams can be answered."
            />
          )}
        </section>
      </section>
    </main>
  );
};

export default AlumniDashboard;
