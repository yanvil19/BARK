import React, { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/shared/AdminFacultyDashboard.css';
import PageHeader from '../../components/PageHeader.jsx';
import ExamCalendar from '../../components/ExamCalendar.jsx';

const ProgramChairDashboard = ({ me, onRoute }) => {
  const [pcStats, setPcStats] = useState(null);
  const [pcLoading, setPcLoading] = useState(true);

  useEffect(() => {
    if (!me || me.role !== 'program_chair') return;

    const fetchPcStats = async () => {
      try {
        const [statsRes] = await Promise.all([
          apiAuth('/api/stats/program-chair/stats'),
          apiAuth('/api/questions/approvals?limit=10'),
        ]);

        setPcStats({
          ...statsRes,
          pendingQuestionsCount: statsRes.pendingQuestionsCount ?? 0,
        });
      } catch (err) {
        console.error('❌ FETCH ERROR:', err);
      } finally {
        setPcLoading(false);
      }
    };

    fetchPcStats();
  }, [me?.role]);

  const formatRole = (role) => {
    switch (role) {
      case 'program_chair': return 'Program Chair';
      case 'professor': return 'Professor';
      case 'dean': return 'Dean';
      default: return role;
    }
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const chairProgramId = me?.program?._id || (typeof me?.program === 'string' ? me?.program : '');

  return (
    <main className="dashboard-pc-main">
      <PageHeader
        className="shared-page-header--bleed"
        title={`${greeting}, Program Chair ${me?.firstName || ''}`}
        subtitle={me?.department?.school?.name || me?.department?.name || me?.school?.name || 'School not assigned'}
      />

      {pcLoading ? (
        <div className="pc-loading">Loading dashboard data...</div>
      ) : (
        <>
          {/* Row 1: Student Count, Alumni Count, Approved Questions */}
          <div className="dashboard-pc-top-row">
            <section className="dashboard-box">
              <div className="box-title">Program Student Count</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.programStudentCount ?? 0).toLocaleString()}</h2>
                  <p>{me?.program?.name || pcStats?.programName || 'Program'} Students</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Program Alumni Count</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.programAlumniCount ?? 0).toLocaleString()}</h2>
                  <p>{me?.program?.name || pcStats?.programName || 'Program'} Alumni</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">No. of Approved Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.approvedQuestions ?? 0).toLocaleString()}</h2>
                  <p>Approved Questions</p>
                </div>
              </div>
            </section>
          </div>

          {/* Row 2: Published Exam Count, On-going Exam Count, Pending Questions */}
          <div className="dashboard-pc-stats-row">
            <section className="dashboard-box">
              <div className="box-title">Published Exam Count</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.publishedExamsCount ?? 0).toLocaleString()}</h2>
                  <p>Published Exams in {me?.program?.name || pcStats?.programName || 'Program'}</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">On-going Exam Count</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.ongoingExamsCount ?? 0).toLocaleString()}</h2>
                  <p>On-going Exams in {me?.program?.name || pcStats?.programName || 'Program'}</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Pending Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{(pcStats?.pendingQuestionsCount ?? 0).toLocaleString()}</h2>
                  <p>Pending Questions</p>
                </div>
              </div>
            </section>
          </div>

          {/* Program Exams Month Calendar */}
          <div className="dashboard-pc-calendar-wrapper">
            <ExamCalendar role={me?.role} programId={chairProgramId} />
          </div>

          {/* Questions for Review and Approval */}
          <section className="dashboard-table-section">
            <div className="table-section-header">
              <div>
                <h2>{me?.program?.name || 'Program'} Faculty Submission Overview</h2>
                <p>Summary of questions created and submitted by each professor</p>
              </div>
              <div className="pc-review-header-right">
                <span className="pc-see-all" onClick={() => onRoute('chairQuestionApprovals')}>Review Questions</span>
                <div className="pc-pending-badge">
                  <span className="pc-pending-number">{pcStats?.pendingQuestionsCount ?? 0}</span>
                  <span className="pc-pending-label">Total Pending</span>
                </div>
              </div>
            </div>

            <div className="scroll-x">
              <table className="modern-table">
              <colgroup>
                <col style={{ width: '25%' }} />
                <col style={{ width: '15%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              
              <thead>
                <tr>
                  <th>Creator</th>
                  <th>Role</th>
                  <th>Total Questions</th>
                  <th>Pending Review</th>
                  <th>Recent Submission</th>
                </tr>
              </thead>
              <tbody>
                {(pcStats?.facultyStats || []).length > 0 ? (
                  pcStats.facultyStats.map((stat, i) => (
                    <tr key={i}>
                      <td className="pc-creator-cell">
                        <div className="pc-creator-info">
                          <div className="pc-creator-avatar">
                            {stat.name.charAt(0)}
                          </div>
                          <span className="pc-creator-name">
                            {stat.name} {stat._id === me?._id && <span className="pc-self-tag">(You)</span>}
                          </span>
                        </div>
                      </td>
                      <td className="pc-role-cell">
                        {formatRole(stat.role)}
                      </td>
                      <td className="pc-stat-cell">{stat.totalQuestions}</td>
                      <td className="pc-stat-cell">
                        <span className={`pc-stat-pill ${stat.pendingQuestions > 0 ? 'is-pending' : 'is-clear'}`}>
                          {stat.pendingQuestions}
                        </span>
                      </td>
                      <td className="pc-date-cell">
                        {stat.lastSubmittedAt 
                          ? new Date(stat.lastSubmittedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })
                          : <span className="pc-none-text">No submissions</span>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="pc-empty-state">No faculty submissions found</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            
            <div className="pc-table-notice">
              Overview of faculty activity in {me?.program?.name || 'your program'}.{' '}
              <button className="pc-notice-link" onClick={() => onRoute('chairQuestionApprovals')}>
                Go to Approval Queue →
              </button>
            </div>
          </section>
        </>
      )}
    </main>
  );
};

export default ProgramChairDashboard;
