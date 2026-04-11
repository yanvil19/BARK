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

export default function StudentRegister() {
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
  const [result, setResult] = useState(null);

  const [statusRequestId, setStatusRequestId] = useState(saved?.requestId || '');
  const [statusToken, setStatusToken] = useState(saved?.token || '');
  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusData, setStatusData] = useState(null);

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

  async function submitRegistration(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const data = await api('/api/auth/register-student', {
        method: 'POST',
        body: { name, email, password, departmentId, programId },
      });
      setResult(data);
      if (data?.request?._id && data?.token) {
        setStatusRequestId(data.request._id);
        setStatusToken(data.token);
        saveSaved({ requestId: data.request._id, token: data.token, email: data.request.email });
      }
    } catch (err) {
      setError(err.message || 'Failed to submit request');
    } finally {
      setBusy(false);
    }
  }

  async function checkStatus(e) {
    e.preventDefault();
    setStatusBusy(true);
    setStatusError('');
    setStatusData(null);
    try {
      const data = await api('/api/auth/registration-status', {
        method: 'POST',
        body: { requestId: statusRequestId, token: statusToken },
      });
      setStatusData(data);
    } catch (err) {
      setStatusError(err.message || 'Failed to check status');
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <main>
      <h2>Student Registration (Request)</h2>

      <section>
        <h3>Submit Request</h3>
        <form onSubmit={submitRegistration}>
          <div>
            <label>
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Department
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
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
              <select value={programId} onChange={(e) => setProgramId(e.target.value)} disabled={!departmentId}>
                <option value="">Select...</option>
                {programs.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.code} - {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="submit" disabled={busy}>
            {busy ? 'Submitting...' : 'Submit'}
          </button>
        </form>
        {error ? <p>{error}</p> : null}
        {result ? (
          <div>
            <p>{result.message}</p>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </div>
        ) : null}
      </section>

      <section>
        <h3>Check Status</h3>
        <form onSubmit={checkStatus}>
          <div>
            <label>
              Request ID
              <input value={statusRequestId} onChange={(e) => setStatusRequestId(e.target.value)} />
            </label>
          </div>
          <div>
            <label>
              Token
              <input value={statusToken} onChange={(e) => setStatusToken(e.target.value)} />
            </label>
          </div>
          <button type="submit" disabled={statusBusy}>
            {statusBusy ? 'Checking...' : 'Check'}
          </button>
        </form>
        {statusError ? <p>{statusError}</p> : null}
        {statusData ? <pre>{JSON.stringify(statusData, null, 2)}</pre> : null}
      </section>
    </main>
  );
}

