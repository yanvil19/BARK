import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
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

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const getValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const isExamCurrentlyOpen = (exam, now = new Date()) => {
  const start = getValidDate(exam.startDateTime);
  const end = getValidDate(exam.endDateTime);
  const isPublishedStatus = ['published', 'ongoing'].includes(exam.status);
  return Boolean(isPublishedStatus && start && end && start <= now && now < end);
};

const formatDateTime = (value) => {
  const date = getValidDate(value);
  return date ? DATE_TIME_FORMATTER.format(date) : 'Schedule pending';
};

const getFocusableElements = (container) => {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
};

function PublishedExamsWelcomeModal({ open, onClose, groups, examCount, onLogin }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);
  const titleId = 'published-exams-modal-title';

  // Transition and Mount states
  const [shouldRender, setShouldRender] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const [activeDeptKey, setActiveDeptKey] = useState('');
  const [displayDeptKey, setDisplayDeptKey] = useState('');
  const [isChangingDept, setIsChangingDept] = useState(false);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      setIsClosing(false);
    } else if (shouldRender) {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
        setIsClosing(false);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, shouldRender]);

  useEffect(() => {
    if (activeDeptKey) {
      if (!displayDeptKey) {
        setDisplayDeptKey(activeDeptKey);
      } else if (activeDeptKey !== displayDeptKey) {
        setIsChangingDept(true);
        const timer = setTimeout(() => {
          setDisplayDeptKey(activeDeptKey);
          setIsChangingDept(false);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [activeDeptKey, displayDeptKey]);

  // Drag-to-scroll refs
  const tabsRef = useRef(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeftState = useRef(0);
  const dragDistance = useRef(0);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    startX.current = e.pageX - (tabsRef.current?.offsetLeft || 0);
    scrollLeftState.current = tabsRef.current?.scrollLeft || 0;
    dragDistance.current = 0;
  };

  const handleMouseLeave = () => {
    isDragging.current = false;
  };

  const handleMouseUp = () => {
    // Small delay to ensure the dragDistance value is preserved for click handler resolution
    setTimeout(() => {
      isDragging.current = false;
    }, 0);
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current || !tabsRef.current) return;
    e.preventDefault();
    const x = e.pageX - tabsRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    tabsRef.current.scrollLeft = scrollLeftState.current - walk;
    dragDistance.current = Math.abs(x - startX.current);
  };

  useEffect(() => {
    if (open && groups.length > 0) {
      if (!activeDeptKey || !groups.some((g) => g.key === activeDeptKey)) {
        setActiveDeptKey(groups[0].key);
      }
    }
  }, [open, groups, activeDeptKey]);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialogRef.current);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;

      const previouslyFocused = previouslyFocusedRef.current;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [onClose, open]);

  if (!shouldRender || groups.length === 0 || typeof document === 'undefined') return null;

  const activeGroup = groups.find((g) => g.key === displayDeptKey || g.key === activeDeptKey) || groups[0];

  return createPortal(
    <div
      className={`published-exams-modal-backdrop${isClosing ? ' is-closing' : ''}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={`published-exams-modal${isClosing ? ' is-closing' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="published-exams-modal-header">
          <div>
            <span className="published-exams-modal-kicker">Currently open</span>
            <h2 id={titleId} className="published-exams-modal-title">
              Published Mock Board Exams
            </h2>
            <p className="published-exams-modal-copy">
              {examCount} {examCount === 1 ? 'exam is' : 'exams are'} open for students right now.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="published-exams-modal-close"
            onClick={onClose}
            aria-label="Close published exams bulletin"
          >
            &times;
          </button>
        </header>

        {groups.length > 1 && (
          <div
            ref={tabsRef}
            className="published-exams-modal-tabs"
            role="tablist"
            aria-label="Departments"
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeave}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
          >
            {groups.map((dept) => {
              const isActive = dept.key === activeDeptKey;
              return (
                <button
                  key={dept.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`published-exams-modal-tab${isActive ? ' active' : ''}`}
                  onClick={(e) => {
                    if (dragDistance.current > 5) {
                      e.preventDefault();
                      return;
                    }
                    setActiveDeptKey(dept.key);
                  }}
                >
                  <span className="desktop-only">{dept.name}</span>
                  <span className="mobile-only">{dept.code || dept.name}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={`published-exams-modal-body${isChangingDept ? ' is-transitioning' : ''}`}>
          {activeGroup && (
            <section className="published-exams-department" key={activeGroup.key}>
              <div className="published-exams-department-heading">
                <span className="published-exams-department-name">{activeGroup.name}</span>
                {activeGroup.code && (
                  <span className="exam-school-pill">{activeGroup.code}</span>
                )}
              </div>

              <div className="published-exams-programs">
                {activeGroup.programs.map((program) => (
                  <section className="published-exams-program" key={program.key}>
                    <h3 className="published-exams-program-title">
                      {program.name}
                      {program.code && <span>{program.code}</span>}
                    </h3>
                    <div className="published-exams-list">
                      {program.exams.map((exam) => (
                        <article className="published-exams-row" key={exam._id || exam.name}>
                          <div className="published-exams-row-left">
                            <h4 className="published-exams-row-title">{exam.name}</h4>
                            <div className="published-exams-row-meta">
                              <span className="published-exams-meta-item">
                                Started {formatDateTime(exam.startDateTime)}
                              </span>
                            </div>
                          </div>
                          <div className="published-exams-row-right">
                            <div className="published-exams-deadline-badge">
                              <span className="deadline-dot"></span>
                              <span>Closes {formatDateTime(exam.endDateTime)}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}
        </div>

        <footer className="published-exams-modal-footer">
          <button type="button" className="btn-login-yellow" onClick={onLogin}>
            Log in to answer
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════
   LandingPage Component
   ══════════════════════════════════════════════════════════ */
const LandingPage = ({ onNavigate }) => {
  const navigate = onNavigate || (() => { });
  const revealRef = useScrollReveal();

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [activeDepartmentId, setActiveDepartmentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exams, setExams] = useState([]);
  const [isExamModalOpen, setIsExamModalOpen] = useState(false);

  /* ── Theme ── */
  useEffect(() => {
    document.documentElement.classList.add('landing-theme');
    return () => document.documentElement.classList.remove('landing-theme');
  }, []);

  /* ── Data Fetch ── */
  useEffect(() => {
    const fetchData = async () => {
      try {
        setError('');
        const [deptRes, progRes, examRes] = await Promise.all([
          // [FIX 1 - REMOVE HARDCODED URL]
          fetch(`${import.meta.env.VITE_API_URL}/api/catalog/departments`),
          // [FIX 1 - REMOVE HARDCODED URL]
          fetch(`${import.meta.env.VITE_API_URL}/api/catalog/programs`),
          // [FIX 1 - REMOVE HARDCODED URL]
          fetch(`${import.meta.env.VITE_API_URL}/api/mock-board-exams/public`),
        ]);

        if (!deptRes.ok) throw new Error(`Dept fetch failed: ${deptRes.status}`);
        if (!progRes.ok) throw new Error(`Programs fetch failed: ${progRes.status}`);
        if (!examRes.ok) throw new Error(`Exams fetch failed: ${examRes.status}`);

        const deptData = await deptRes.json();
        const progData = await progRes.json();
        const examData = await examRes.json();

        setDepartments(deptData.departments || []);
        setPrograms(progData.programs || []);
        setExams(examData.exams || []);
      } catch (error) {
        console.error('Error loading landing page data:', error);
        setError(error?.message || 'Something went wrong. Please try again.');
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

  const [displayDeptId, setDisplayDeptId] = useState('');
  const [isChangingDept, setIsChangingDept] = useState(false);

  useEffect(() => {
    if (activeDepartmentId) {
      if (!displayDeptId) {
        setDisplayDeptId(activeDepartmentId);
      } else if (activeDepartmentId !== displayDeptId) {
        setIsChangingDept(true);
        const timer = setTimeout(() => {
          setDisplayDeptId(activeDepartmentId);
          setIsChangingDept(false);
        }, 150);
        return () => clearTimeout(timer);
      }
    }
  }, [activeDepartmentId, displayDeptId]);

  /* ── Derived ── */
  const filteredPrograms = programs.filter((prog) => {
    const deptId = String(prog.department?._id || prog.department || '');
    return deptId === String(displayDeptId || activeDepartmentId);
  });

  const activeDepartment = departments.find(
    (dept) => String(dept._id) === String(displayDeptId || activeDepartmentId)
  );

  const visibleProgramCodes = filteredPrograms
    .map((prog) => prog.code)
    .filter(Boolean)
    .slice(0, 6);

  const programsById = new Map(programs.map((prog) => [String(prog._id), prog]));
  const departmentsById = new Map(departments.map((dept) => [String(dept._id), dept]));

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

  const resolveExamDepartment = (exam, programDetails) => {
    const rawDepartment = exam.department && typeof exam.department === 'object' ? exam.department : null;
    const programDepartment = programDetails?.department && typeof programDetails.department === 'object'
      ? programDetails.department
      : null;
    const rawDepartmentId = String(
      rawDepartment?._id ||
      exam.department ||
      programDepartment?._id ||
      programDetails?.department ||
      ''
    );

    if (rawDepartmentId && departmentsById.has(rawDepartmentId)) return departmentsById.get(rawDepartmentId);
    return rawDepartment || programDepartment;
  };

  const featuredExams = exams.slice(0, 7);

  const openPublishedExams = useMemo(() => {
    const now = new Date();
    return exams
      .filter((exam) => isExamCurrentlyOpen(exam, now))
      .sort((a, b) => new Date(a.endDateTime) - new Date(b.endDateTime));
  }, [exams]);

  const groupedOpenExams = useMemo(() => {
    const departmentMap = new Map();

    openPublishedExams.forEach((exam) => {
      const programDetails = resolveExamProgram(exam);
      const departmentDetails = resolveExamDepartment(exam, programDetails);
      const departmentKey = String(departmentDetails?._id || exam.department || 'unknown-department');
      const programKey = String(programDetails?._id || exam.program || 'unknown-program');

      if (!departmentMap.has(departmentKey)) {
        departmentMap.set(departmentKey, {
          key: departmentKey,
          name: departmentDetails?.name || 'Department',
          code: departmentDetails?.code || '',
          programs: new Map(),
        });
      }

      const departmentGroup = departmentMap.get(departmentKey);
      if (!departmentGroup.programs.has(programKey)) {
        departmentGroup.programs.set(programKey, {
          key: programKey,
          name: programDetails?.name || 'Program',
          code: programDetails?.code || '',
          exams: [],
        });
      }

      departmentGroup.programs.get(programKey).exams.push(exam);
    });

    return Array.from(departmentMap.values()).map((department) => ({
      ...department,
      programs: Array.from(department.programs.values()),
    }));
  }, [openPublishedExams, programs, departments]);

  useEffect(() => {
    if (!loading && groupedOpenExams.length > 0) {
      setIsExamModalOpen(true);
    }
  }, [groupedOpenExams.length, loading]);

  const closePublishedExamsModal = useCallback(() => {
    setIsExamModalOpen(false);
  }, []);

  const handleExamModalLogin = useCallback(() => {
    setIsExamModalOpen(false);
    navigate('login');
  }, [navigate]);

  /* ── Interactive Grid Follow & 3D Tilt ── */
  const heroRef = useRef(null);
  const handleMouseMove = (e) => {
    if (!heroRef.current) return;
    const rect = heroRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Aura coordinates
    heroRef.current.style.setProperty('--mouse-x', `${x}px`);
    heroRef.current.style.setProperty('--mouse-y', `${y}px`);

    // 3D Tilt Calculation (Center based)
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const percentX = (x - centerX) / centerX; // -1 to 1
    const percentY = (y - centerY) / centerY; // -1 to 1

    // Max tilt of 6 degrees
    heroRef.current.style.setProperty('--rotate-x', `${-percentY * 6}deg`);
    heroRef.current.style.setProperty('--rotate-y', `${percentX * 6}deg`);
  };

  return (
    <div className="landing-wrapper">
      <PublishedExamsWelcomeModal
        open={isExamModalOpen && groupedOpenExams.length > 0}
        onClose={closePublishedExamsModal}
        groups={groupedOpenExams}
        examCount={openPublishedExams.length}
        onLogin={handleExamModalLogin}
      />

      {error && !loading ? (
        <div style={{ padding: '24px', textAlign: 'center' }} role="status">
          Something went wrong. Please try again.
        </div>
      ) : null}

      {/* ══ HERO ══════════════════════════════════════════════ */}
      <header className="hero-main" ref={heroRef} onMouseMove={handleMouseMove}>
        <div className="hero-static-bg" aria-hidden="true" />
        <div className="hero-grid-3d-wrapper" aria-hidden="true">
          <div className="hero-base-dots" />
          <div className="hero-interactive-grid" />
        </div>
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
          { value: '3+', label: 'Schools Supported' },
          { value: '3', label: 'Roles Supported' },
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
              { icon: '📋', title: 'Faculty-Curated Content', desc: 'Every question is created, reviewed, and approved by the Faculty.' },
              { icon: '🧠', title: 'Adaptive Mock Exams', desc: 'Simulate the real board experience with timed, full-length mock exams tailored per program.' },
              { icon: '📊', title: 'AI-Powered Analytics', desc: 'Personalized feedback highlights your strengths, gaps, and areas needing focus.' },
              { icon: '🔒', title: 'Role-Based Access', desc: 'Separate dashboards and tools for students, faculty, and administrators.' },
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

              <div className={`schools-body${isChangingDept ? ' is-transitioning' : ''}`}>
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
                Published <span>Mock Board Exams</span>
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
                    <div className="exam-row-left">
                      <h4 className="exam-row-title">{exam.name}</h4>
                      <div className="exam-row-info-meta">
                        <span className="exam-row-program">{programLabel}</span>
                        <span className="exam-row-meta-divider">&middot;</span>
                        <span className="exam-row-meta-item">
                          Started {formatDateTime(exam.startDateTime)}
                        </span>
                      </div>
                    </div>
                    <div className="exam-row-right">
                      <div className="exam-deadline-badge">
                        <span className="deadline-dot"></span>
                        <span>Closes {formatDateTime(exam.endDateTime)}</span>
                      </div>
                      {schoolLabel && (
                        <span className="exam-school-pill">{schoolLabel}</span>
                      )}
                    </div>
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
