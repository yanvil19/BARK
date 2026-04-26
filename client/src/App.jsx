import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import StudentRegister from './pages/StudentRegister.jsx';
import DeanApprovals from './pages/DeanApprovals.jsx';
import SchoolsPrograms from './pages/SchoolsPrograms.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import UserAccount from './pages/UserAccount.jsx';
import ChairTags from './pages/ChairTags.jsx';
import ChairApprovals from './pages/ChairApprovals.jsx';
import ProfessorQuestions from './pages/ProfessorQuestions.jsx';
import ChairQuestions from './pages/ChairQuestions.jsx';
import DeanQuestions from './pages/DeanQuestions.jsx';
import { apiAuth, getToken, setToken } from './lib/api.js';
import Footer from './components/Footer.jsx';

export default function App() {
  const [route, setRoute] = useState('Dashboard');
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
    setRoute('Dashboard');
  }

  useEffect(() => {
    if (me && route === 'login') setRoute('Dashboard');
  }, [me, route]);

  useEffect(() => {
    if (me?.role === 'student' && route === 'student') setRoute('Dashboard');
  }, [me, route]);

  function handleLogout() {
    setToken('');
    setMe(null);
    setRoute('Dashboard');
  }

  let page = null;
  if (route === 'Dashboard') page = <Dashboard me={me} onNavigate={setRoute} onRoute={setRoute} />;
  if (route === 'login') page = <Login onLogin={handleLogin} onNavigate={setRoute} />;
  if (route === 'Register') page = <StudentRegister onNavigate={setRoute} />;
  if (route === 'account') page = <UserAccount me={me} />;
  if (route === 'student') page = <StudentRegister onNavigate={setRoute} />;
  if (route === 'dean') page = <DeanApprovals />;
  if (route === 'schoolsPrograms') page = <SchoolsPrograms />;
  if (route === 'adminUsers') page = <AdminUsers />;
  if (route === 'chairTags') page = <ChairTags me={me} />;
  if (route === 'chairApprovals') page = <ChairApprovals me={me} />;
  if (route === 'profQuestions') page = <ProfessorQuestions me={me} />;
  if (route === 'chairQuestions') page = <ChairQuestions me={me} />;
  if (route === 'deanQuestions') page = <DeanQuestions me={me} />;

  return (
    <div className="app-container">
      <Navbar me={me} route={route} onRoute={setRoute} onLogout={handleLogout} />

      <main className="page-content">
        {meError ? <p>{meError}</p> : null}
        {page}
      </main>

      <Footer />
    </div>
  );
}
