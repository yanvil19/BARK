import React, { useEffect, useState } from 'react';

const Home = () => {
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

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

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>
      {/* 1. Website Name & Description */}
      <header style={{ textAlign: 'center', marginBottom: '50px' }}>
        <h1 style={{ fontSize: '3rem', color: '#0038a8' }}>NU-BOARD</h1>
        <p style={{ fontSize: '1.2rem', color: '#555' }}>
          The official Automated Examination Management System for National University - Laguna. 
          Streamlining academic assessments for students and faculty.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
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

      <hr style={{ margin: '40px 0' }} />

      {/* 4. Hardcoded Available Exams (As requested by your groupmate) */}
      <section style={{ textAlign: 'center' }}>
        <h1>Available Exams</h1>
        <div style={{ padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '10px', display: 'inline-block' }}>
          <p><em>No active exams at the moment. Check back once the Question Maker is live!</em></p>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li>📄 CS101: Introduction to Computing (Sample)</li>
            <li>📄 CS102: Data Structures & Algorithms (Sample)</li>
          </ul>
        </div>
      </section>

      <hr style={{ margin: '40px 0' }} />

      <section style={{ textAlign: 'center' }}>
        <h1>System Statistics</h1>
        {!stats ? (
          <p>Loading stats...</p>
        ) : (
          <div style={{ background: '#f3f3f3', padding: '20px', borderRadius: '10px', display: 'inline-block' }}>
            <h3>Total Users: {stats.total.users}</h3>
            <h4>Active Users: {stats.total.activeUsers}</h4>
            <hr />
            {Object.entries(stats.users).map(([role, value]) => (
              <div key={role}>
                <h4>{role}</h4>
                <p>{value.active} active / {value.total} total</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default Home;