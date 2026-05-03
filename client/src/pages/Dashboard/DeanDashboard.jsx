import React, { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/Dashboard.css';

const DeanDashboard = ({ me }) => {
  const [deanStats, setDeanStats] = useState(null);
  const [deanLoading, setDeanLoading] = useState(true);

  useEffect(() => {
    if (me?.role !== 'dean') return;
    let cancelled = false;
    setDeanLoading(true);

    (async () => {
      try {
        const data = await apiAuth('/api/stats/dean/dashboard');
        if (!cancelled) setDeanStats(data);
      } catch (err) {
        console.error('Failed to load dean dashboard data:', err.message);
      } finally {
        if (!cancelled) setDeanLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [me]);

  const formatAuditAction = (action = '') => action.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());

  const overview = deanStats?.programOverview || [];
  const coverage = deanStats?.subjectCoverage || [];
  const attentionItems = deanStats?.attentionItems || [];
  const recentActivity = deanStats?.recentActivity || [];

  return (
    <main className="dashboard-pc-main">
      <header className="dashboard-pc-header">
        <h1>Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 18 ? 'Afternoon' : 'Evening'}, Dean {me.firstName}</h1>
        <p>{deanStats?.department?.name || me.department?.name || 'Department not assigned'}</p>
      </header>

      {deanLoading ? (
        <div className="pc-loading">Loading dashboard data...</div>
      ) : (
        <>
          <div className="dashboard-pc-stats-row">
            <section className="dashboard-box">
              <div className="box-title">Approved Questions Available</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-yellow">
                  <h2>{(deanStats?.summary?.totalApprovedQuestions || 0).toLocaleString()}</h2>
                  <p>Question bank ready for exams</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Exams Published</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{deanStats?.summary?.examsPublished ?? 0}</h2>
                  <p>Total published mock board exams</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Pending Users</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{deanStats?.summary?.pendingRegistrations ?? 0}</h2>
                  <p>Student registrations awaiting approval</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Returned Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{deanStats?.summary?.returnedQuestions ?? 0}</h2>
                  <p>Your questions returned for revision</p>
                </div>
              </div>
            </section>
          </div>

          <section className="dashboard-box dashboard-pc-subject-box">
            <div className="box-title">Attention Needed</div>
            <div className="pc-subject-grid">
              {attentionItems.length > 0 ? (
                attentionItems.map((item) => (
                  <div
                    key={item.key}
                    className="metric-card pc-subject-card"
                    style={{ borderTopColor: item.tone === 'warning' ? '#f5a623' : '#2b3980' }}
                  >
                    <h2 style={{ color: item.tone === 'warning' ? '#f5a623' : '#2b3980', fontSize: '2.8rem' }}>
                      {item.label.split(' ')[0]}
                    </h2>
                    <p>{item.label}</p>
                  </div>
                ))
              ) : (
                <div className="metric-card metric-card-blue" style={{ gridColumn: '1 / -1' }}>
                  <h2>0</h2>
                  <p>No urgent dean actions right now</p>
                </div>
              )}
            </div>

            <div className="pc-summary">
              <h3>Subject Coverage</h3>
              {coverage.length === 0 ? (
                <p>No subject coverage data available yet.</p>
              ) : (
                <p>
                  Lowest approved-question coverage subjects:{' '}
                  {coverage.map((subject) => `${subject.name} (${subject.approvedQuestions})`).join(', ')}.
                </p>
              )}
            </div>
          </section>

          <section className="dashboard-table-section">
            <div className="table-section-header">
              <div>
                <h2>Program Coverage</h2>
                <p>Approved questions, subjects, and exam status per program</p>
              </div>
            </div>

            <div className="table-scroll-mobile">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Students</th>
                    <th>Approved Questions</th>
                    <th>Subjects</th>
                    <th>Published Exams</th>
                    <th>Draft Exams</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.length > 0 ? (
                    overview.map((program) => (
                      <tr key={program.programId}>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: '600', color: 'var(--primary-bg)' }}>{program.programName}</span>
                            <span style={{ fontSize: '11px', color: '#888' }}>{program.programCode}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>{program.students}</td>
                        <td style={{ textAlign: 'center' }}>{program.approvedQuestions}</td>
                        <td style={{ textAlign: 'center' }}>{program.subjects}</td>
                        <td style={{ textAlign: 'center' }}>{program.publishedExams}</td>
                        <td style={{ textAlign: 'center' }}>{program.draftExams}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" className="pc-empty-state">No program coverage data found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </section>

          <section className="dashboard-table-section">
            <div className="table-section-header">
              <div>
                <h2>Recent Activity</h2>
                <p>Your latest dean-side actions and decisions</p>
              </div>
            </div>

            <div className="table-scroll-mobile">
              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Details</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentActivity.length > 0 ? (
                    recentActivity.map((log) => (
                      <tr key={log._id}>
                        <td style={{ textAlign: 'center' }}>
                          <span className="pill" style={{ background: '#f0f4ff', color: '#1a43bf', textTransform: 'capitalize', fontSize: '12px' }}>
                            {formatAuditAction(log.action)}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>{log.targetType}</td>
                        <td style={{ textAlign: 'center' }}>
                          {log.details?.userEmail || log.details?.reason || log.details?.name || '-'}
                        </td>
                        <td style={{ fontSize: '12px', color: '#666' }}>
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="pc-empty-state">No recent dean activity found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

          </section>
        </>
      )}
    </main>
  );
};

export default DeanDashboard;
