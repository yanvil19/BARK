import React, { useEffect, useState, useRef, useCallback } from 'react';
import '../styles/LandingPage.css';

/* ── Scroll Reveal Hook ────────────────────────────────────── */
function useScrollReveal(options = {}) {
  const refs = useRef([]);
  const observerRef = useRef(null);
  
  const addRef = useCallback((el) => {
    if (el && !refs.current.includes(el)) {
      refs.current.push(el);
      // If observer is ready, observe this new element immediately
      if (observerRef.current) {
        observerRef.current.observe(el);
      }
    }
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px', ...options }
    );
    
    observerRef.current = observer;
    refs.current.forEach((el) => observer.observe(el));
    
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [options]);

  return addRef;
}

/* ── Marquee items (duplicated for seamless loop) ─────────── */
const MARQUEE_ITEMS = [
  'Board Exam Ready', '·', 'Faculty-Curated', '·',
  'NU Laguna', '·', 'Mock Exams', '·', 'Smart Analytics', '·',
  'Role-Based Access', '·', 'BARK Platform', '·',
];
const MARQUEE_DOUBLE = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS];

/* ══════════════════════════════════════════════════════════
   LandingPage Component
   ══════════════════════════════════════════════════════════ */
const LandingPage = ({ onNavigate }) => {
  const navigate = onNavigate || (() => {});
  const revealRef = useScrollReveal();

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [exams, setExams] = useState([]);

  /* ── Theme ── */
  useEffect(() => {
    document.documentElement.classList.add('landing-theme');
    return () => document.documentElement.classList.remove('landing-theme');
  }, []);

  /* ── Data Fetch ── */
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Starting fetch...');
        const [deptRes, progRes, examRes] = await Promise.all([
          fetch('http://localhost:5000/api/catalog/departments'),
          fetch('http://localhost:5000/api/catalog/programs'),
          fetch('http://localhost:5000/api/mock-board-exams/public'),
        ]);
        
        console.log('Fetch responses:', { deptRes, progRes, examRes });
        
        if (!deptRes.ok) throw new Error(`Dept fetch failed: ${deptRes.status}`);
        if (!progRes.ok) throw new Error(`Programs fetch failed: ${progRes.status}`);
        if (!examRes.ok) throw new Error(`Exams fetch failed: ${examRes.status}`);
        
        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const examData = await examRes.json();
        
        console.log('Fetched data:', { deptData, progData, examData });
        
        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setExams(examData.exams || []);
      } catch (error) {
        console.error('Error loading landing page data:', error);
      } finally {
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

  /* ── Derived ── */
  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(activeDepartmentId);
  });

  const activeDepartment = departments.find(
    (dept) => String(dept._id) === String(activeDepartmentId)
  );

  const visibleProgramCodes = filteredPrograms
    .map((prog) => prog.code)
    .filter(Boolean)
    .slice(0, 6);

  const programsById = new Map(programs.map((prog) => [String(prog._id), prog]));

  const resolveExamProgram = (exam) => {
    const rawProgram = exam.program && typeof exam.program === 'object' ? exam.program : null;
    const rawProgramId = String(rawProgram?._id || exam.program || '');
    if (rawProgramId && programsById.has(rawProgramId)) return programsById.get(rawProgramId);
    const normalizedName = String(rawProgram?.name || '').trim().toLowerCase();
    const normalizedCode = String(rawProgram?.code || '').trim().toLowerCase();
    return programs.find((prog) => {
      const sameName = normalizedName && String(prog.name || '').trim().toLowerCase() === normalizedName;
      const sameCode = normalizedCode && String(prog.code || '').trim().toLowerCase() === normalizedCode;
      return sameName || sameCode;
    }) || rawProgram;
  };

  const featuredExams = exams.slice(0, 7);

  return (
    <div className="landing-wrapper">

      {/* ══ HERO ══════════════════════════════════════════════ */}
      <header className="hero-main">
        <div className="hero-accent-bar" aria-hidden="true" />
        <div className="hero-inner">
          <h2 className="hero-subtitle">Engineered for Excellence.</h2>
          <h1 className="hero-title">Built for Board&nbsp;Success.</h1>
          <p className="hero-description">
            Prepare with faculty-validated content, adaptive quizzes,
            and real-time performance insights — all in one platform.
          </p>
          <div className="hero-buttons">
            <button className="btn-login-yellow" onClick={() => navigate('login')}>
              Login
            </button>
            <button
              className="btn-learn-more-outline"
              onClick={() => {
                document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Learn More
            </button>
          </div>
        </div>

        {/* Scroll cue */}
        <div className="hero-scroll-cue" aria-hidden="true">
          <span>Scroll</span>
          <div className="hero-scroll-line" />
        </div>
      </header>

      {/* ══ STATS BAR ═════════════════════════════════════════ */}
      <div className="hero-stats-bar" aria-label="Platform highlights">
        {[
          { value: '100%', label: 'Faculty-Validated' },
          { value: '3+',   label: 'Schools Supported' },
          { value: '3',    label: 'Roles Supported' },
        ].map(({ value, label }) => (
          <div className="hero-stat-item" key={label}>
            <span className="hero-stat-value">{value}</span>
            <span className="hero-stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ══ ABOUT ═════════════════════════════════════════════ */}
      <section id="about" className="about-section">
        <div className="about-content">

          <div className="about-left reveal reveal-left" ref={revealRef}>
            <div className="about-eyebrow">
              <span className="about-eyebrow-line" aria-hidden="true" />
              <h4 className="about-subtitle">What is BARK?</h4>
            </div>
            <h2 className="about-title">
              <span className="text-yellow">Your Personal</span><br />
              <span className="text-white">Review Platform</span>
            </h2>
            <p className="about-para">
              Board Exam &amp; Review Kit (BARK), the Board Exam Reviewer for NU Laguna — is a
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
            {[
              { icon: '📋', title: 'Faculty-Curated Content',   desc: 'Every question is created, reviewed, and approved by the Faculty.' },
              { icon: '🧠', title: 'Adaptive Mock Exams',       desc: 'Simulate the real board experience with timed, full-length mock exams tailored per program.' },
              { icon: '📊', title: 'AI-Powered Analytics',      desc: 'Personalized feedback highlights your strengths, gaps, and areas needing focus.' },
              { icon: '🔒', title: 'Role-Based Access',         desc: 'Separate dashboards and tools for students, faculty, and administrators.' },
            ].map(({ icon, title, desc }, i) => (
              <div
                key={title}
                className={`feature-card reveal delay-${i + 1}`}
                ref={revealRef}
              >
                <div className="feature-icon">{icon}</div>
                <div className="feature-text">
                  <h5>{title}</h5>
                  <p>{desc}</p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ══ CONTENT WRAP ══════════════════════════════════════ */}
      <div className="landing-content-wrap">

        {/* ── Schools Panel ── */}
        <section id="programs" className="schools-panel">
          <header className="schools-header">
            <div className="schools-header-left">
              <span className="schools-header-label">Schools of NU LAGUNA</span>
            </div>
            <span className="schools-header-tag">Supported Programs</span>
          </header>

          {loading ? (
            <p className="schools-feedback">Loading…</p>
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
                      className={`schools-tab${isActive ? ' active' : ''}`}
                      onClick={() => setActiveDepartmentId(String(dept._id))}
                    >
                      <span className="schools-tab-name desktop-only">{dept.name}</span>
                      <span className="schools-tab-name mobile-only">{dept.code || dept.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="schools-body">
                {/* Spotlight */}
                <aside className="schools-spotlight reveal reveal-left" ref={revealRef}>
                  <span className="schools-spotlight-kicker">Selected School</span>
                  <h3 className="schools-spotlight-title">
                    {activeDepartment?.name || 'School Overview'}
                  </h3>
                  {activeDepartment?.code && (
                    <span className="schools-spotlight-code">{activeDepartment.code}</span>
                  )}
                  <div className="schools-spotlight-stat">
                    <span className="schools-spotlight-value">{filteredPrograms.length}</span>
                    <span className="schools-spotlight-label">
                      {filteredPrograms.length === 1 ? 'Program Available' : 'Programs Available'}
                    </span>
                  </div>
                  {visibleProgramCodes.length > 0 && (
                    <div className="schools-spotlight-codes" aria-label="Program codes">
                      {visibleProgramCodes.map((code) => (
                        <span key={code} className="schools-spotlight-pill">{code}</span>
                      ))}
                    </div>
                  )}
                </aside>

                {/* Programs Grid */}
                <div className="schools-programs-panel reveal reveal-right" ref={revealRef}>
                  <div className="schools-programs">
                    {filteredPrograms.length === 0 ? (
                      <p className="schools-feedback">No programs available for this department yet.</p>
                    ) : (
                      filteredPrograms.map((prog) => (
                        <article key={prog._id} className="schools-program-card">
                          <span className="schools-program-dot" aria-hidden="true" />
                          <div className="schools-program-info">
                            <p className="schools-program-name">{prog.name}</p>
                            {prog.code && (
                              <span className="schools-program-code">{prog.code}</span>
                            )}
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── Exams Panel ── */}
        <section id="mock-exams" className="exams-panel">
          <div className="exams-section-header reveal" ref={revealRef}>
            <div>
              <span className="exams-section-label">Practice Materials</span>
              <h2 className="exams-section-title">
                Available <span>Mock Board Exams</span>
              </h2>
            </div>
          </div>

          {loading ? (
            <div className="exams-placeholder-card">
              <p className="exams-placeholder-title">Loading available exams…</p>
              <p className="exams-placeholder-copy">
                We&apos;re pulling the latest published mock board exams right now.
              </p>
            </div>
          ) : featuredExams.length > 0 ? (
            <div className="exams-list reveal" ref={revealRef}>
              {featuredExams.map((exam) => {
                const programDetails = resolveExamProgram(exam);
                const schoolLabel = programDetails?.department?.code
                  ? String(programDetails.department.code).toUpperCase()
                  : programDetails?.department?.name || '';
                const programLabel =
                  exam.program?.name ||
                  programDetails?.name ||
                  exam.program?.code ||
                  programDetails?.code ||
                  'Program';

                return (
                  <article key={exam._id} className="exam-row">
                    <div className="exam-row-copy">
                      <p className="exam-row-title">{exam.name}</p>
                      <p className="exam-row-program">{programLabel}</p>
                    </div>
                    {schoolLabel && (
                      <span className="exam-school-pill">{schoolLabel}</span>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="exams-placeholder-card">
              <p className="exams-placeholder-title">No active exams at the moment.</p>
              <p className="exams-placeholder-copy">
                Check back once new board exam sets are published for students.
              </p>
            </div>
          )}

          {/* CTA Banner */}
          <section className="exam-cta-banner reveal" ref={revealRef} aria-label="Board exam call to action">
            <div className="exam-cta-content">
              <span className="exam-cta-kicker">Start Strong</span>
              <h3 className="exam-cta-title">Ready to Pass Your Board&nbsp;Exam?</h3>
              <p className="exam-cta-copy">
                Join hundreds of NU Laguna students and review smarter — not harder.
              </p>
              <div className="exam-cta-actions">
                <button type="button" className="exam-cta-primary" onClick={() => navigate('Register')}>
                  Create An Account
                </button>
                <button
                  type="button"
                  className="exam-cta-secondary"
                  onClick={() => {
                    document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  View Programs
                </button>
              </div>
            </div>
            <div className="exam-cta-watermark" aria-hidden="true">BARK</div>
          </section>
        </section>

        {/* ── Marquee Ticker ── */}
        <div className="landing-marquee-bar" aria-hidden="true">
          <div className="landing-marquee-track">
            {MARQUEE_DOUBLE.map((item, i) => (
              <span key={i} className={item === '·' ? 'dot' : undefined}>{item}</span>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default LandingPage;