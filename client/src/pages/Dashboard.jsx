import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

const Dashboard = ({ me }) => {
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