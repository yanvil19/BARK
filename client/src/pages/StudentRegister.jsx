import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';

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

export default function StudentRegister({ onNavigate }) {
  const saved = useMemo(() => loadSaved(), []);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [programId, setProgramId] = useState('');

  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const [statusRequestId, setStatusRequestId] = useState(saved?.requestId || '');
  const [statusToken, setStatusToken] = useState(saved?.token || '');
  const [approvedEmail, setApprovedEmail] = useState(saved?.approvedEmail || '');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusData, setStatusData] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | pending | approved | rejected
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
    // Auto-check status when we already have tracking info
    // eslint-disable-next-line no-use-before-define
    checkStatusInternal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitRegistration(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSubmitted(false);
    try {
      const data = await api('/api/auth/register-student', {
        method: 'POST',
        body: { name, email, password, departmentId, programId },
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
  }

  const hasTracking = Boolean(statusRequestId && statusToken);
  const disableForm = (hasTracking && status === 'pending') || status === 'approved' || Boolean(approvedEmail);

  return (
    <main>
      <h2>Student Registration</h2>

      <section>
        <h3>Submit Request</h3>
        {hasTracking && status === 'pending' ? (
          <p>You already have a pending request. Please check your status below.</p>
        ) : null}
        {approvedEmail || status === 'approved' ? <p>Your account has been approved. Please log in instead.</p> : null}
        <form onSubmit={submitRegistration}>
          <div>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} disabled={disableForm} />
            </label>
          </div>
          <div>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={disableForm} />
            </label>
          </div>
          <div>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={disableForm}
              />
            </label>
          </div>
          <div>
            <label>
              Department
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} disabled={disableForm}>
                <option value="">Select...</option>
                {departments.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <label>
              Program
              <select
                value={programId}
                onChange={(e) => setProgramId(e.target.value)}
                disabled={!departmentId || disableForm}
              >
                <option value="">Select...</option>
                {programs.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy || disableForm}>
            {busy ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        {error ? <p>{error}</p> : null}
        {submitted ? <p>Submitted. Waiting for dean approval.</p> : null}
      </section>

      <section>
        <h3>Check Status</h3>
        {hasTracking ? (
          <>
            {status === 'pending' ? <p>Status: Pending approval.</p> : null}
            {status === 'approved' ? <p>Status: Approved. You can now log in.</p> : null}
            {status === 'rejected' ? <p>Status: Rejected.</p> : null}
            {statusData?.request?.rejectionReason ? <p>Reason: {statusData.request.rejectionReason}</p> : null}

            <button onClick={checkStatusInternal} disabled={statusBusy}>
              {statusBusy ? 'Checking...' : 'Check my status'}
            </button>

            {status === 'approved' ? (
              <>
                {' '}
                <button
                  onClick={() => {
                    if (typeof onNavigate === 'function') onNavigate('login');
                  }}
                >
                  Go to Login
                </button>
              </>
            ) : null}

            {status === 'rejected' ? (
              <>
                {' '}
                <button onClick={resetForResubmit}>Submit again</button>
              </>
            ) : null}
          </>
        ) : approvedEmail ? (
          <>
            <p>Status: Approved. Please log in using your email.</p>
            <p>Email: {approvedEmail}</p>
            <button
              onClick={() => {
                if (typeof onNavigate === 'function') onNavigate('login');
              }}
            >
              Go to Login
            </button>{' '}
            <button onClick={resetForResubmit}>Clear</button>
          </>
        ) : (
          <p>After you submit a request, you can check its status here.</p>
        )}

        <div>
          <label>
            <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} /> Advanced
          </label>
        </div>

        {showAdvanced ? (
          <form onSubmit={checkStatus}>
            <div>
              <label>
                Request ID
                <input value={statusRequestId} onChange={(e) => setStatusRequestId(e.target.value)} />
              </label>{' '}
              {statusRequestId ? (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(statusRequestId);
                    if (!ok) alert('Copy failed');
                  }}
                >
                  Copy
                </button>
              ) : null}
            </div>
            <div>
              <label>
                Token
                <input value={statusToken} onChange={(e) => setStatusToken(e.target.value)} />
              </label>{' '}
              {statusToken ? (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await copyText(statusToken);
                    if (!ok) alert('Copy failed');
                  }}
                >
                  Copy
                </button>
              ) : null}
            </div>
            <button type="submit" disabled={statusBusy}>
              {statusBusy ? 'Checking...' : 'Check (manual)'}
            </button>{' '}
            {hasTracking ? (
              <button type="button" onClick={resetForResubmit} disabled={statusBusy}>
                Clear saved
              </button>
            ) : null}
          </form>
        ) : null}

        {statusError ? <p>{statusError}</p> : null}
        {showAdvanced && statusData ? <pre>{JSON.stringify(statusData, null, 2)}</pre> : null}
      </section>
    </main>
  );
}
