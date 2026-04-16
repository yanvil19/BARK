import '../styles/Navbar.css';

export default function Navbar({ me, route, onRoute, onLogout }) {
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
            onClick={() => onRoute('about')}
            disabled={route === 'about'}
          >
            About
          </button>
        )}

        {!me && (
          <button
            onClick={() => onRoute('Programs')}
            disabled={route === 'Programs'}
          >
            Programs
          </button>
        )}

        {!me && (
          <button
            onClick={() => onRoute('Mock Exams')}
            disabled={route === 'Mock Exams'}
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
            <span className="user-info">
              {me.name || me.email} ({me.role})
            </span>

            {me.profilePicture && (
              <img src={me.profilePicture} alt="pfp" />
            )}

            <button onClick={onLogout}>Logout</button>
          </>
        ) : (
          <span>Not logged in</span>
        )}
      </div>

    </header>
  );
}