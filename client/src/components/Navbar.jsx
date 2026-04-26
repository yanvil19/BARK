import '../styles/Navbar.css';
import '../styles/ProfileModal.css';
import { useState, useRef, useEffect } from 'react';
import ProfileModal from './ProfileModal.jsx';

export default function Navbar({ me, route, onRoute, onLogout }) {

  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const wrapperRef = useRef(null);
  const canSeeDashboard = ['super_admin', 'program_chair', 'dean'].includes(me?.role);

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

  return (
    <header id="Header">

      <div className="nav-left">
        <strong onClick={() => onRoute('Dashboard')}>BARK</strong>
      </div>

      <nav className="nav-center">
        
        {(isSuperAdmin || isChair) && (
          <button
            className={route === 'Dashboard' ? 'active' : ''}
            onClick={() => onRoute('Dashboard')}
          >
            Dashboard
          </button>
        )}


        {me && me.role !== 'student' && (
          <button className={route === 'student' ? 'active' : ''} onClick={() => onRoute('student')}>
            Student Register
          </button>
        )}

        {isDean && (
          <button
            className={route === 'dean' ? 'active' : ''}
            onClick={() => onRoute('dean')}
          >
            Dean Approvals
          </button>
        )}

        {isSuperAdmin && (
          <>
            <button
              className={route === 'adminCatalog' ? 'active' : ''}
              onClick={() => onRoute('adminCatalog')}
            >
              Admin Catalog
            </button>

            <button
              className={route === 'adminUsers' ? 'active' : ''}
              onClick={() => onRoute('adminUsers')}
            >
              User Management
            </button>
          </>
        )}

        {!me && (
          <button
            className={route === 'login' ? 'active' : ''}
            onClick={() => onRoute('login')}
          >
            Login
          </button>
        )}

      </nav>

      <div className="nav-right" ref={wrapperRef}>

        {me ? (
          <div className="profile-wrapper">

            <img
              src={me.profilePicture || 'https://static.vecteezy.com/system/resources/previews/036/280/651/non_2x/default-avatar-profile-icon-social-media-user-image-gray-avatar-icon-blank-profile-silhouette-illustration-vector.jpg'}
              alt="profile"
              className="profile-icon"
              onClick={() => setOpen(!open)}
            />
            {open && (
              <ProfileModal me={me} onLogout={onLogout} />
            )}

          </div>
        ) : (
          <button onClick={() => onRoute('login')}>
            Login
          </button>
        )}

      </div>

    </header>
  );
}