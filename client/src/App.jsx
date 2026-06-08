import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard/index.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/auth/Login.jsx';
import StudentRegister from './pages/student/StudentRegister.jsx';
import DeanApprovals from './pages/dean/DeanApprovals.jsx';
import StudentManager from './pages/dean/StudentManager.jsx';
import SchoolsPrograms from './pages/admin/SchoolsPrograms.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';
import UserAccount from './pages/auth/UserAccount.jsx';
import ChairTags from './pages/chair/ChairTags.jsx';
import QuestionApprovals from './pages/chair/QuestionApprovals.jsx';
import ChairCheatingLogs from './pages/chair/ChairCheatingLogs.jsx';
import ProfessorQuestions from './pages/professor/ProfessorQuestions.jsx';
import ChairQuestions from './pages/chair/ChairQuestions.jsx';
import DeanQuestions from './pages/dean/DeanQuestions.jsx';
import DeanTags from './pages/dean/DeanTags.jsx';
import MockBoardExam from './pages/dean/MockBoardExam.jsx';
import AvailableMockBoardExams from './pages/student/AvailableMockBoardExams.jsx';
import DeanExamRunner from './pages/dean/DeanExamRunner.jsx';
import MockBoardExamPreview from './pages/dean/MockBoardExamPreview.jsx';
import MockBoardExamTestRun from './pages/dean/MockBoardExamTestRun.jsx';
import ExamResults from './pages/dean/ExamResults.jsx';
import StudentExamRunner from './pages/student/StudentExamRunner.jsx';
import StudentExamResult from './pages/student/StudentExamResult.jsx';
import StudentAvailableExams from './pages/student/StudentAvailableExams.jsx';
import StudentExamResults from './pages/student/StudentExamResults.jsx';
import { apiAuth, getToken, setToken } from './lib/api.js';
import Footer from './components/Footer.jsx';
import "react-datepicker/dist/react-datepicker.css";

export default function App() {
  const [route, setRoute] = useState('Dashboard');
  const [me, setMe] = useState(null);
  const [editingMockBoardExamId, setEditingMockBoardExamId] = useState('');
  const [mockBoardExamRefreshKey, setMockBoardExamRefreshKey] = useState(0);
  const [examRunnerId, setExamRunnerId] = useState('');
  const [examRunnerMode, setExamRunnerMode] = useState('details');
  const [studentExamId, setStudentExamId] = useState('');

  async function refreshMe() {
    const token = getToken();
    if (!token) {
      setMe(null);
      return;
    }
    try {
      const data = await apiAuth('/api/auth/me');
      setMe(data);
    } catch (err) {
      setMe(null);
    }
  }

  useEffect(() => {
    refreshMe();
  }, []);

  // [FIX - SESSION EXPIRED MESSAGE]
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    if (params.get('session') === 'expired') {
      setToken('');
      setMe(null);
      setRoute('login');
      params.delete('session');
      window.history.replaceState({}, '', `${url.pathname}${params.toString() ? `?${params}` : ''}${url.hash}`);
      return;
    }

    if (url.pathname.endsWith('/login')) {
      setRoute('login');
    }
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
    const isLearner = me?.role === 'student' || me?.role === 'alumni';
    if (isLearner && route === 'student') setRoute('Dashboard');
  }, [me, route]);

  useEffect(() => {
    const isLearner = me?.role === 'student' || me?.role === 'alumni';
    const learnerRoutes = new Set([
      'studentAvailableExams',
      'studentExamRunner',
      'studentExamResult',
      'studentExamResults',
    ]);

    if (route && learnerRoutes.has(route) && !isLearner) {
      setRoute('Dashboard');
    }
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
      <Dashboard 
        me={me} 
        onNavigate={setRoute} 
        onRoute={setRoute} 
      />
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
  if (route === 'examResults') page = <ExamResults />;
  if (route === 'schoolsPrograms') page = <SchoolsPrograms />;
  if (route === 'adminUsers') page = <AdminUsers me={me} />;
  if (route === 'adminSettings') page = me?.role === 'super_admin' ? <AdminSettings /> : <Dashboard me={me} onNavigate={setRoute} onRoute={setRoute} />;
  if (route === 'chairTags') page = <ChairTags me={me} />;
  if (route === 'chairQuestionApprovals') page = <QuestionApprovals me={me} />;
  if (route === 'chairCheatingLogs') page = <ChairCheatingLogs />;
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
        me={me}
        refreshKey={mockBoardExamRefreshKey}
        onEditExam={(id, action = 'edit') => {
          if (action === 'edit') {
            setEditingMockBoardExamId(id);
            setRoute('mockBoardExam');
            return;
          }

          if (action === 'preview') {
            setExamRunnerId(id);
            setRoute('mockBoardExamPreview');
            return;
          }

          if (action === 'testRun') {
            setExamRunnerId(id);
            setRoute('mockBoardExamTestRun');
            return;
          }

          setExamRunnerId(id);
          setExamRunnerMode(action);
          setRoute('deanExamRunner');
        }}
      />
    );
  if (route === 'mockBoardExamPreview')
    page = (
      <MockBoardExamPreview
        examId={examRunnerId}
        onBack={() => setRoute('availableMockBoardExams')}
      />
    );
  if (route === 'mockBoardExamTestRun')
    page = (
      <MockBoardExamTestRun
        examId={examRunnerId}
        onBack={() => setRoute('availableMockBoardExams')}
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
  if (route === 'studentAvailableExams')
    page = (
      <StudentAvailableExams
        onTakeExam={(id) => {
          setStudentExamId(id);
          setRoute('studentExamRunner');
        }}
      />
    );
  if (route === 'studentExamRunner')
    page = (
      <StudentExamRunner
        examId={studentExamId}
        onFinish={() => setRoute('studentExamResult')}
        me={me}
      />
    );
  if (route === 'studentExamResult')
    page = (
      <StudentExamResult onReturn={() => setRoute('Dashboard')} />
    );
  if (route === 'studentExamResults')
    page = <StudentExamResults />;

  return (
    <div className="app-container">
      <Navbar me={me} route={route} onRoute={setRoute} onLogout={handleLogout} onMeRefresh={refreshMe} />

      <main className="page-content">
        {/* [FIX - REMOVE INVALID TOKEN TEXT] */}
        {page}
      </main>

      <Footer />
    </div>
  );
}
