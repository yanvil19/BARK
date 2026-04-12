import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import StudentRegister from './pages/StudentRegister.jsx';
import DeanApprovals from './pages/DeanApprovals.jsx';
import AdminCatalog from './pages/AdminCatalog.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import { apiAuth, getToken, setToken } from './lib/api.js';

export default function App() {
  const [route, setRoute] = useState('home');
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState('');

  async function refreshMe() {
    const token = getToken();
    if (!token) {
      setMe(null);
      return;
    }
    setMeError('');
    try {
      const data = await apiAuth('/api/auth/me');
      setMe(data);
    } catch (err) {
      setMe(null);
      setMeError(err.message || 'Failed to load profile');
    }
  }

  useEffect(() => {
    refreshMe();
  }, []);

  function handleLogin(token) {
    setToken(token);
    refreshMe();
    setRoute('home');
  }

  useEffect(() => {
    if (me && route === 'login') setRoute('home');
  }, [me, route]);

  useEffect(() => {
    if (me?.role === 'student' && route === 'student') setRoute('home');
  }, [me, route]);

  function handleLogout() {
    setToken('');
    setMe(null);
    setRoute('home');
  }

  let page = null;
  if (route === 'home') page = <Home />;
  if (route === 'login') page = <Login onLogin={handleLogin} />;
  if (route === 'student') page = <StudentRegister onNavigate={setRoute} />;
  if (route === 'dean') page = <DeanApprovals />;
  if (route === 'adminCatalog') page = <AdminCatalog />;
  if (route === 'adminUsers') page = <AdminUsers />;

  return (
    <div>
      <Navbar me={me} route={route} onRoute={setRoute} onLogout={handleLogout} />
      {meError ? <p>{meError}</p> : null}
      {page}
    </div>
  );
}
