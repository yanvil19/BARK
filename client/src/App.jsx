import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard/index.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/Login.jsx';
import StudentRegister from './pages/StudentRegister.jsx';
import DeanApprovals from './pages/DeanApprovals.jsx';
import StudentManager from './pages/StudentManager.jsx';
import SchoolsPrograms from './pages/SchoolsPrograms.jsx';
import AdminUsers from './pages/AdminUsers.jsx';
import UserAccount from './pages/UserAccount.jsx';
import ChairTags from './pages/ChairTags.jsx';
import QuestionApprovals from './pages/QuestionApprovals.jsx';
import ProfessorQuestions from './pages/ProfessorQuestions.jsx';
import ChairQuestions from './pages/ChairQuestions.jsx';
import DeanQuestions from './pages/DeanQuestions.jsx';
import DeanTags from './pages/DeanTags.jsx';
import MockBoardExam from './pages/MockBoardExam.jsx';
import AvailableMockBoardExams from './pages/AvailableMockBoardExams.jsx';
import DeanExamRunner from './pages/DeanExamRunner.jsx';
import { apiAuth, getToken, setToken } from './lib/api.js';
import Footer from './components/Footer.jsx';

export default function App() {
  const [route, setRoute] = useState('Dashboard');
  const [me, setMe] = useState(null);
  const [meError, setMeError] = useState('');
  const [editingMockBoardExamId, setEditingMockBoardExamId] = useState('');
  const [mockBoardExamRefreshKey, setMockBoardExamRefreshKey] = useState(0);
  const [examRunnerId, setExamRunnerId] = useState('');
  const [examRunnerMode, setExamRunnerMode] = useState('details');

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

  useEffect(() => {
    if (route !== 'mockBoardExam' && editingMockBoardExamId) {
      setEditingMockBoardExamId('');
    }
  }, [editingMockBoardExamId, route]);

  useEffect(() => {
    if (route !== 'deanExamRunner' && examRunnerId) {
      setExamRunnerId('');
      setExamRunnerMode('details');
    }
  }, [examRunnerId, route]);

  function handleLogout() {
    setToken('');
    setMe(null);
    setRoute('Dashboard');
  }

  let page = null;
  if (route === 'Dashboard') {
    page = me ? (
      <Dashboard me={me} onNavigate={setRoute} onRoute={setRoute} />
    ) : (
      <LandingPage onNavigate={setRoute} />
    );
  }
  if (route === 'login') page = <Login onLogin={handleLogin} onNavigate={setRoute} />;
  if (route === 'Register') page = <StudentRegister onNavigate={setRoute} />;
  if (route === 'account') page = <UserAccount me={me} />;
  if (route === 'student') page = <StudentRegister onNavigate={setRoute} />;
  if (route === 'studentManager') page = <StudentManager onNavigate={setRoute} />;
  if (route === 'dean') page = <DeanApprovals />;
  if (route === 'schoolsPrograms') page = <SchoolsPrograms />;
  if (route === 'adminUsers') page = <AdminUsers />;
  if (route === 'chairTags') page = <ChairTags me={me} />;
  if (route === 'chairQuestionApprovals') page = <QuestionApprovals me={me} />;
  if (route === 'deanQuestionApprovals') page = <QuestionApprovals me={me} />;
  if (route === 'profQuestions') page = <ProfessorQuestions me={me} />;
  if (route === 'chairQuestions') page = <ChairQuestions me={me} />;
  if (route === 'deanQuestions') page = <DeanQuestions me={me} />;
  if (route === 'deanTags') page = <DeanTags me={me} />;
  if (route === 'mockBoardExam')
    page = (
      <MockBoardExam
        me={me}
        editingExamId={editingMockBoardExamId}
        onClearEditing={() => setEditingMockBoardExamId('')}
        onExamSaved={() => {
          setMockBoardExamRefreshKey((prev) => prev + 1);
          setRoute('availableMockBoardExams');
        }}
      />
    );
  if (route === 'availableMockBoardExams')
    page = (
      <AvailableMockBoardExams
        refreshKey={mockBoardExamRefreshKey}
        onEditExam={(id, action = 'edit') => {
          if (action === 'edit') {
            setEditingMockBoardExamId(id);
            setRoute('mockBoardExam');
            return;
          }

          setExamRunnerId(id);
          setExamRunnerMode(action);
          setRoute('deanExamRunner');
        }}
      />
    );
  if (route === 'deanExamRunner')
    page = (
      <DeanExamRunner
        examId={examRunnerId}
        mode={examRunnerMode}
        onBack={() => setRoute('availableMockBoardExams')}
      />
    );

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
