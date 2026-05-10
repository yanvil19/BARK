import React, { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/Dashboard.css';

const ProgramChairDashboard = ({ me, onRoute }) => {
  const [pcStats, setPcStats] = useState(null);
  const [pcLoading, setPcLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectDetails, setSubjectDetails] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!me || me.role !== 'program_chair') return;

    const fetchPcStats = async () => {
      try {
        const [statsRes, pendingRes] = await Promise.all([
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

  useEffect(() => {
    if (me?.role !== 'program_chair') return;
    if (!pcStats?.subjectSuccessRates) return;
    
    const fetchAiSummary = async () => {
      setAiLoading(true);
      try {
        const res = await apiAuth('/api/program-chair/ai-summary', {
          method: 'POST',
          body: JSON.stringify({ subjectRates: pcStats.subjectSuccessRates }),
        });
        setAiSummary(res.summary || '');
      } catch (err) {
        console.error('Failed to generate AI summary:', err.message);
        setAiSummary('Summary could not be generated at this time.');
      } finally {
        setAiLoading(false);
      }
    };
    
    fetchAiSummary();
  }, [pcStats, me]);

  const getSubjectColor = (val) => {
    if (val >= 75) return '#2b3980';
    if (val >= 50) return '#f5a623';
    return '#e53935';
  };

  const formatRole = (role) => {
    switch (role) {
      case 'program_chair': return 'Program Chair';
      case 'professor': return 'Professor';
      case 'dean': return 'Dean';
      default: return role;
    }
  };

  const openSubjectModal = async (subject) => {
    setSelectedSubject(subject);
    setSubjectDetails([]);
    setSubjectLoading(true);
    try {
      const res = await apiAuth(
        `/api/program-chair/subject-details/${encodeURIComponent(subject.label)}`
      );
      setSubjectDetails(res.questions || []);
    } catch (err) {
      console.error('Failed to load subject details:', err.message);
    } finally {
      setSubjectLoading(false);
    }
  };

  const closeModal = () => {
    setSelectedSubject(null);
    setSubjectDetails([]);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
  const subjectRates = pcStats?.subjectSuccessRates || [];

  return (
    <main className="dashboard-pc-main">
      <header className="dashboard-pc-header">
        <h1>{greeting}, Program Chair {me.firstName}</h1>
        <p>{me.department?.school?.name || me.department?.name || me.school?.name || 'School not assigned'}</p>
      </header>

      {pcLoading ? (
        <div className="pc-loading">Loading dashboard data...</div>
      ) : (
        <>
          {/* Row 1: Student Count + Total Questions */}
          <div className="dashboard-pc-top-row">
            <section className="dashboard-box">
              <div className="box-title">Program Student Count</div>
              <div className="box-content-grid-2">
                {(pcStats?.programStudentCount || []).map((prog, i) => ( 
                  <div key={i} className="metric-card metric-card-blue student-count-card">
                    <h2>{prog.count.toLocaleString()}</h2>
                    <p>{prog.programName}</p>
                  </div>
                ))}
              </div>
            </section>

            <div className="dashboard-box">
              <div className="box-title">No. of Approved Questions</div>
                <div className="question-count-card">
                  <h2>{(pcStats?.approvedQuestions || 0).toLocaleString()}</h2>
                  <p>Approved Questions</p>
                </div>
            </div>
          </div>

          {/* Row 2: 3 Stats */}
          <div className="dashboard-pc-stats-row">
            <section className="dashboard-box">
              <div className="box-title">Total Passing Rate</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{pcStats?.totalPassingRate ?? '—'}%</h2>
                  <p>SEA Students</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Exams Published</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{pcStats?.examsPublished ?? '—'}</h2>
                  <p>Total Exams Published in SEA</p>
                </div>
              </div>
            </section>

            <section className="dashboard-box">
              <div className="box-title">Pending Questions</div>
              <div className="box-content-vertical">
                <div className="metric-card metric-card-blue">
                  <h2>{pcStats?.pendingQuestionsCount ?? '—'}</h2>
                  <p>Pending Questions</p>
                </div>
              </div>
            </section>
          </div>

          {/* Subject Success Rate */}
          <section className="dashboard-box dashboard-pc-subject-box">
            <div className="box-title">Subject Success Rate</div>
            <div className="pc-subject-grid">
              {subjectRates.map((s, i) => (
                <div
                  key={i}
                  className="metric-card pc-subject-card"
                  style={{ borderTopColor: getSubjectColor(s.value) }}
                  onClick={() => openSubjectModal(s)}
                  title={`View breakdown for ${s.label}`}
                >
                  <h2 style={{ color: getSubjectColor(s.value) }}>{s.value}%</h2>
                  <p>{s.label}</p>
                </div>
              ))}
            </div>
            <div className="pc-summary">
              <h3>Summary</h3>
              {aiLoading ? (
                <p className="pc-summary-loading">
                  Generating AI summary<span className="pc-dots">...</span>
                </p>
              ) : (
                <p>{aiSummary || 'No summary available.'}</p>
              )}
            </div>
          </section>

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

            <div className="pc-table-notice">
              Overview of faculty activity in {me?.program?.name || 'your program'}.{' '}
              <button className="pc-notice-link" onClick={() => onRoute('chairQuestionApprovals')}>
                Go to Approval Queue →
              </button>
            </div>
          </section>
        </>
      )}

      {/* Subject Detail Modal */}
      {selectedSubject && (
        <div className="pc-modal-overlay" onClick={closeModal}>
          <div className="pc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pc-modal-header">
              <h2>
                <span className="pc-modal-pct">{selectedSubject.value}%</span>{' '}
                <span className="pc-modal-subject">{selectedSubject.label}</span>
              </h2>
              <button className="pc-modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="pc-modal-body">
              {subjectLoading ? (
                <p className="pc-modal-loading">Loading question breakdown...</p>
              ) : subjectDetails.length === 0 ? (
                <p className="pc-modal-empty">No question data available for this subject.</p>
              ) : (
                <table className="modern-table pc-modal-table">
                  <thead>
                    <tr><th>Question ID</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {subjectDetails.map((item, i) => (
                      <tr key={i}>
                        <td>{item.questionId}</td>
                        <td>{item.failCount}/{item.totalStudents} Students failed this question</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default ProgramChairDashboard;
