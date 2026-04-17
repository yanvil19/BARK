import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import {
  ID_FORMATS,
  validateStudentId,
  validateAlumniId,
  getStudentIdErrorMessage,
  getAlumniIdErrorMessage,
} from '../lib/idFormats.js';
import '../styles/StudentRegister.css';

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

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
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

export default function StudentRegister({ onNavigate }) {
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

  const [statusRequestId, setStatusRequestId] = useState(saved?.requestId || '');
  const [statusToken, setStatusToken] = useState(saved?.token || '');
  const [approvedEmail, setApprovedEmail] = useState(saved?.approvedEmail || '');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusData, setStatusData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  useEffect(() => {
    if (!statusRequestId || !statusToken) return;
    setStatus('pending');
    checkStatusInternal();
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
      if (data?.request?._id && data?.token) {
        setStatusRequestId(data.request._id);
        setStatusToken(data.token);
        setApprovedEmail('');
        saveSaved({ requestId: data.request._id, token: data.token, email: data.request.email });
        setStatus('pending');
      }
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  async function checkStatusInternal() {
    setStatusBusy(true);
    setStatusError('');
    setStatusData(null);
    try {
      const data = await api('/api/auth/registration-status', {
        method: 'POST',
        body: { requestId: statusRequestId, token: statusToken },
      });
      setStatusData(data);
      const nextStatus = data?.request?.status || 'idle';
      if (nextStatus === 'approved') {
        setStatus('approved');
        const emailFromRequest = data?.request?.email || '';
        setApprovedEmail(emailFromRequest);
        setStatusRequestId('');
        setStatusToken('');
        saveSaved({ approvedEmail: emailFromRequest });
      } else if (nextStatus === 'rejected') {
        setStatus('rejected');
      } else if (nextStatus === 'pending') {
        setStatus('pending');
      } else {
        setStatus('idle');
      }
    } catch (err) {
      setStatus('idle');
      setStatusError(err.message || 'Failed to check status');
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
    setStatusRequestId('');
    setStatusToken('');
    setApprovedEmail('');
    setStatusData(null);
    setStatus('idle');
    setStatusError('');
    setSubmitted(false);
    setShowAdvanced(false);
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

  const hasTracking = Boolean(statusRequestId && statusToken);
  const disableForm = (hasTracking && status === 'pending') || status === 'approved' || Boolean(approvedEmail);
  const idLabel = userType === 'student' ? 'Student ID' : 'Alumni ID';
  const idPlaceholder = userType === 'student' ? ID_FORMATS.STUDENT_ID.placeholder : ID_FORMATS.ALUMNI_ID.placeholder;
  const idValue = userType === 'student' ? studentId : alumniId;

  return (
    <main className="register-page-container">
      <header className="register-page-header">
        <h2>Student Registration</h2>
        <p className="register-subtitle">Manage student registration requests</p>
      </header>

      <div className="register-shell">
        <section className="register-card">
          <div className="register-card-header">
            <h3>Create Student</h3>
          </div>

          <div className="register-card-body">
            {(hasTracking && status === 'pending') || approvedEmail || status === 'approved' ? (
              <div className="register-banner-list">
                {hasTracking && status === 'pending' ? (
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
            {hasTracking ? (
              <>
                <p className="register-status-copy">Use your saved request details to monitor approval progress.</p>
                {status === 'pending' ? <div className="register-status-pill pending">Pending approval</div> : null}
                {status === 'approved' ? <div className="register-status-pill approved">Approved</div> : null}
                {status === 'rejected' ? <div className="register-status-pill rejected">Rejected</div> : null}
                {statusData?.request?.rejectionReason ? (
                  <p className="error-message">Reason: {statusData.request.rejectionReason}</p>
                ) : null}

                <div className="register-status-actions">
                  <button className="register-secondary-btn" onClick={checkStatusInternal} disabled={statusBusy}>
                    {statusBusy ? 'Checking...' : 'Check my status'}
                  </button>

                  {status === 'approved' ? (
                    <button
                      className="register-ghost-btn"
                      onClick={() => {
                        if (typeof onNavigate === 'function') onNavigate('login');
                      }}
                    >
                      Go to Login
                    </button>
                  ) : null}

                  {status === 'rejected' ? (
                    <button className="register-ghost-btn" onClick={resetForResubmit}>
                      New Registration
                    </button>
                  ) : null}
                </div>
              </>
            ) : approvedEmail ? (
              <>
                <div className="register-status-pill approved">Approved</div>
                <p className="register-status-copy">Please log in using this approved email: {approvedEmail}</p>
                <div className="register-status-actions">
                  <button
                    className="register-secondary-btn"
                    onClick={() => {
                      if (typeof onNavigate === 'function') onNavigate('login');
                    }}
                  >
                    Go to Login
                  </button>
                  <button className="register-ghost-btn" onClick={resetForResubmit}>
                    Clear
                  </button>
                </div>
              </>
            ) : (
              <p className="register-status-copy">
                After you submit a request, your tracking details will be saved here so you can check status anytime.
              </p>
            )}

            <div className="register-checkbox-row">
              <label className="register-checkbox">
                <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} />
                Advanced tracking tools
              </label>
            </div>

            {showAdvanced ? (
              <form className="register-manual-form" onSubmit={checkStatus}>
                <div className="register-manual-grid">
                  <div className="form-group">
                    <label htmlFor="student-register-request-id">Request ID</label>
                    <input
                      id="student-register-request-id"
                      value={statusRequestId}
                      onChange={(e) => setStatusRequestId(e.target.value)}
                      placeholder="Paste request ID"
                    />
                    {statusRequestId ? (
                      <button
                        className="register-ghost-btn register-copy-btn"
                        type="button"
                        onClick={async () => {
                          const ok = await copyText(statusRequestId);
                          if (!ok) alert('Copy failed');
                        }}
                      >
                        Copy Request ID
                      </button>
                    ) : null}
                  </div>
                  <div className="form-group">
                    <label htmlFor="student-register-token">Token</label>
                    <input
                      id="student-register-token"
                      value={statusToken}
                      onChange={(e) => setStatusToken(e.target.value)}
                      placeholder="Paste tracking token"
                    />
                    {statusToken ? (
                      <button
                        className="register-ghost-btn register-copy-btn"
                        type="button"
                        onClick={async () => {
                          const ok = await copyText(statusToken);
                          if (!ok) alert('Copy failed');
                        }}
                      >
                        Copy Token
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="register-manual-actions">
                  <button className="register-secondary-btn" type="submit" disabled={statusBusy}>
                    {statusBusy ? 'Checking...' : 'Check manually'}
                  </button>
                  {hasTracking ? (
                    <button className="register-ghost-btn" type="button" onClick={resetForResubmit} disabled={statusBusy}>
                      Clear saved
                    </button>
                  ) : null}
                </div>
              </form>
            ) : null}

            {statusError ? <p className="error-message">{statusError}</p> : null}
            {showAdvanced && statusData ? <pre className="register-debug-output">{JSON.stringify(statusData, null, 2)}</pre> : null}
          </div>
        </section>
      </div>

      {submitted ? <div className="register-toast">New Student Registered</div> : null}
    </main>
  );
}
