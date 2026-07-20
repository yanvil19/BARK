import { useEffect, useState } from 'react';
import { Modal } from './components/Modal.jsx';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LandingPage from './pages/LandingPage.jsx';
import Login from './pages/Login.jsx';
import DeanApprovals from './pages/dean/DeanApproveQuestions.jsx';
import StudentManager from './pages/dean/DeanStudentRegister.jsx';
import SchoolsPrograms from './pages/superadmin/SAdminSchoolsPrograms.jsx';
import AdminUsers from './pages/superadmin/SAdminUsers.jsx';
import AdminSettings from './pages/superadmin/SAdminSettings.jsx';
import UserAccount from './pages/UserAccount.jsx';
import ChairTags from './pages/programchair/PCManageSubjects.jsx';
import QuestionApprovals from './pages/programchair/PCApproveQuestions.jsx';
import ChairCheatingLogs from './pages/programchair/PCLogs.jsx';
import ProfessorQuestions from './pages/prof/ProfMyQuestions.jsx';
import ChairQuestions from './pages/programchair/PCMyQuestions.jsx';
import DeanQuestions from './pages/dean/DeanMyQuestions.jsx';
import DeanTags from './pages/dean/DeanManageSubjects.jsx';
import MockBoardExam from './pages/dean/DeanCreateExams.jsx';
import AvailableMockBoardExams from './pages/student/StudentBoardExams.jsx';
import DeanExamRunner from './pages/dean/DeanExamRunner.jsx';
import MockBoardExamPreview from './pages/dean/DeanBoardExamPreview.jsx';
import MockBoardExamTestRun from './pages/dean/DeanBoardExamTestRun.jsx';
import ExamResults from './pages/dean/DeanExamResults.jsx';
import StudentExamRunner from './pages/student/StudentExamRunner.jsx';
import StudentExamResult from './pages/student/StudentExamResult.jsx';
import StudentAvailableExams from './pages/student/StudentAvailableExams.jsx';
import StudentExamResults from './pages/student/StudentExamResults.jsx';
import AlumniAvailableExams from './pages/alumni/AlumniAvailableExams.jsx';
import AlumniExamRunner from './pages/alumni/AlumniExamRunner.jsx';
import AlumniExamResult from './pages/alumni/AlumniExamResult.jsx';
import AlumniExamResults from './pages/alumni/AlumniExamResults.jsx';
import Credits from './pages/Credits.jsx';
import { api, clearClientSessionStorage } from './lib/api.js';
import Footer from './components/Footer.jsx';
import SystemUpdateWarning from './components/SystemUpdateWarning.jsx';
import "react-datepicker/dist/react-datepicker.css";
import PCStudentManager from './pages/programchair/PCStudentRegister.jsx';
import PCMockBoardExam from './pages/programchair/PCCreateExams.jsx';
import PCExamRunner from './pages/programchair/PCExamRunner.jsx';
import PCMockBoardExamPreview from './pages/programchair/PCBoardExamPreview.jsx';
import PCMockBoardExamTestRun from './pages/programchair/PCBoardExamTestRun.jsx';
import PCExamResults from './pages/programchair/PCExamResults.jsx';

export default function App() {
  const [route, setRoute] = useState('Dashboard');
  const [me, setMe] = useState(null);
  const [editingMockBoardExamId, setEditingMockBoardExamId] = useState('');
  const [mockBoardExamRefreshKey, setMockBoardExamRefreshKey] = useState(0);
  const [examRunnerId, setExamRunnerId] = useState('');
  const [examRunnerMode, setExamRunnerMode] = useState('details');
  const [studentExamId, setStudentExamId] = useState('');
  const [alumniExamId, setAlumniExamId] = useState('');
  const [alumniResultExamId, setAlumniResultExamId] = useState('');
  const [showDeactivatedModal, setShowDeactivatedModal] = useState(false);

  async function refreshMe() {
    try {
      const data = await api('/api/auth/me');
      setMe((prev) => {
        if (prev && JSON.stringify(prev) === JSON.stringify(data)) {
          return prev;
        }
        return data;
      });
    } catch (err) {
      if (err.status === 401) {
        const isDeactivated = Boolean(err.message && err.message.toLowerCase().includes('deactivated'));
        if (isDeactivated) {
          setMe((prev) => {
            if (prev) window.dispatchEvent(new CustomEvent('account-deactivated'));
            return null;
          });
          return;
        }
      }
      setMe(null);
    }
  }

  useEffect(() => {
    refreshMe();
  }, []);

  // [SESSION POLL - Deactivation detection]
  // Polls /api/auth/me every 10 seconds while logged in so that if an admin
  // deactivates the account, the user is automatically kicked out.
  useEffect(() => {
    if (!me) return;
    const POLL_INTERVAL_MS = 10_000;
    const id = setInterval(() => {
      refreshMe();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [me]);

  // [DEACTIVATION MODAL - Listen for account-deactivated event from api.js]
  useEffect(() => {
    const onDeactivated = () => setShowDeactivatedModal(true);
    window.addEventListener('account-deactivated', onDeactivated);
    return () => window.removeEventListener('account-deactivated', onDeactivated);
  }, []);

  function handleDeactivatedAcknowledge() {
    setShowDeactivatedModal(false);
    api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    clearClientSessionStorage();
    setMe(null);
    // Set the URL param BEFORE changing the route so Login mounts with ?session=deactivated
    window.history.replaceState({}, '', '/login?session=deactivated');
    setRoute('login');
  }

  // [FIX - SESSION EXPIRED MESSAGE]
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = url.searchParams;

    const sessionVal = params.get('session');
    if (sessionVal === 'expired' || sessionVal === 'deactivated') {
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

  function handleLogin() {
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
      'alumniAvailableExams',
      'alumniExamRunner',
      'alumniExamResult',
      'alumniExamResults',
    ]);

    if (route && learnerRoutes.has(route) && !isLearner) {
      setRoute('Dashboard');
    }
  }, [me, route]);

  useEffect(() => {
    if (me?.role === 'alumni') {
      const studentToAlumniRoute = {
        studentAvailableExams: 'alumniAvailableExams',
        studentExamRunner: 'alumniExamRunner',
        studentExamResult: 'alumniExamResult',
        studentExamResults: 'alumniExamResults',
      };
      if (studentToAlumniRoute[route]) setRoute(studentToAlumniRoute[route]);
    }

    if (me?.role === 'student' && route?.startsWith('alumni')) {
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

  async function handleLogout() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear client state even if logout request fails
    }
    clearClientSessionStorage();
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
  if (route === 'landing') page = <LandingPage onNavigate={setRoute} />;
  if (route === 'login') page = <Login onLogin={handleLogin} onNavigate={setRoute} />;
  if (route === 'account') page = <UserAccount me={me} />;
  if (route === 'studentManager') page = <StudentManager me={me} onNavigate={setRoute} />;
  if (route === 'dean') page = <DeanApprovals />;
  if (route === 'examResults') page = <ExamResults me={me} />;
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
  if (route === 'pcStudentManager') page = <PCStudentManager me={me} onNavigate={setRoute} />;
  if (route === 'pcExamResults') page = <PCExamResults me={me} />;
  if (route === 'pcMockBoardExam')
    page = (
      <PCMockBoardExam
        me={me}
        editingExamId={editingMockBoardExamId}
        onClearEditing={() => setEditingMockBoardExamId('')}
        onExamSaved={() => {
          setMockBoardExamRefreshKey((prev) => prev + 1);
          setRoute('pcAvailableMockBoardExams');
        }}
      />
    );
  if (route === 'pcAvailableMockBoardExams')
    page = (
      <AvailableMockBoardExams
        me={me}
        refreshKey={mockBoardExamRefreshKey}
        onEditExam={(id, action = 'edit') => {
          if (action === 'edit') {
            setEditingMockBoardExamId(id);
            setRoute('pcMockBoardExam');
            return;
          }
          if (action === 'preview') {
            setExamRunnerId(id);
            setRoute('pcMockBoardExamPreview');
            return;
          }
          if (action === 'testRun') {
            setExamRunnerId(id);
            setRoute('pcMockBoardExamTestRun');
            return;
          }
          setExamRunnerId(id);
          setExamRunnerMode(action);
          setRoute('pcExamRunner');
        }}
      />
    );
  if (route === 'pcMockBoardExamPreview')
    page = (
      <PCMockBoardExamPreview
        examId={examRunnerId}
        onBack={() => setRoute('pcAvailableMockBoardExams')}
      />
    );
  if (route === 'pcMockBoardExamTestRun')
    page = (
      <PCMockBoardExamTestRun
        examId={examRunnerId}
        onBack={() => setRoute('pcAvailableMockBoardExams')}
      />
    );
  if (route === 'pcExamRunner')
    page = (
      <PCExamRunner
        examId={examRunnerId}
        mode={examRunnerMode}
        onBack={() => setRoute('pcAvailableMockBoardExams')}
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
  if (route === 'alumniAvailableExams')
    page = (
      <AlumniAvailableExams
        onTakeExam={(id) => {
          setAlumniExamId(id);
          setAlumniResultExamId(id);
          setRoute('alumniExamRunner');
        }}
        onViewResults={(id) => {
          setAlumniResultExamId(id);
          setRoute('alumniExamResults');
        }}
      />
    );
  if (route === 'alumniExamRunner')
    page = (
      <AlumniExamRunner
        examId={alumniExamId}
        onFinish={() => {
          setAlumniResultExamId(alumniExamId);
          setRoute('alumniExamResult');
        }}
        me={me}
      />
    );
  if (route === 'alumniExamResult')
    page = (
      <AlumniExamResult
        onReturn={() => setRoute('alumniAvailableExams')}
        onViewResults={() => setRoute('alumniExamResults')}
      />
    );
  if (route === 'alumniExamResults')
    page = <AlumniExamResults examId={alumniResultExamId} />;
  if (route === 'credits') page = <Credits onNavigate={setRoute} />;

  return (
    <div className="app-container">
      <Navbar me={me} route={route} onRoute={setRoute} onLogout={handleLogout} onMeRefresh={refreshMe} />

      <main className="page-content">
        {/* [FIX - REMOVE INVALID TOKEN TEXT] */}
        {page}
      </main>

      <Footer
        onNavigate={setRoute}
        isPublic={(!me && route === 'Dashboard') || route === 'credits' || route === 'landing' || route === 'login'}
        landingSectionsAvailable={(!me && route === 'Dashboard') || route === 'landing'}
      />

      {/* [DEACTIVATION MODAL] */}
      <Modal
        open={showDeactivatedModal}
        onClose={() => { }}
        title="Account Deactivated"
        size="compact"
        bodyClassName="custom-modal-body--compact"
      >
        <div className="modal-confirmation">
          <div className="modal-confirmation-message">
            Your account has been <strong>deactivated</strong> by an administrator.
          </div>
          <div className="modal-confirmation-extra">
            You have been signed out. If you believe this is a mistake or need your account
            restored, please reach out to the admins for assistance.
          </div>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-primary"
            onClick={handleDeactivatedAcknowledge}
          >
            OK, Got It
          </button>
        </div>
      </Modal>

      <SystemUpdateWarning me={me} />
    </div>
  );
}
