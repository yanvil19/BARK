import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/Dashboard.css';
import '../styles/LandingPage.css';

const Dashboard = ({ me }) => {
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Admin-only: all depts + programs (including inactive)
  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes, statsRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/stats/summary') // 👈 ADD THIS
        ]);

        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const statsData = await statsRes.json();

        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setStats(statsData); // 👈 ADD THIS

        setLoading(false);
      } catch (error) {
        console.error("Error loading landing page data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (departments.length === 0) {
      setActiveDepartmentId('');
      return;
    }

    const hasActiveDepartment = departments.some(
      (dept) => String(dept._id) === String(activeDepartmentId)
    );

    if (!hasActiveDepartment) {
      setActiveDepartmentId(String(departments[0]._id));
    }
  }, [departments, activeDepartmentId]);

  // Fetch all departments + programs for super admin (auth required)
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

  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });

  // Landing Page for unauthenticated users
  if (!me) {
    return (
      <div className="landing-wrapper">
        {/* 1. Website Name & Description */}
        <header className="hero-main">
          <div className="hero-inner">
            <h2 className="hero-subtitle">Engineered for Excellence.</h2>
            <h1 className="hero-title">Built for Board Success.</h1>
            <p className="hero-description">
              Prepare with faculty-validated content, adaptive quizzes, and real-time performance insights.
            </p>
            <div className="hero-buttons">
              <button className="btn-login-yellow">Login</button>
              <button className="btn-learn-more-outline">Learn More</button>
            </div>
          </div>
        </header>

        {/* 2. What is BARK? Section */}
        <section className="about-section">
          <div className="about-content">
            <div className="about-left">
              <h4 className="about-subtitle">WHAT IS BARK?</h4>
              <h2 className="about-title">
                <span className="text-yellow">Your Personal</span><br />
                <span className="text-white">Review Platform</span>
              </h2>
              <p className="about-para">
                Board Exam & Review Kit (BARK), the Board Exam Reviewer for NU Laguna — is a web-based platform designed to help students prepare for their PRC licensure exams through quizzes, mock board exams, and progress tracking.
              </p>
              <p className="about-para">
                Unlike third-party reviewers, all content is created, reviewed, and approved by faculty to ensure academic quality. Role-based access for administrators, faculty, and students means a streamlined, scalable experience across all programs.
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
          <section className="schools-panel">
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

          <section className="exams-panel">
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
                  <button type="button" className="exam-cta-primary">Create An Account</button>
                  <button type="button" className="exam-cta-secondary">View Programs</button>
                </div>
              </div>
              <div className="exam-cta-watermark" aria-hidden="true">BARK</div>
            </section>
          </section>
        </div>
      </div>
    );
  }

  // Super Admin Dashboard
  if (me.role === 'super_admin') {
    // Derive program count per department
    const programCountByDept = adminPrograms.reduce((acc, prog) => {
      const deptId = String(prog.department?._id || prog.department || '');
      acc[deptId] = (acc[deptId] || 0) + 1;
      return acc;
    }, {});

    return (
      <main>
        <h1>Dashboard for Super Admin</h1>

        {/* System Statistics */}
        <section>
          <h2>System Statistics</h2>
          {!stats ? (
            <p>Loading stats...</p>
          ) : (
            <div>
              <h3>Total Users: {stats.total.users}</h3>
              <h4>Active Users: {stats.total.activeUsers}</h4>
              {Object.entries(stats.users).map(([role, value]) => (
                <div key={role}>
                  <h4>{role}</h4>
                  <p>{value.active} active / {value.total} total</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Database Storage Statistics */}
        <section className="dashboard-storage-card">
          <h2>Database Storage (Free Tier)</h2>
          {!stats || !stats.database ? (
            <p>Loading storage stats...</p>
          ) : (
            <div>
              <div className="dashboard-storage-header">
                <span><strong>Total Used:</strong> {stats.database.totalSizeMB} MB / {stats.database.limitMB} MB</span>
                <span><strong>{stats.database.percentUsed}%</strong></span>
              </div>
              <div className="dashboard-storage-bar-track">
                <div
                  className="dashboard-storage-bar-fill"
                  style={{
                    width: `${Math.min(stats.database.percentUsed, 100)}%`,
                    backgroundColor: stats.database.percentUsed > 85 ? '#e53935' : stats.database.percentUsed > 60 ? '#fb8c00' : '#43a047'
                  }}
                ></div>
              </div>
              <p className="dashboard-storage-footer">
                Data Storage: {stats.database.storageSizeMB} MB | Index Size: {stats.database.indexSizeMB} MB
              </p>
            </div>
          )}
        </section>

        {/* Schools (Departments) Table */}
        <section>
          <h2>Schools of NU Laguna <small>({adminLoading ? '...' : adminDepts.length} total)</small></h2>
          {adminLoading ? (
            <p>Loading...</p>
          ) : (
            <table border="1" cellPadding="6" cellSpacing="0">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>School Name</th>
                  <th>Program Count</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {adminDepts.length === 0 ? (
                  <tr><td colSpan={4}>No departments found.</td></tr>
                ) : (
                  adminDepts.map((dept) => (
                    <tr key={dept._id}>
                      <td>{dept.code}</td>
                      <td>{dept.name}</td>
                      <td>{programCountByDept[String(dept._id)] || 0}</td>
                      <td>{dept.isActive ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </section>

        {/* Programs Table */}
        <section>
          <h2>Programs <small>({adminLoading ? '...' : adminPrograms.length} total)</small></h2>
          {adminLoading ? (
            <p>Loading...</p>
          ) : (
            <table border="1" cellPadding="6" cellSpacing="0">
              <thead>
                <tr>
                  <th>Program Code</th>
                  <th>Program Name</th>
                  <th>Department</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {adminPrograms.length === 0 ? (
                  <tr><td colSpan={4}>No programs found.</td></tr>
                ) : (
                  adminPrograms.map((prog) => (
                    <tr key={prog._id}>
                      <td>{prog.code}</td>
                      <td>{prog.name}</td>
                      <td>{prog.department?.code || String(prog.department)}</td>
                      <td>{prog.isActive ? 'Active' : 'Inactive'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </section>
      </main>
    );
  }

  // Dean Dashboard
  if (me.role === 'dean') {
    return (
      <main>
        <h1>Dashboard for Dean</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  // Program Chair Dashboard
  if (me.role === 'program_chair') {
    return (
      <main>
        <h1>Dashboard for Program Chair</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  // Professor Dashboard
  if (me.role === 'professor') {
    return (
      <main>
        <h1>Dashboard for Professor</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  // Student Dashboard
  if (me.role === 'student') {
    return (
      <main>
        <h1>Dashboard for Student</h1>
        <p>Insert content here</p>
      </main>
    );
  }

  // Fallback
  return (
    <main>
      <h1>Welcome</h1>
      <p>Insert content here</p>
    </main>
  );
};

export default Dashboard;
