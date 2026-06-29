import React, { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/Dashboard.css';
import PageHeader from '../../components/PageHeader.jsx';

const ProfessorDashboard = ({ me }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me || me.role !== 'professor') return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiAuth('/api/stats/professor/dashboard');
        if (!cancelled) setStats(res);
      } catch (err) {
        if (!cancelled) setError(err?.data?.message || err?.message || 'Failed to load dashboard');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [me?.role]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  const summary = stats?.summary || {};

  const attentionText = useMemo(() => {
    const returned = Number(summary.returned) || 0;
    const drafts = Number(summary.draft) || 0;
    const pending = Number(summary.pending) || 0;

    if (returned > 0) return `You have ${returned} returned question${returned === 1 ? '' : 's'} to revise.`;
    if (drafts > 0) return `You have ${drafts} draft question${drafts === 1 ? '' : 's'} you can finish and submit.`;
    if (pending > 0) return `${pending} question${pending === 1 ? ' is' : 's are'} pending review.`;
    return 'No immediate actions needed.';
  }, [summary.draft, summary.pending, summary.returned]);

  return (
    <main className="dashboard-pc-main">
      <PageHeader
        className="shared-page-header--bleed"
        title={`${greeting}, Professor ${me?.firstName || ''}`}
        subtitle={me?.department?.name || 'Department not assigned'}
      />

      {loading ? (
        <div className="pc-loading">Loading dashboard data...</div>
      ) : error ? (
        <div className="pc-loading">{error}</div>
      ) : (
        <>
          {/* Row 1 */}
          <div className="dashboard-pc-top-row">
            <section className="dashboard-box">
              <div className="box-title">Program Student Count</div>
              <div className="box-content-grid-2">
                <div className="metric-card metric-card-blue student-count-card">
                  <h2>{Number(stats?.programStudentCount || 0).toLocaleString()}</h2>
                  <p>{stats?.program?.programName || 'Your Program'}</p>
                </div>
              </div>
            </section>

            <div className="dashboard-box">
              <div className="box-title">No. of Approved Questions</div>
              <div className="question-count-card">
                <h2>{Number(summary.approved || 0).toLocaleString()}</h2>
                <p>Approved Questions</p>
              </div>
            </div>
          </div>

          {/* Row 2 */}
          <div className="dashboard-pc-stats-row">
            <section className="dashboard-box">
              <div className="box-title">Draft Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{summary.draft ?? '—'}</h2>
                  <p>Unsubmitted drafts</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Returned Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{summary.returned ?? '—'}</h2>
                  <p>Needs revision</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Pending Review</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{summary.pending ?? '—'}</h2>
                  <p>Awaiting chair review</p>
                </div>
              </div>
            </section>
          </div>

          {/* Tag Summary (layout reuse) */}
          <section className="dashboard-box dashboard-pc-subject-box">
            <div className="box-title">Your Question Coverage</div>
            <div className="pc-subject-grid">
              {(stats?.tagSummary || []).length > 0 ? (
                stats.tagSummary.map((t) => (
                  <div key={String(t.tagId)} className="metric-card pc-subject-card" style={{ borderTopColor: '#2b3980' }}>
                    <h2 style={{ color: '#2b3980' }}>{t.count}</h2>
                    <p>{t.name || 'Tag'}</p>
                  </div>
                ))
              ) : (
                <div className="metric-card metric-card-blue student-count-card">
                  <h2>—</h2>
                  <p>No tagged questions yet</p>
                </div>
              )}
            </div>
            <div className="pc-summary">
              <h3>Summary</h3>
              <p>{attentionText}</p>
            </div>
          </section>

          {/* Recent activity */}
          <section className="dashboard-table-section">
            <div className="table-section-header">
              <div>
                <h2>Recent Activity</h2>
                <p>Your most recently updated questions</p>
              </div>
            </div>

            <table className="modern-table">
              <colgroup>
                <col style={{ width: '55%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                {(stats?.recentQuestions || []).length > 0 ? (
                  stats.recentQuestions.map((q) => (
                    <tr key={String(q._id)}>
                      <td>{q.title || 'Untitled'}</td>
                      <td className="pc-role-cell">{q.state || '—'}</td>
                      <td className="pc-date-cell">
                        {q.updatedAt
                          ? new Date(q.updatedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" className="pc-empty-state">
                      No questions yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
};

export default ProfessorDashboard;
