import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/Dashboard.css';

const Dashboard = ({ me, onNavigate }) => {
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
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

  // Landing Page for unauthenticated users
  if (!me) {
    return (
      <div>
        {/* 1. Website Name & Description */}
        <header>
          <h1>NU-BOARD</h1>
          <p>
            The official Automated Examination Management System for National University - Laguna. 
            Streamlining academic assessments for students and faculty.
          </p>
        </header>

        <div>
          {/* 2. Departments List */}
          <section>
            <h2>Our Departments</h2>
            {loading ? <p>Loading...</p> : (
              <ul>
                {departments.map(dept => (
                  <li key={dept._id}><strong>{dept.code}</strong> - {dept.name}</li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Programs List */}
          <section>
            <h2>Academic Programs</h2>
            {loading ? <p>Loading...</p> : (
              <ul>
                {programs.map(prog => (
                  <li key={prog._id}>{prog.name} ({prog.code})</li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <hr/>

        {/* 4. Hardcoded Available Exams (As requested by your groupmate) */}
        <section>
          <h1>Available Exams</h1>
          <div>
            <p><em>No active exams at the moment. Check back once the Question Maker is live!</em></p>
            <ul>
              <li>Sample Exam 1</li>
              <li>Sample Exam 2</li>
            </ul>
          </div>
        </section>
      </div>
    );
  }

  if (me.role === 'super_admin') {
    // Derive program count per department
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
          {/* Section 1: Pending Accounts */}
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

          {/* Section 2: Registered Accounts */}
          <section className="dashboard-box box-wide">
            <div className="box-title">Registered Accounts</div>
            <div className="box-content-grid">
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.student?.active || 0}</h2><p>Students</p></div>
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.alumni?.active || 0}</h2><p>Alumni</p></div>
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.dean?.active || 0}</h2><p>Dean</p></div>
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.program_chair?.active || 0}</h2><p>Program Chairs</p></div>
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.professor?.active || 0}</h2><p>Professors</p></div>
              <div className="metric-card metric-card-blue"><h2 className="heavy">{stats?.users?.super_admin?.active || 0}</h2><p>Super Admin</p></div>
            </div>
          </section>

          {/* Section 3: Database Storage */}
          <section className="dashboard-box">
            <div className="box-title">Database Storage</div>
            <div className="box-content-center">
              <div className="db-gauge-container">
                <div className="db-gauge-fill" style={{ height: `${Math.min(stats?.database?.percentUsed || 0, 100)}%` }}></div>
              </div>
              <div className="db-gauge-label">
                {stats?.database?.totalSizeMB || 0}mb / {stats?.database?.limitMB || 512}mb
              </div>
            </div>
          </section>
        </div>

        {/* Schools Table Section */}
        <section className="dashboard-table-section">
          <div className="table-section-header">
            <div>
              <h2>Schools of NU Laguna</h2>
              <p>{adminDepts.length} schools registered in the system</p>
            </div>
            <button className="view-btn" onClick={() => { if (typeof onNavigate === 'function') onNavigate('adminCatalog') }}>View</button>
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
                  <td className="light-text">{programCountByDept[String(dept._id)] || 0} program{programCountByDept[String(dept._id)] === 1 ? '' : 's'}</td>
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

        {/* Programs Table Section */}
        <section className="dashboard-table-section">
          <div className="table-section-header">
            <div>
              <h2>Programs</h2>
              <p>{adminPrograms.length} programs across all departments</p>
            </div>
            <button className="view-btn" onClick={() => { if (typeof onNavigate === 'function') onNavigate('adminCatalog') }}>View</button>
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