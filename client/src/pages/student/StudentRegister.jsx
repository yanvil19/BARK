import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  ID_FORMATS,
  validateStudentId,
  validateAlumniId,
  getStudentIdErrorMessage,
  getAlumniIdErrorMessage,
} from '../../lib/idFormats.js';
import '../../styles/StudentRegister.css';
import PageHeader from '../../components/PageHeader.jsx';

const REG_KEY = 'nu_board_registration';

function loadSaved() {
  try {
    const raw = window.localStorage.getItem(REG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSaved(value) {
  window.localStorage.setItem(REG_KEY, JSON.stringify(value));
}

function clearSaved() {
  window.localStorage.removeItem(REG_KEY);
}

function PasswordToggle({ shown, onToggle, label, disabled }) {
  function handleKeyDown(e) {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  }

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={`register-password-toggle${disabled ? ' is-disabled' : ''}`}
      aria-label={label}
      title={label}
      onClick={disabled ? undefined : onToggle}
      onKeyDown={handleKeyDown}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="register-password-toggle-icon">
        <path
          d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {!shown ? (
          <path
            d="M4 4 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        ) : null}
      </svg>
    </span>
  );
}

export default function StudentRegister({ onNavigate, embedded = false }) {
  const saved = useMemo(() => loadSaved(), []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userType, setUserType] = useState('student');
  const [studentId, setStudentId] = useState('');
  const [alumniId, setAlumniId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const [idError, setIdError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // [UX IMPROVEMENT - Check Status]
  const [statusStudentId, setStatusStudentId] = useState(saved?.statusStudentId || '');
  // [UX IMPROVEMENT - Check Status]
  const [statusEmail, setStatusEmail] = useState(saved?.statusEmail || '');
  const [approvedEmail, setApprovedEmail] = useState(saved?.approvedEmail || '');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusData, setStatusData] = useState(null);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api('/api/catalog/departments');
        if (cancelled) return;
        setDepartments(data.departments || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load departments');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!departmentId) {
      setPrograms([]);
      setProgramId('');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/catalog/programs?departmentId=${encodeURIComponent(departmentId)}`);
        if (cancelled) return;
        setPrograms(data.programs || []);
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Failed to load programs');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [departmentId]);

  // [UX IMPROVEMENT - Check Status]
  useEffect(() => {
    if (!statusStudentId || !statusEmail) return;
    checkStatusInternal(statusStudentId, statusEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitRegistration(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setIdError('');
    setSubmitted(false);

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please confirm your password.');
      setBusy(false);
      return;
    }

    if (String(password).length < 8) {
      setError('Password must be at least 8 characters long.');
      setBusy(false);
      return;
    }

    if (userType === 'student' && !validateStudentId(studentId)) {
      setIdError(getStudentIdErrorMessage());
      setBusy(false);
      return;
    }

    if (userType === 'alumni' && !validateAlumniId(alumniId)) {
      setIdError(getAlumniIdErrorMessage());
      setBusy(false);
      return;
    }

    try {
      const data = await api('/api/auth/register-student', {
        method: 'POST',
        body: {
          name,
          email,
          password,
          userType,
          studentId: userType === 'student' ? studentId : undefined,
          alumniId: userType === 'alumni' ? alumniId : undefined,
          departmentId,
          programId,
        },
      });
      setSubmitted(true);
      // [UX IMPROVEMENT - Check Status]
      if (userType === 'student' && studentId && email) {
        setStatusStudentId(studentId);
        setStatusEmail(email);
        setApprovedEmail('');
        saveSaved({ statusStudentId: studentId, statusEmail: email });
        setStatus('pending');

        // Clear form fields to allow submitting multiple accounts easily
        setName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setStudentId('');
        setAlumniId('');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  // [UX IMPROVEMENT - Check Status]
  async function checkStatusInternal(nextStudentId = statusStudentId, nextEmail = statusEmail) {
    setStatusBusy(true);
    setStatusError('');
    try {
      const data = await api('/api/auth/registration-status', {
        method: 'POST',
        body: { studentId: nextStudentId, email: nextEmail },
      });
      setStatusData(data);
      const nextStatus = data?.request?.status || 'idle';
      if (nextStatus === 'approved') {
        setStatus('approved');
        setApprovedEmail(nextEmail);
        saveSaved({ statusStudentId: nextStudentId, statusEmail: nextEmail, approvedEmail: nextEmail });
      } else if (nextStatus === 'rejected') {
        setStatus('rejected');
        setApprovedEmail('');
        saveSaved({ statusStudentId: nextStudentId, statusEmail: nextEmail });
      } else if (nextStatus === 'pending') {
        setStatus('pending');
        setApprovedEmail('');
        saveSaved({ statusStudentId: nextStudentId, statusEmail: nextEmail });
      } else {
        setStatus('idle');
      }
    } catch (err) {
      setStatus('idle');
      setStatusData(null);
      setApprovedEmail('');
      setStatusError('No registration request found. Please check your Student ID and email and try again.');
    } finally {
      setStatusBusy(false);
    }
  }

  async function checkStatus(e) {
    e.preventDefault();
    await checkStatusInternal();
  }

  function resetForResubmit() {
    clearSaved();
    // [UX IMPROVEMENT - Check Status]
    setStatusStudentId('');
    // [UX IMPROVEMENT - Check Status]
    setStatusEmail('');
    setApprovedEmail('');
    setStatusData(null);
    setStatus('idle');
    setStatusError('');
    setSubmitted(false);
    setIdError('');
  }

  function updateIdValue(value) {
    setIdError('');
    if (userType === 'student') {
      setStudentId(value);
      return;
    }
    setAlumniId(value);
  }

  // [UX IMPROVEMENT - Check Status]
  const hasStatusLookup = Boolean(statusStudentId && statusEmail);
  const disableForm = false; // Changed to false to allow multiple registrations
  const idLabel = userType === 'student' ? 'Student ID' : 'Alumni ID';
  const idPlaceholder = userType === 'student' ? ID_FORMATS.STUDENT_ID.placeholder : ID_FORMATS.ALUMNI_ID.placeholder;
  const idValue = userType === 'student' ? studentId : alumniId;
  // [UX IMPROVEMENT - Check Status]
  const statusMessageByState = {
    pending: 'Your registration is pending dean approval.',
    approved: 'Your registration has been approved. You may now log in.',
    rejected: 'Your registration has been rejected. Please contact your department.',
  };
  // [UX IMPROVEMENT - Check Status]
  const statusLabelByState = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
  };
  // [UX IMPROVEMENT - Check Status]
  const statusIconByState = {
    pending: '🟡',
    approved: '✅',
    rejected: '❌',
  };
  // [UX IMPROVEMENT - Check Status]
  const formattedCreatedAt = statusData?.request?.createdAt ? new Date(statusData.request.createdAt).toLocaleString() : '';
  // [UX IMPROVEMENT - Check Status]
  const formattedUpdatedAt = statusData?.request?.updatedAt ? new Date(statusData.request.updatedAt).toLocaleString() : '';

  return (
    <main className="register-page-container">
      {!embedded ? (
        <PageHeader
          className="shared-page-header--bleed-lr"
          title="Student Registration"
          subtitle="Manage student registration requests"
        />
      ) : null}

      <div className="register-shell">
        <section className="register-card">
          <div className="register-card-header">
            <h3>Create Student</h3>
          </div>

          <div className="register-card-body">
            {(hasStatusLookup && status === 'pending') || approvedEmail || status === 'approved' ? (
              <div className="register-banner-list">
                {hasStatusLookup && status === 'pending' ? (
                  <div className="register-banner register-banner--info">
                    You already have a pending request. You can track its progress in the status card below.
                  </div>
                ) : null}
                {approvedEmail || status === 'approved' ? (
                  <div className="register-banner register-banner--approved">
                    Your account has been approved. Please continue to login instead of submitting a new request.
                  </div>
                ) : null}
              </div>
            ) : null}

            <form className="register-form" onSubmit={submitRegistration}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="student-register-name">Full Name</label>
                  <input
                    id="student-register-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="ex. Juan Dela Cruz"
                    disabled={disableForm}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="student-register-email">Email Address</label>
                  <input
                    id="student-register-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ex. juandlc@gmail.com"
                    disabled={disableForm}
                  />
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="student-register-password">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      id="student-register-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      disabled={disableForm}
                    />
                    <PasswordToggle
                      shown={showPassword}
                      onToggle={() => setShowPassword((current) => !current)}
                      label={showPassword ? 'Hide password' : 'Show password'}
                      disabled={disableForm}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="student-register-confirm-password">Confirm Password</label>
                  <div className="password-input-wrapper">
                    <input
                      id="student-register-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      disabled={disableForm}
                    />
                    <PasswordToggle
                      shown={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword((current) => !current)}
                      label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                      disabled={disableForm}
                    />
                  </div>
                </div>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="student-register-department">Department</label>
                  <select
                    id="student-register-department"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    disabled={disableForm}
                  >
                    <option value="">Select department</option>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="student-register-program">Program</label>
                  <select
                    id="student-register-program"
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                    disabled={!departmentId || disableForm}
                  >
                    <option value="">Select program</option>
                    {programs.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.code} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="register-segment-row">
                <div className="form-group">
                  <span className="register-segment-label">Applicant Type</span>
                  <div className="register-segmented" role="tablist" aria-label="Applicant type">
                    <button
                      type="button"
                      className={userType === 'student' ? 'is-active' : ''}
                      onClick={() => {
                        setUserType('student');
                        setIdError('');
                      }}
                      disabled={disableForm}
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      className={userType === 'alumni' ? 'is-active' : ''}
                      onClick={() => {
                        setUserType('alumni');
                        setIdError('');
                      }}
                      disabled={disableForm}
                    >
                      Alumni
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="student-register-id">{idLabel}</label>
                  <input
                    id="student-register-id"
                    type="text"
                    value={idValue}
                    onChange={(e) => updateIdValue(e.target.value)}
                    placeholder={idPlaceholder}
                    disabled={disableForm}
                  />
                </div>
              </div>

              <div className="register-footer">
                <span>Student will be placed in Pending status</span>
                <button type="submit" className="submit-btn" disabled={busy || disableForm}>
                  {busy ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>

            {(idError || error || submitted) && (
              <div className="register-message-stack">
                {idError ? <p className="error-message">{idError}</p> : null}
                {error ? <p className="error-message">{error}</p> : null}
                {submitted ? <p className="success-message">Submitted. Waiting for dean approval.</p> : null}
              </div>
            )}
          </div>
        </section>

        <section className="register-status-card">
          <div className="register-status-card-header">
            <h3>Check Status</h3>
          </div>

          <div className="register-status-card-body">
            {/* [UX IMPROVEMENT - Check Status] */}
            <p className="register-status-copy">
              Enter your Student ID and registered email to check your registration approval status.
            </p>

            {/* [UX IMPROVEMENT - Check Status] */}
            <form className="register-manual-form" onSubmit={checkStatus}>
              <div className="register-manual-grid">
                <div className="form-group">
                  <label htmlFor="student-register-status-id">Student ID</label>
                  <input
                    id="student-register-status-id"
                    value={statusStudentId}
                    onChange={(e) => setStatusStudentId(e.target.value)}
                    placeholder="Enter your Student ID"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="student-register-status-email">Email</label>
                  <input
                    id="student-register-status-email"
                    type="email"
                    value={statusEmail}
                    onChange={(e) => setStatusEmail(e.target.value)}
                    placeholder="Enter your registered email"
                  />
                </div>
              </div>

              <div className="register-manual-actions">
                <button className="register-secondary-btn" type="submit" disabled={statusBusy}>
                  {statusBusy ? 'Checking...' : 'Check Status'}
                </button>
                {(hasStatusLookup || statusData || statusError) ? (
                  <button className="register-ghost-btn" type="button" onClick={resetForResubmit} disabled={statusBusy}>
                    Clear
                  </button>
                ) : null}
              </div>
            </form>

            {/* [UX IMPROVEMENT - Check Status] */}
            {statusError ? <p className="error-message">{statusError}</p> : null}

            {/* [UX IMPROVEMENT - Check Status] */}
            {statusData?.request ? (
              <div className="register-status-result">
                <div className={`register-status-pill ${statusData.request.status}`}>
                  {statusIconByState[statusData.request.status]} {statusLabelByState[statusData.request.status]}
                </div>
                <p className="register-status-summary">{statusMessageByState[statusData.request.status]}</p>
                <dl className="register-status-details">
                  <div>
                    <dt>Full name</dt>
                    <dd>{statusData.request.fullName}</dd>
                  </div>
                  <div>
                    <dt>Program</dt>
                    <dd>{statusData.request.program || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt>Date registered</dt>
                    <dd>{formattedCreatedAt}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formattedUpdatedAt}</dd>
                  </div>
                </dl>

                {status === 'approved' ? (
                  <div className="register-status-actions">
                    <button
                      className="register-secondary-btn"
                      type="button"
                      onClick={() => {
                        if (typeof onNavigate === 'function') onNavigate('login');
                      }}
                    >
                      Go to Login
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {submitted ? <div className="register-toast">New Student Registered</div> : null}
    </main>
  );
}
