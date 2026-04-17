import React, { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import "../styles/LandingPage.css";
import heroBg from "../assets/henrysyhall.jpg"; 

const Dashboard = ({ me }) => {
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const [adminDepts, setAdminDepts] = useState([]);
  const [adminPrograms, setAdminPrograms] = useState([]);
  const [adminLoading, setAdminLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes, statsRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/stats/summary')
        ]);

        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const statsData = await statsRes.json();

        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setStats(statsData);
        setLoading(false);
      } catch (error) {
        console.error("Error loading landing page data:", error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
    <div className="landing-container">

      {/* Hero Banner */}
      <section className="hero">
        <h1>Engineered for Excellence.<br/>Built for Board Success.</h1>
        <p>Prepare for your Mock Board Exams with BARK, the official NU Laguna Board Review System.</p>
        <div className="hero-buttons">
          <button>Login</button>
          <button>Register</button>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about">
        <h2>WHAT IS BARK?</h2>
        <p>Your Personal Review Platform</p>
        <div className="features">
          <div className="feature">Faculty-Curated Content</div>
          <div className="feature">Adaptive Mock Exams</div>
          <div className="feature">Peer-Reviewed Analytics</div>
          <div className="feature">Peer-Based Access</div>
        </div>
      </section>

      {/* Schools Section */}
      <section id="programs" className="schools">
        <h2>Schools of NU LAGUNA</h2>
        <div className="tabs">
          <button className="tab active">School of Engineering and Technology</button>
          <button className="tab">School of Arts and Sciences</button>
          <button className="tab">School of Accountancy, Business and Management</button>
        </div>
        <div className="tab-content">
          <ul>
            <li>Civil Engineering</li>
            <li>Architecture</li>
          </ul>
        </div>
      </section>

      {/* Mock Exams Section */}
      <section id="mock-exams" className="mock-exams">
        <h2>Available Mock Board Exams</h2>
        <table className="exam-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Date</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Civil Engineering Board Exam – Set A</td>
              <td>Jun 15, 2024</td>
              <td><button>Download</button></td>
            </tr>
            <tr>
              <td>Advanced Board Exam – Comprehensive Review</td>
              <td>Jun 18, 2024</td>
              <td><button>Download</button></td>
            </tr>
            <tr>
              <td>Civil Engineering – English & Governance</td>
              <td>Jun 20, 2024</td>
              <td><button>Download</button></td>
            </tr>
            <tr>
              <td>Civil Engineering Board Exam – Practice Set B</td>
              <td>Jun 22, 2024</td>
              <td><button>Download</button></td>
            </tr>
            <tr>
              <td>Civil Engineering – Mathematics & Surveying</td>
              <td>Jun 25, 2024</td>
              <td><button>Download</button></td>
            </tr>
            <tr>
              <td>Architecture Board Exam – Materials & Methods</td>
              <td>Jun 28, 2024</td>
              <td><button>Download</button></td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Call to Action */}
      <section id="register" className="cta">
        <h2>Ready to Pass Your Board Exam?</h2>
        <div className="cta-buttons">
          <button>Create An Account</button>
          <button>View Programs</button>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>Board Exam Review Kit</p>
        <p>Support</p>
      </footer>
    </div>
  );
}

  return <main><h1>Dashboard</h1></main>;
};

export default Dashboard;