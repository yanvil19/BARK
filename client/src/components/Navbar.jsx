export default function Navbar({ me, route, onRoute, onLogout }) {
  return (
    <header>
      <div>
        <strong>NU-BOARD</strong>
      </div>
      <nav>
        <button onClick={() => onRoute('home')} disabled={route === 'home'}>
          Home
        </button>{' '}
        {me?.role === 'student' ? null : (
          <button onClick={() => onRoute('student')} disabled={route === 'student'}>
            Student Register
          </button>
        )}{' '}
        {!me ? (
          <button onClick={() => onRoute('login')} disabled={route === 'login'}>
            Login
          </button>
        ) : null}{' '}
        {me?.role === 'dean' ? (
          <button onClick={() => onRoute('dean')} disabled={route === 'dean'}>
            Dean Approvals
          </button>
        ) : null}{' '}
        {me?.role === 'super_admin' ? (
          <>
            <button onClick={() => onRoute('adminCatalog')} disabled={route === 'adminCatalog'}>
              Admin Catalog
            </button>{' '}
            <button onClick={() => onRoute('adminUsers')} disabled={route === 'adminUsers'}>
              Admin Users
            </button>
          </>
        ) : null}
      </nav>
      <div>
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
      <hr />
    </header>
  );
}
