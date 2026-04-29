import '../styles/Navbar.css';
import '../styles/ProfileModal.css';
import { useEffect, useRef, useState } from 'react';
import ProfileModal from './ProfileModal.jsx';

export default function Navbar({ me, route, onRoute, onLogout }) {
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
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
          if (entry.isIntersecting) {
            setActiveSection(id);
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -60% 0px' }
      );

      observer.observe(el);
      return observer;
    });

    return () => {
      observers.forEach((obs) => obs?.disconnect());
    };
  }, [me, route]);

  function scrollToSection(sectionId) {
    if (route !== 'Dashboard') {
      onRoute('Dashboard');
      setTimeout(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' }), 100);
      return;
    }
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  }

  const isSuperAdmin = me?.role === 'super_admin';
  const isDean = me?.role === 'dean';
  const isChair = me?.role === 'program_chair';
  const isProfessor = me?.role === 'professor';

  const getInitials = (name = '') => {
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  };

  return (
    <header id="Header">
      <div className="nav-left">
        <strong onClick={() => onRoute('Dashboard')}>BARK</strong>
      </div>

      <nav className="nav-center">
        {(isSuperAdmin || isChair) && (
          <button className={route === 'Dashboard' ? 'active' : ''} onClick={() => onRoute('Dashboard')}>
            Dashboard
          </button>
        )}

        {me && me.role !== 'student' && (
          <button className={route === 'student' ? 'active' : ''} onClick={() => onRoute('student')}>
            Student Register
          </button>
        )}

        {isDean && (
          <>
            <button className={route === 'dean' ? 'active' : ''} onClick={() => onRoute('dean')}>
              Approvals
            </button>
            <button className={route === 'deanQuestions' ? 'active' : ''} onClick={() => onRoute('deanQuestions')}>
              My Questions
            </button>
            <button className={route === 'deanTags' ? 'active' : ''} onClick={() => onRoute('deanTags')}>
              Manage Subjects
            </button>
            <button className={route === 'mockBoardExam' ? 'active' : ''} onClick={() => onRoute('mockBoardExam')}>
              Mock Board Exam
            </button>
            <button
              className={route === 'availableMockBoardExams' ? 'active' : ''}
              onClick={() => onRoute('availableMockBoardExams')}
            >
              Available Mock Board Exams
            </button>
          </>
        )}

        {isChair && (
          <>
            <button className={route === 'chairTags' ? 'active' : ''} onClick={() => onRoute('chairTags')}>
              Manage Subjects
            </button>
            <button className={route === 'chairQuestions' ? 'active' : ''} onClick={() => onRoute('chairQuestions')}>
              My Questions
            </button>
            <button className={route === 'chairApprovals' ? 'active' : ''} onClick={() => onRoute('chairApprovals')}>
              Approve Questions
            </button>
          </>
        )}

        {isProfessor && (
          <button className={route === 'profQuestions' ? 'active' : ''} onClick={() => onRoute('profQuestions')}>
            My Questions
          </button>
        )}

        {isSuperAdmin && (
          <>
            <button className={route === 'schoolsPrograms' ? 'active' : ''} onClick={() => onRoute('schoolsPrograms')}>
              Schools and Programs
            </button>
            <button className={route === 'adminUsers' ? 'active' : ''} onClick={() => onRoute('adminUsers')}>
              User Management
            </button>
          </>
        )}

        {!me && (
          <>
            <button className={activeSection === 'about' ? 'nav-active' : ''} onClick={() => scrollToSection('about')}>
              About
            </button>
            <button className={activeSection === 'programs' ? 'nav-active' : ''} onClick={() => scrollToSection('programs')}>
              Programs
            </button>
            <button className={activeSection === 'mock-exams' ? 'nav-active' : ''} onClick={() => scrollToSection('mock-exams')}>
              Mock Exams
            </button>
            <button className={route === 'Register' ? 'active' : ''} onClick={() => onRoute('Register')}>
              Register
            </button>
          </>
        )}
      </nav>

      <div className="nav-right" ref={wrapperRef}>
        {me ? (
          <div className="profile-wrapper">
            <div className="profile-icon avatar-initials" onClick={() => setOpen(!open)}>
              {getInitials(me.name)}
            </div>
            {open && <ProfileModal me={me} onLogout={onLogout} />}
          </div>
        ) : (
          <button className={route === 'login' ? 'active' : ''} onClick={() => onRoute('login')}>
            Login
          </button>
        )}
      </div>
    </header>
  );
}
