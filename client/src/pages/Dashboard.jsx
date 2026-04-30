import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/Dashboard.css';
import '../styles/LandingPage.css';

const Dashboard = ({ me, onNavigate, onRoute }) => {
  // console.log('🔍 RENDER - ME OBJECT:', me);
  // console.log('🔍 RENDER - ROLE VALUE:', me?.role);
  const navigate = onNavigate || onRoute || (() => {});

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [totalLogsPages, setTotalLogsPages] = useState(1);

  const [pcStats, setPcStats] = useState(null);
  const [pcLoading, setPcLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectDetails, setSubjectDetails] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [deanStats, setDeanStats] = useState(null);
  const [deanLoading, setDeanLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes, statsRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/stats/summary'),
        ]);
        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const statsData = await statsRes.json();
        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error('Error loading landing page data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (departments.length === 0) { setActiveDepartmentId(''); return; }
    const hasActive = departments.some(
      (dept) => String(dept._id) === String(activeDepartmentId)
    );
    if (!hasActive) setActiveDepartmentId(String(departments[0]._id));
  }, [departments, activeDepartmentId]);

  useEffect(() => {
    if (me?.role !== 'super_admin') return;
    let cancelled = false;
    setAdminLoading(true);
    setLogsLoading(true);
    (async () => {
      try {
        const [deptRes, progRes, logRes] = await Promise.all([
          apiAuth('/api/admin/catalog/departments?limit=200'),
          apiAuth('/api/admin/catalog/programs?limit=200'),
          apiAuth(`/api/stats/audit-logs?limit=5&page=${logsPage}`)
        ]);
        if (cancelled) return;
        setAdminDepts(deptRes.departments || []);
        setAdminPrograms(progRes.programs || []);
        setAuditLogs(logRes.logs || []);
        setTotalLogsPages(logRes.pages || 1);
      } catch (err) {
        console.error('Failed to load admin dashboard data:', err.message);
      } finally {
        if (!cancelled) {
          setAdminLoading(false);
          setLogsLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [me, logsPage]);

 useEffect(() => {
  // console.log('🟡 EFFECT TRIGGERED');
  // console.log('🟡 ME INSIDE EFFECT:', me);
  // console.log('🟡 ROLE INSIDE EFFECT:', me?.role);

  if (!me) {
    // console.log('⛔ No user yet, skipping fetch');
    return;
  }

  if (me.role !== 'program_chair') {
    // console.log('⛔ Wrong role:', me.role);
    return;
  }

  // console.log('✅ FETCHING PROGRAM CHAIR STATS NOW');

  const fetchPcStats = async () => {
    try {
      const [statsRes, pendingRes] = await Promise.all([
        apiAuth('/api/stats/program-chair/stats'),
        apiAuth('/api/questions/approvals?limit=10'),
      ]);

      // console.log('✅ API RESPONSE (stats):', statsRes);
      // console.log('✅ API RESPONSE (pending):', pendingRes);

      setPcStats({
        ...statsRes,
        pendingQuestionsCount: statsRes.pendingQuestionsCount ?? 0,
      });
      setPendingQuestions(pendingRes.questions || []);
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

  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });
  const formatRole = (role) => {
    switch (role) {
      case 'program_chair': return 'Program Chair';
      case 'professor': return 'Professor';
      case 'dean': return 'Dean';
      default: return role;
    }
  };

  const hashTagColor = (str = '') => {
    const palette = [
      '#2b3980', '#1a6b74', '#b96b10', '#6b3fa0',
      '#1a7a4a', '#8b2252', '#2e6da4', '#7a4a1a',
      '#3d6b2b', '#a04040',
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return palette[Math.abs(hash) % palette.length];
  };

  const getSubjectColor = (val) => {
    if (val >= 75) return '#2b3980';
    if (val >= 50) return '#f5a623';
    return '#e53935';
  };

  const formatAuditAction = (action = '') => action.replace(/_/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());

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

  if (!me) {
    return (
      <div className="landing-wrapper">
        <header className="hero-main">
          <div className="hero-inner">
            <h2 className="hero-subtitle">Engineered for Excellence.</h2>
            <h1 className="hero-title">Built for Board Success.</h1>
            <p className="hero-description">
              Prepare with faculty-validated content, adaptive quizzes, and real-time performance insights.
            </p>
            <div className="hero-buttons">
              <button className="btn-login-yellow" onClick={() => navigate('login')}>Login</button>
              <button className="btn-learn-more-outline" onClick={() => {
                const el = document.getElementById('about');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}>Learn More</button>
            </div>
          </div>
        </header>

        <section id="about" className="about-section">
          <div className="about-content">
            <div className="about-left">
              <h4 className="about-subtitle">WHAT IS BARK?</h4>
              <h2 className="about-title">
                <span className="text-yellow">Your Personal</span><br />
                <span className="text-white">Review Platform</span>
              </h2>
              <p className="about-para">
                Board Exam & Review Kit (BARK), the Board Exam Reviewer for NU Laguna — is a
                web-based platform designed to help students prepare for their PRC licensure exams
                through quizzes, mock board exams, and progress tracking.
              </p>
              <p className="about-para">
                Unlike third-party reviewers, all content is created, reviewed, and approved by
                faculty to ensure academic quality. Role-based access for administrators, faculty,
                and students means a streamlined, scalable experience across all programs.
              </p>
            </div>
            <div className="about-right">
              <div className="feature-card">
                <div className="feature-icon">📋</div>
                <div className="feature-text">
                  <h5>Faculty-Curated Content</h5>
                  <p>Every question is created, reviewed, and approved by the Faculty</p>
                </div>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🧠</div>
                <div className="feature-text">
                  <h5>Adaptive Mock Exams</h5>
                  <p>Simulate the real board experience with timed, full-length mock exams tailored per program.</p>
                </div>
              </div>
              <div className="feature-card">
                <div className="feature-icon">📊</div>
                <div className="feature-text">
                  <h5>AI-Powered Analytics</h5>
                  <p>Personalized feedback highlights your strengths, gaps, and areas needing focus.</p>
                </div>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <div className="feature-text">
                  <h5>Role-Based Access</h5>
                  <p>Separate dashboards and tools for students, faculty, and administrators.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="landing-content-wrap">
          <section id="programs" className="schools-panel">
            <header className="schools-header">
              <div className="schools-header-left">
                <span className="schools-header-label">Schools of NU LAGUNA</span>
              </div>
              <span className="schools-header-tag">Supported Programs</span>
            </header>
            {loading ? (
              <p className="schools-feedback">Loading...</p>
            ) : departments.length === 0 ? (
              <p className="schools-feedback">No departments available.</p>
            ) : (
              <>
                <div className="schools-tabs" role="tablist" aria-label="Departments">
                  {departments.map((dept) => {
                    const isActive = String(dept._id) === String(activeDepartmentId);
                    return (
                      <button
                        key={dept._id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`schools-tab ${isActive ? 'active' : ''}`}
                        onClick={() => setActiveDepartmentId(String(dept._id))}
                      >
                        <span className="schools-tab-name">{dept.name}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="schools-programs">
                  {filteredPrograms.length === 0 ? (
                    <p className="schools-feedback">No programs available for this department yet.</p>
                  ) : (
                    filteredPrograms.map((prog) => (
                      <article key={prog._id} className="schools-program-card">
                        <span className="schools-program-dot" aria-hidden="true"></span>
                        <div className="schools-program-info">
                          <p className="schools-program-name">{prog.name}</p>
                          {prog.code && <span className="schools-program-code">{prog.code}</span>}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </>
            )}
          </section>

          <section id="mock-exams" className="exams-panel">
            <div className="exams-section-header">
              <div>
                <span className="exams-section-label">Practice Materials</span>
                <h2 className="exams-section-title">
                  Available <span>Mock Board Exams</span>
                </h2>
              </div>
            </div>
            <div className="exams-placeholder-card">
              <p className="exams-placeholder-title">No active exams at the moment.</p>
              <p className="exams-placeholder-copy">
                Check back once the exam module is ready and approved for student use.
              </p>
              <p className="exams-placeholder-note">
                Sample exam entries and complex tables are intentionally hidden.
              </p>
            </div>
            <section className="exam-cta-banner" aria-label="Board exam call to action">
              <div className="exam-cta-content">
                <span className="exam-cta-kicker">Start Strong</span>
                <h3 className="exam-cta-title">Ready to Pass Your Board Exam?</h3>
                <p className="exam-cta-copy">
                  Join hundreds of NU Laguna students and review smarter.
                </p>
                <div className="exam-cta-actions">
                  <button type="button" className="exam-cta-primary" onClick={() => navigate('Register')}>
                    Create An Account
                  </button>
                  <button type="button" className="exam-cta-secondary" onClick={() => {
                    const el = document.getElementById('programs');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}>
                    View Programs
                  </button>
                </div>
              </div>
              <div className="exam-cta-watermark" aria-hidden="true">BARK</div>
            </section>
          </section>
        </div>
      </div>
    );
  }

  if (me.role === 'super_admin') {
    const programCountByDept = adminPrograms.reduce((acc, prog) => {
      const deptId = String(prog.department?._id || prog.department || '');
      acc[deptId] = (acc[deptId] || 0) + 1;
      return acc;
    }, {});

    return (
      <main className="dashboard-sa-main">
        <header className="dashboard-sa-header">
          <h1>Dashboard</h1>
          <p>National University Laguna • Super Admin Portal</p>
        </header>

        <div className="dashboard-sa-top-grid">
          <section className="dashboard-box">
            <div className="box-title">Question Repository</div>
            <div className="box-content-vertical">
              <div className="metric-card metric-card-blue">
                <h2>{stats?.questions?.total || 0}</h2>
                <p>Total Questions</p>
              </div>
              <div className="metric-card metric-card-yellow" style={{ marginTop: '10px' }}>
                <h2>{stats?.questions?.pending || 0}</h2>
                <p>Pending Review</p>
              </div>
            </div>
          </section>

          <section className="dashboard-box box-wide">
            <div className="box-title">System Users</div>
            <div className="box-content-grid">
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.student?.active || 0}</h2><p>Students</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.professor?.active || 0}</h2><p>Professors</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.program_chair?.active || 0}</h2><p>Chairs</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.dean?.active || 0}</h2><p>Deans</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.super_admin?.active || 0}</h2><p>Admins</p></div>
              <div className="metric-card metric-card-yellow" onClick={() => onRoute('adminUsers')} style={{ cursor: 'pointer' }}>
                <h2>{(stats?.pendingAccounts?.students || 0) + (stats?.pendingAccounts?.alumni || 0)}</h2>
                <p>Pending Req.</p>
              </div>
            </div>
          </section>

          <section className="dashboard-box">
            <div className="box-title">Database</div>
            <div className="box-content-center">
              <div className="db-gauge-container">
                <div className="db-gauge-fill" style={{ height: `${Math.min(stats?.database?.percentUsed || 0, 100)}%` }} />
              </div>
              <div className="db-gauge-label">
                {stats?.database?.percentUsed || 0}% Used
              </div>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>{stats?.database?.totalSizeMB || 0}MB / 512MB</p>
            </div>
          </section>
        </div>

        <section className="dashboard-table-section" style={{ margin: '0 20px 24px' }}>
          <div className="table-section-header">
            <div>
              <h2 style={{ fontSize: '18px' }}>Recent Audit Logs</h2>
              <p style={{ fontSize: '12px' }}>Latest system changes and admin actions</p>
            </div>
          </div>
          <table className="modern-table">
            <thead>
              <tr>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {logsLoading ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Loading logs...</td></tr>
              ) : auditLogs.length === 0 ? (
                <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>No audit logs found.</td></tr>
              ) : (
                auditLogs.map(log => (
                  <tr key={log._id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: '600', color: 'var(--primary-bg)' }}>{log.admin?.name || 'Unknown'}</span>
                        <span style={{ fontSize: '11px', color: '#888' }}>{log.admin?.email}</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="pill" style={{ background: '#f0f4ff', color: '#1a43bf', textTransform: 'capitalize', fontSize: '12px' }}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '13px' }}>
                        <strong style={{ color: '#fad227' }}>{log.targetType}</strong>
                        {log.details?.name && <span style={{ color: '#666' }}> ({log.details.name})</span>}
                        {log.details?.userEmail && <span style={{ color: '#666' }}> ({log.details.userEmail})</span>}
                      </div>
                    </td>
                    <td style={{ fontSize: '12px', color: '#666' }}>
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="audit-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: '#f9faff', borderTop: '1px solid #e1e3ed' }}>
            <span style={{ fontSize: '12px', color: '#888' }}>Page {logsPage} of {totalLogsPages}</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                className="pag-btn" 
                onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                disabled={logsPage === 1}
              >Previous</button>
              <button 
                className="pag-btn" 
                onClick={() => setLogsPage(p => Math.min(totalLogsPages, p + 1))}
                disabled={logsPage === totalLogsPages}
              >Next</button>
            </div>
          </div>
        </section>

        <div className="dashboard-sa-bottom-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', padding: '0 20px 24px' }}>
          <section className="dashboard-table-section" style={{ margin: 0 }}>
            <div className="table-section-header">
              <div>
                <h2 style={{ fontSize: '18px' }}>Schools</h2>
                <p style={{ fontSize: '12px' }}>{adminDepts.length} Registered</p>
              </div>
              <button className="view-btn" onClick={() => navigate('schoolsPrograms')}>Manage</button>
            </div>
            <table className="modern-table">
              <thead>
                <tr><th>Code</th><th>School Name</th><th>Users</th><th>Status</th></tr>
              </thead>
              <tbody>
                {adminDepts.slice(0, 5).map(dept => (
                  <tr key={dept._id}>
                    <td><span className="pill-nu">{dept.code}</span></td>
                    <td style={{ fontSize: '13px' }}>{dept.name}</td>
                    <td style={{ textAlign: 'center', fontWeight: '600' }}>
                      {stats?.academic?.deptUserCounts?.[String(dept._id)] || 0}
                    </td>
                    <td>
                      <span className={`status-text ${dept.isActive ? 'active' : 'inactive'}`}>
                        • {dept.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="dashboard-table-section" style={{ margin: 0 }}>
            <div className="table-section-header">
              <div>
                <h2 style={{ fontSize: '18px' }}>Programs</h2>
                <p style={{ fontSize: '12px' }}>{adminPrograms.length} Registered</p>
              </div>
              <button className="view-btn" onClick={() => navigate('schoolsPrograms')}>Manage</button>
            </div>
            <table className="modern-table">
              <thead>
                <tr><th>Code</th><th>Program Name</th><th>Users</th><th>Status</th></tr>
              </thead>
              <tbody>
                {adminPrograms.slice(0, 5).map(prog => (
                  <tr key={prog._id}>
                    <td><span className="pill-nu">{prog.code}</span></td>
                    <td style={{ fontSize: '13px' }}>{prog.name}</td>
                    <td style={{ textAlign: 'center', fontWeight: '600' }}>
                      {stats?.academic?.progUserCounts?.[String(prog._id)] || 0}
                    </td>
                    <td>
                      <span className={`status-text ${prog.isActive ? 'active' : 'inactive'}`}>
                        • {prog.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>
    );
  }
  if (me.role === 'dean') {
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
            <div className="dashboard-pc-stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
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
                      <h2 style={{ color: item.tone === 'warning' ? '#f5a623' : '#2b3980', fontSize: '1.4rem' }}>
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
            </section>

            <section className="dashboard-table-section">
              <div className="table-section-header">
                <div>
                  <h2>Recent Activity</h2>
                  <p>Your latest dean-side actions and decisions</p>
                </div>
              </div>

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
            </section>
          </>
        )}
      </main>
    );
  }

  if (me.role === 'program_chair') {
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
  }

  // ── Render: professor ───────────────────────────────────────────
  if (me.role === 'professor') {
    return (
      <main>
        <h1>Dashboard for Professor</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  // ── Render: student ─────────────────────────────────────────────
  if (me.role === 'student') {
    return (
      <main>
        <h1>Dashboard for Student</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Welcome</h1>
      <p>Insert content here</p>
    </main>
  );
};

export default Dashboard;
