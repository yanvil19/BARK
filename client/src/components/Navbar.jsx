import '../styles/Navbar.css';
import '../styles/ProfileModal.css';
import { useState, useRef, useEffect } from 'react';
import ProfileModal from './ProfileModal.jsx';

export default function Navbar({ me, route, onRoute, onLogout }) {

  const [open, setOpen] = useState(false);
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

  const isSuperAdmin = me?.role === 'super_admin';
  const isDean = me?.role === 'dean';

  return (
    <header id="Header">

      <div className="nav-left">
        <strong onClick={() => onRoute('Dashboard')}>BARK</strong>
      </div>

      <nav className="nav-center">

        {isSuperAdmin && (
          <button
            className={route === 'Dashboard' ? 'active' : ''}
            onClick={() => onRoute('Dashboard')}
          >
            Dashboard
          </button>
        )}

        {(!me || me.role !== 'student') && (
          <button
            className={route === 'student' ? 'active' : ''}
            onClick={() => onRoute('student')}
          >
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