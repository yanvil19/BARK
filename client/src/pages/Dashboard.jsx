import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/Dashboard.css';
import '../styles/LandingPage.css';

const Dashboard = ({ me, onNavigate, onRoute }) => {
  console.log('🔍 RENDER - ME OBJECT:', me);
  console.log('🔍 RENDER - ROLE VALUE:', me?.role);
  const navigate = onNavigate || onRoute || (() => {});

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

  const [pcStats, setPcStats] = useState(null);
  const [pcLoading, setPcLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectDetails, setSubjectDetails] = useState([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingQuestions, setPendingQuestions] = useState([]);

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
    (async () => {
      try {
        const [deptRes, progRes] = await Promise.all([
          apiAuth('/api/admin/catalog/departments?limit=200'),
          apiAuth('/api/admin/catalog/programs?limit=200'),
        ]);
        if (cancelled) return;
        setAdminDepts(deptRes.departments || []);
        setAdminPrograms(progRes.programs || []);
      } catch (err) {
        console.error('Failed to load admin catalog:', err.message);
      } finally {
        if (!cancelled) setAdminLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me]);

 useEffect(() => {
  console.log('🟡 EFFECT TRIGGERED');
  console.log('🟡 ME INSIDE EFFECT:', me);
  console.log('🟡 ROLE INSIDE EFFECT:', me?.role);

  if (!me) {
    console.log('⛔ No user yet, skipping fetch');
    return;
  }

  if (me.role !== 'program_chair') {
    console.log('⛔ Wrong role:', me.role);
    return;
  }

  console.log('✅ FETCHING PROGRAM CHAIR STATS NOW');

  const fetchPcStats = async () => {
    try {
      const [statsRes, pendingRes] = await Promise.all([
        apiAuth('/api/stats/program-chair/stats'),
        apiAuth('/api/questions/approvals?limit=10'),
      ]);

      console.log('✅ API RESPONSE (stats):', statsRes);
      console.log('✅ API RESPONSE (pending):', pendingRes);

      setPcStats({
        ...statsRes,
        pendingQuestionsCount: pendingRes.questions?.length ?? 0,
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

  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });

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
          <h1>System Overview</h1>
          <p>National University Laguna</p>
        </header>

        <div className="dashboard-sa-top-grid">
          <section className="dashboard-box">
            <div className="box-title">Pending Accounts</div>
            <div className="box-content-vertical">
              <div className="metric-card metric-card-yellow">
                <h2>{stats?.pendingAccounts?.students || 0}</h2>
                <p>Students</p>
              </div>
              <div className="metric-card metric-card-yellow">
                <h2>{stats?.pendingAccounts?.alumni || 0}</h2>
                <p>Alumni</p>
              </div>
            </div>
          </section>

          <section className="dashboard-box box-wide">
            <div className="box-title">Registered Accounts</div>
            <div className="box-content-grid">
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.student?.active || 0}</h2><p>Students</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.alumni?.active || 0}</h2><p>Alumni</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.dean?.active || 0}</h2><p>Dean</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.program_chair?.active || 0}</h2><p>Program Chairs</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.professor?.active || 0}</h2><p>Professors</p></div>
              <div className="metric-card metric-card-blue"><h2>{stats?.users?.super_admin?.active || 0}</h2><p>Super Admin</p></div>
            </div>
          </section>

          <section className="dashboard-box">
            <div className="box-title">Database Storage</div>
            <div className="box-content-center">
              <div className="db-gauge-container">
                <div className="db-gauge-fill" style={{ height: `${Math.min(stats?.database?.percentUsed || 0, 100)}%` }} />
              </div>
              <div className="db-gauge-label">
                {stats?.database?.totalSizeMB || 0}mb / {stats?.database?.limitMB || 512}mb
              </div>
            </div>
          </section>
        </div>

        <section className="dashboard-table-section">
          <div className="table-section-header">
            <div>
              <h2>Schools of NU Laguna</h2>
              <p>{adminDepts.length} schools registered in the system</p>
            </div>
            <button className="view-btn" onClick={() => navigate('adminCatalog')}>View</button>
          </div>
          <table className="modern-table">
            <thead>
              <tr><th>Acronym</th><th>School Name</th><th>Programs</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminDepts.map(dept => (
                <tr key={dept._id}>
                  <td><span className="pill pill-dark">{dept.code}</span></td>
                  <td>{dept.name}</td>
                  <td className="light-text">
                    {programCountByDept[String(dept._id)] || 0} program{programCountByDept[String(dept._id)] === 1 ? '' : 's'}
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

        <section className="dashboard-table-section">
          <div className="table-section-header">
            <div>
              <h2>Programs</h2>
              <p>{adminPrograms.length} programs across all departments</p>
            </div>
            <button className="view-btn" onClick={() => navigate('adminCatalog')}>View</button>
          </div>
          <table className="modern-table">
            <thead>
              <tr><th>Code</th><th>Program Name</th><th>Department</th><th>Status</th></tr>
            </thead>
            <tbody>
              {adminPrograms.map(prog => (
                <tr key={prog._id}>
                  <td><span className="pill pill-dark">{prog.code}</span></td>
                  <td>{prog.name}</td>
                  <td><span className="pill pill-dark">{prog.department?.code || String(prog.department)}</span></td>
                  <td>
                    <span className={`status-text ${prog.isActive ? 'active' : 'inactive'}`}>
                      • {prog.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="table-footer-dots">...</div>
        </section>
      </main>
    );
  }
  if (me.role === 'dean') {
    return (
      <main>
        <h1>Dashboard for Dean</h1>
        <p>Insert content here</p>
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
                <div className="box-title">Total Questions</div>
                <div className="metric-card metric-card-blue pc-tq-card">
                  <div className="pc-tq-number">
                    {(pcStats?.totalQuestions || 0).toLocaleString()}
                  </div>
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
                    <p>&nbsp;</p>
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
                  <h2>Questions for Review and Approval</h2>
                  <p>These questions are currently being reviewed or are pending approval</p>
                </div>
                <div className="pc-review-header-right">
                  <span className="pc-see-all">See all</span>
                  <div className="pc-pending-badge">
                    <span className="pc-pending-number">{pcStats?.pendingQuestionsCount ?? 0}</span>
                    <span className="pc-pending-label">Pending</span>
                  </div>
                </div>
              </div>

              <table className="modern-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Question</th>
                    <th>Review Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingQuestions.slice(0, 10).map((q, i) => (
                    <tr key={i}>
                      <td>
                        <span
                          className="pill"
                          style={{ backgroundColor: hashTagColor(q.tag), color: '#fff' }}
                        >
                          {q.tag}
                        </span>
                      </td>
                      <td className="pc-question-text">{q.questionText}</td>
                      <td>
                        <div className="pc-action-buttons">
                          <button className="pc-btn pc-btn-approve">Approve</button>
                          <button className="pc-btn pc-btn-revision">Revision</button>
                          <button className="pc-btn pc-btn-discard">Discard</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="pc-table-notice">
                Showing 10 of {pcStats?.pendingQuestionsCount ?? 0} pending questions.{' '}
                <button className="pc-notice-link" onClick={() => navigate('myQuestions')}>
                  Go to My Questions to review all →
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