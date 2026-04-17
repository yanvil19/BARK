import '../styles/ProfileModal.css';

export default function ProfileModal({ me, onLogout }) {
  return (
    <div className="profile-modal">

      <h3>My Account</h3>

      <p><strong>Name:</strong> {me.name || 'N/A'}</p>
      <p><strong>Email:</strong> {me.email || 'N/A'}</p>
      <p><strong>Role:</strong> {me.role || 'N/A'}</p>

      {/* OPTIONAL FIELDS */}
      {me.studentId && (
        <p><strong>Student ID:</strong> {me.studentId}</p>
      )}

      {me.department && (
        <p>
          <strong>Department:</strong>{' '}
          {me.department.name || me.department.code || me.department}
        </p>
      )}

      {me.program && (
        <p>
          <strong>Program:</strong>{' '}
          {me.program.name || me.program.code || me.program}
        </p>
      )}

      <button className="logout-btn" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
}