import { useState, useEffect } from 'react';
import '../styles/Navbar.css';

export default function Navbar({ me, route, onRoute, onLogout }) {
  const isSuperAdmin = me?.role === 'super_admin';
  const isDean = me?.role === 'dean';
  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    if (route !== 'Dashboard') {
      setActiveSection('');
      return;
    }

    const lastScrollY = { current: window.scrollY };  // ← use object to avoid stale closure

    const handleScroll = () => { lastScrollY.current = window.scrollY; };
    window.addEventListener('scroll', handleScroll);

    const sections = ['about', 'programs', 'mock-exams'];
    const observers = sections.map(id => {
      const el = document.getElementById(id);
      if (!el) return null;

      const observer = new IntersectionObserver(
        ([entry]) => {
          const scrollingUp = entry.boundingClientRect.top > 0;

          if (entry.isIntersecting) {
            setActiveSection(id);
          } else if (scrollingUp) {
            const idx = sections.indexOf(id);
            if (idx > 0) setActiveSection(sections[idx - 1]);
          }
        },
        { threshold: 0.1, rootMargin: '0px 0px -60% 0px' }
      );
      observer.observe(el);
      return observer;
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      observers.forEach(obs => obs?.disconnect());
    };
  }, [route]);

  return (
    <header id="Header">

      <div className="nav-left">
        <strong onClick={() => onRoute('Dashboard')}>BARK</strong>
      </div>

      <nav className="nav-center">

        {isSuperAdmin && (
          <button
            onClick={() => onRoute('Dashboard')}
            disabled={route === 'Dashboard'}
          >
            Dashboard
          </button>
        )}

        {isDean && (
          <button
            onClick={() => onRoute('dean')}
            disabled={route === 'dean'}
          >
            Dean Approvals
          </button>
        )}

        {isSuperAdmin && (
          <>
            <button
              onClick={() => onRoute('adminCatalog')}
              disabled={route === 'adminCatalog'}
            >
              Admin Catalog
            </button>

            <button
              onClick={() => onRoute('adminUsers')}
              disabled={route === 'adminUsers'}
            >
              User Management
            </button>
          </>
        )}

        {me && me.role !== 'student' && (
          <button
            onClick={() => onRoute('student')}
            disabled={route === 'student'}
          >
            Student Register
          </button>
        )}

        {!me && (
          <button
            className={activeSection === 'about' ? 'nav-active' : ''}
            onClick={() => {
              if (route !== 'Dashboard') {
                onRoute('Dashboard');
                setTimeout(() => document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }), 100);
              } else {
                document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            About
          </button>
        )}

        {!me && (
          <button
            className={activeSection === 'programs' ? 'nav-active' : ''}
            onClick={() => {
              if (route !== 'Dashboard') {
                onRoute('Dashboard');
                setTimeout(() => document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth' }), 100);
              } else {
                document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            Programs
          </button>
        )}

        {!me && (
          <button
            className={activeSection === 'mock-exams' ? 'nav-active' : ''}
            onClick={() => {
              if (route !== 'Dashboard') {
                onRoute('Dashboard');
                setTimeout(() => document.getElementById('mock-exams')?.scrollIntoView({ behavior: 'smooth' }), 100);
              } else {
                document.getElementById('mock-exams')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
          >
            Mock Exams
          </button>
        )}

        {!me && (
          <button
            onClick={() => onRoute('Register')}
            disabled={route === 'Register'}
          >
            Register
          </button>
        )}

        {!me && (
          <button
            onClick={() => onRoute('login')}
            disabled={route === 'login'}
          >
            Login
          </button>
        )}

      </nav>

      <div className="nav-right">
        {me ? (
          <>
            <button onClick={() => onRoute('account')} disabled={false}>
              {me.name} ({me.role})
            </button>{' '}
            <button onClick={onLogout}>Logout</button>
          </>
        ) : (
          <span>Not logged in</span>
        )}
      </div>

    </header>
  );
}