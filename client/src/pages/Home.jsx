import React, { useEffect, useState } from 'react';

const Home = () => {
  // === State Management ===
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  // Exams are still hardcoded
  const [exams, setExams] = useState([
    { _id: 1, title: 'Civil Engineering Board Exam — Set A', subj: 'Structural Analysis & Design', date: 'Apr 22, 2026' },
    { _id: 2, title: 'Architecture Board Exam — Comprehensive Review', subj: 'Building Technology', date: 'Apr 8, 2026' },
    { _id: 3, title: 'Civil Engineering — Hydraulics & Geotechnics', subj: 'Hydraulics Engineering', date: 'Apr 3, 2026' },
    { _id: 4, title: 'Architecture Licensure Exam — Practice Set B', subj: 'Architectural Design', date: 'Apr 1, 2026' },
  ]);
  const [loading, setLoading] = useState(true);
  const [activeDepartment, setActiveDepartment] = useState(null);

  // === Data Fetching ===
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes] = await Promise.all([
          fetch('/api/catalog/departments'), // Adjust URL if necessary
          fetch('/api/catalog/programs')
        ]);
        const deptData = await deptRes.json();
        const progData = await progRes.json();

        const depts = deptData.departments || [];
        const progs = progData.programs || [];

        setDepartments(depts);
        setPrograms(progs);

        // Set the first active tab
        if (depts.length > 0) {
          setActiveDepartment(depts[0]._id);
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading catalog data:", error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Filter programs 
  const filteredPrograms = activeDepartment
    ? programs.filter(prog => prog.department?._id === activeDepartment)
    : [];

  return (
    <div className="bark-theme">
      {/* Main content wrapper handles global maxWidth and padding */}
      <main className="landing-main">
        
        {/* --- 1. SCHOOLS OF NU LAGUNA SECTION --- */}
        <section className="schools-section">
          <h2>Schools of NU Laguna</h2>
          
          {/* Tabs Container */}
          <div className="tab-headers">
            {departments.map(dept => (
              <div
                key={dept._id}
                onClick={() => setActiveDepartment(dept._id)}
                className={`tab-header ${activeDepartment === dept._id ? 'active' : ''}`}
              >
                {dept.name}
              </div>
            ))}
          </div>

          {/* Tab Content (Filtered Program Cards) */}
          <div className="tab-content">
            {loading ? <p>Loading courses...</p> : (
              <div className="program-grid">
                {filteredPrograms.map(prog => (
                  <div key={prog._id} className="program-card">
                    {/* Using a pseudo-element in CSS instead of 🟡 */}
                    <strong>{prog.code}</strong> {prog.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* --- 2. AVAILABLE MOCK BOARD EXAMS SECTION --- */}
        <section className="exams-section">
          <header className="exams-header">
            <h2>Available Mock Board Exams</h2>
            <button className="see-all-btn">See All</button>
          </header>
          
          <div className="exam-list">
            {exams.map(exam => (
              <div key={exam._id} className="exam-row">
                <div className="exam-details">
                  <strong>{exam.title}</strong>
                  <p>{exam.subj}</p>
                </div>
                <div className="exam-status">
                  <span className="na-badge">N/A</span>
                  <span className="exam-date">{exam.date}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* --- 3. CTA BANNER (READY TO PASS) SECTION --- */}
        <div className="cta-banner">
          <div className="cta-text">
            <h3>Ready to Pass Your Board Exam?</h3>
            <p>Join hundreds of NU Laguna students and review smarter.</p>
            <div className="cta-buttons">
              <button className="primary-btn">Create An Account</button>
              <button className="secondary-btn">View Programs</button>
            </div>
          </div>
          {/* Ensure this file exists in your /public folder */}
          <img src="/nu-logo.png" 
          alt="NU Laguna Logo" 
          className="nu-logo-large" />
        </div>
      </main>

      {/* --- 4. FOOTER SECTION --- */}
      <footer className="landing-footer">
        <div className="footer-container">
          <div className="footer-left">
            <h3>Board Exam Review Kit</h3>
            <p className="copyright">© 2026 BARK - NU Laguna. All rights reserved.</p>
          </div>
          <div className="footer-right">
            <h3>Support</h3>
            <ul className="footer-links">
              <li>Help Center</li>
              <li>Privacy Policy</li>
              <li>Terms of Use</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;