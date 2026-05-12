import { useState } from 'react';
import StudentRegister from '../student/StudentRegister.jsx';
import DeanApprovals from './DeanApprovals.jsx';
import '../../styles/StudentManager.css';
import PageHeader from '../../components/PageHeader.jsx';

export default function StudentManager({ onNavigate }) {
  const [tab, setTab] = useState('register');

  return (
    <main className="sm-page">
      <PageHeader
        title="Student Manager"
        subtitle="Register students and approve registration requests from one dean-only page."
      />

      <div className="sm-tabs">
        <button
          type="button"
          className={`sm-tab ${tab === 'approvals' ? 'is-active' : ''}`}
          onClick={() => setTab('approvals')}
        >
          Pending User Approval
        </button>
        <button
          type="button"
          className={`sm-tab ${tab === 'register' ? 'is-active' : ''}`}
          onClick={() => setTab('register')}
        >
          Register Student
        </button>
      </div>

      <div className="sm-content">
        {tab === 'register' ? (
          <StudentRegister onNavigate={onNavigate} embedded={true} />
        ) : (
          <DeanApprovals embedded={true} />
        )}
      </div>
    </main>
  );
}
