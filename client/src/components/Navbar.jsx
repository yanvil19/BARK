import '../styles/components/Navbar.css';
import '../styles/components/ProfileModal.css';
import logo from '../assets/barklogo.png';
import { useEffect, useRef, useState } from 'react';
import ProfileModal from './ProfileModal.jsx';
import ChangeCredentialsModal from './ChangeCredentialsModal.jsx';

export default function Navbar({ me, route, onRoute, onLogout, onMeRefresh }) {
  const [open, setOpen] = useState(false);
  const [changeCredsOpen, setChangeCredsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (me || route !== 'Dashboard') {
      setActiveSection('');
      return;
    }

    const sections = ['about', 'programs', 'mock-exams'];
    const observers = sections.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveSection(id);
        },
        { threshold: 0.1, rootMargin: '0px 0px -60% 0px' }
      );

      observer.observe(el);
      return observer;
    });

    return () => observers.forEach((obs) => obs?.disconnect());
  }, [me, route]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  function scrollToSection(sectionId) {
    const scrollWithOffset = () => {
      const target = document.getElementById(sectionId);
      if (!target) return;
      const headerHeight = document.getElementById('Header')?.offsetHeight || 0;
      const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 18;
      window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
    };

    if (route !== 'Dashboard') {
      onRoute('Dashboard');
      setTimeout(scrollWithOffset, 100);
      return;
    }
    scrollWithOffset();
  }

  function navigate(routeName) {
    onRoute(routeName);
    setMobileMenuOpen(false);
  }

  const isSuperAdmin = me?.role === 'super_admin';
  const isDean = me?.role === 'dean';
  const isChair = me?.role === 'program_chair';
  const isProfessor = me?.role === 'professor';
  const isStudent = me?.role === 'student';
  const isAlumni = me?.role === 'alumni';
  const isLearner = isStudent || isAlumni;

  const getInitials = (name = '') => {
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  // Shared nav links builder for both desktop and mobile
  const renderNavLinks = (isMobile = false) => {
    const cls = (r) =>
      isMobile
        ? `mobile-nav-item${route === r ? ' active' : ''}`
        : route === r ? 'active' : '';

    const handle = (r) => isMobile ? () => navigate(r) : () => onRoute(r);

    return (
      <>
        {me && (
          <button className={cls('Dashboard')} onClick={handle('Dashboard')}>
            Dashboard
          </button>
        )}

        {/* {me && !isLearner && !isDean && (
          <button className={cls('student')} onClick={handle('student')}>
            Student Register
          </button>
        )} */}

        {isDean && (
          <>
            <button className={cls('studentManager')} onClick={handle('studentManager')}>Student Register</button>
            <button className={cls('deanTags')} onClick={handle('deanTags')}>Manage Subject</button>
            <button className={cls('deanQuestions')} onClick={handle('deanQuestions')}>Create Questions</button>
            <button className={cls('deanQuestionApprovals')} onClick={handle('deanQuestionApprovals')}>Approve Questions</button>
            <button className={cls('mockBoardExam')} onClick={handle('mockBoardExam')}>Create Exams</button>
            <button className={cls('availableMockBoardExams')} onClick={handle('availableMockBoardExams')}>Board Exams</button>
            <button className={cls('examResults')} onClick={handle('examResults')}>Exam Results</button>
          </>
        )}

        {isChair && (
          <>
            <button className={cls('pcStudentManager')} onClick={handle('pcStudentManager')}>Student Register</button>
            <button className={cls('chairTags')} onClick={handle('chairTags')}>Manage Subjects</button>
            <button className={cls('chairQuestions')} onClick={handle('chairQuestions')}>My Questions</button>
            <button className={cls('chairQuestionApprovals')} onClick={handle('chairQuestionApprovals')}>Approve Questions</button>
            <button className={cls('chairCheatingLogs')} onClick={handle('chairCheatingLogs')}>Logs</button>
            <button className={cls('pcMockBoardExam')} onClick={handle('pcMockBoardExam')}>Create Exams</button>
            <button className={cls('pcAvailableMockBoardExams')} onClick={handle('pcAvailableMockBoardExams')}>Board Exams</button>
            <button className={cls('pcExamResults')} onClick={handle('pcExamResults')}>Exam Results</button>
          </>
        )}

        {isProfessor && (
          <button className={cls('profQuestions')} onClick={handle('profQuestions')}>My Questions</button>
        )}

        {isSuperAdmin && (
          <>
            <button className={cls('schoolsPrograms')} onClick={handle('schoolsPrograms')}>Schools and Programs</button>
            <button className={cls('adminUsers')} onClick={handle('adminUsers')}>User Management</button>
            <button className={cls('adminSettings')} onClick={handle('adminSettings')}>Settings</button>
          </>
        )}

        {isStudent && (
          <>
            <button className={cls('studentAvailableExams')} onClick={handle('studentAvailableExams')}>
              Available Exams
            </button>
            <button className={cls('studentExamResults')} onClick={handle('studentExamResults')}>
              Exam Results
            </button>
          </>
        )}

        {isAlumni && (
          <>
            <button className={cls('alumniAvailableExams')} onClick={handle('alumniAvailableExams')}>
              Available Exams
            </button>
            <button className={cls('alumniExamResults')} onClick={handle('alumniExamResults')}>
              Exam Results
            </button>
          </>
        )}

        {!me && (
          <>
            <button
              className={isMobile ? `mobile-nav-item${activeSection === 'about' ? ' active' : ''}` : activeSection === 'about' ? 'nav-active' : ''}
              onClick={() => { scrollToSection('about'); if (isMobile) setMobileMenuOpen(false); }}
            >
              About
            </button>
            <button
              className={isMobile ? `mobile-nav-item${activeSection === 'programs' ? ' active' : ''}` : activeSection === 'programs' ? 'nav-active' : ''}
              onClick={() => { scrollToSection('programs'); if (isMobile) setMobileMenuOpen(false); }}
            >
              Programs
            </button>
            <button
              className={isMobile ? `mobile-nav-item${activeSection === 'mock-exams' ? ' active' : ''}` : activeSection === 'mock-exams' ? 'nav-active' : ''}
              onClick={() => { scrollToSection('mock-exams'); if (isMobile) setMobileMenuOpen(false); }}
            >
              Mock Exams
            </button>
            <button
              className={isMobile ? `mobile-nav-item${route === 'Register' ? ' active' : ''}` : route === 'Register' ? 'active' : ''}
              onClick={() => { onRoute('Register'); if (isMobile) setMobileMenuOpen(false); }}
            >
              Register
            </button>
          </>
        )}
      </>
    );
  };

  return (
    <header id="Header">
      {/* LEFT — BARK Logo */}
      <div className="nav-left">
        <div className="logo-container" onClick={() => onRoute('Dashboard')}>
          <img src={logo} alt="BARK Logo" className="header-logo" />
          <strong>BARK</strong>
        </div>
      </div>

      {/* CENTER — Desktop nav links */}
      <nav className="nav-center">
        {renderNavLinks(false)}
      </nav>

      {/* RIGHT — Avatar + Hamburger */}
      <div className="nav-right" ref={wrapperRef}>
        {me ? (
          <div className="profile-wrapper">
            <div className="profile-icon avatar-initials" onClick={() => setOpen(!open)}>
              {getInitials(me.name)}
            </div>
            {open && (
              <ProfileModal
                me={me}
                onLogout={onLogout}
                onOpenChangeCredentials={() => {
                  setOpen(false);
                  setChangeCredsOpen(true);
                }}
              />
            )}
          </div>
        ) : (
          <button className={route === 'login' ? 'active' : ''} onClick={() => onRoute('login')}>
            Login
          </button>
        )}

        {/* Hamburger — only visible on tablet/phone via CSS */}
        <button
          type="button"
          className={`hamburger${mobileMenuOpen ? ' open' : ''}`}
          aria-label="Toggle navigation menu"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>

      {/* MOBILE DROPDOWN — nav links only */}
      {mobileMenuOpen && (
        <div className="mobile-menu">
          <nav className="mobile-nav">
            {renderNavLinks(true)}
          </nav>
        </div>
      )}

      {me && (
        <ChangeCredentialsModal
          open={changeCredsOpen}
          onClose={() => setChangeCredsOpen(false)}
          me={me}
          onUpdated={onMeRefresh}
        />
      )}
    </header>
  );
}
