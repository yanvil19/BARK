import React, { useEffect, useState } from 'react';
import '../styles/LandingPage.css';

const LandingPage = ({ onNavigate }) => {
  const navigate = onNavigate || (() => {});
  
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptRes, progRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
        ]);
        const deptData = await deptRes.json();
        const progData = await progRes.json();
        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setLoading(false);
      } catch (error) {
        console.error('Error loading landing page data:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // inside LandingPage component
const [exams, setExams] = useState([]); //

useEffect(() => {
  const fetchData = async () => {
    try {
      const [deptRes, progRes, examRes] = await Promise.all([
        fetch('http://localhost:5000/api/catalog/departments'),
        fetch('http://localhost:5000/api/catalog/programs'),
        fetch('http://localhost:5000/api/mock-board-exams'), // New call
      ]);
      
      const deptData = await deptRes.json();
      const progData = await progRes.json();
      const examData = await examRes.json(); // Data from your new controller

      setDepartments(deptData.departments || []);
      setPrograms(progData.programs || []);
      setExams(examData.exams || []); // Store the published exams[cite: 1]
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

  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });

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

          {exams.length > 0 ? (
    <div className="exams-container">
      {exams.map((exam) => (
        <div key={exam._id} className="exams-placeholder-card" style={{ textAlign: 'left', borderLeft: '4px solid #FFD700' }}>
          <p className="exams-placeholder-title" style={{ marginBottom: '8px' }}>
            {exam.title}
          </p>
          <div className="exams-placeholder-copy" style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
            <p><strong>Program:</strong> {exam.program?.name || 'N/A'}</p>
            <p><strong>Department:</strong> {exam.program?.department || 'NU Laguna'}</p>
            <p><strong>Date Published:</strong> {new Date(exam.updatedAt).toLocaleDateString()}</p>
          </div>
        </div>
      ))}
    </div>
  ) : (
          <div className="exams-placeholder-card">
            <p className="exams-placeholder-title">No active exams at the moment.</p>
            <p className="exams-placeholder-copy">
              Check back once the exam module is ready and approved for student use.
            </p>
            <p className="exams-placeholder-note">
              Sample exam entries and complex tables are intentionally hidden.
            </p>
          </div>
  )}
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
};

export default LandingPage;
