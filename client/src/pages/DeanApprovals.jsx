import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';

export default function DeanApprovals() {
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const res = await apiAuth(`/api/auth/registrations?status=${encodeURIComponent(status)}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load requests');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function approve(id) {
    if (!confirm('Approve this request?')) return;
    try {
      await apiAuth(`/api/auth/registrations/${encodeURIComponent(id)}/approve`, { method: 'PATCH', body: {} });
      await load();
    } catch (err) {
      alert(err.message || 'Approve failed');
    }
  }

  async function reject(id) {
    const reason = prompt('Rejection reason (optional):') || '';
    try {
      await apiAuth(`/api/auth/registrations/${encodeURIComponent(id)}/reject`, {
        method: 'PATCH',
        body: { reason },
      });
      await load();
    } catch (err) {
      alert(err.message || 'Reject failed');
    }
  }

  return (
    <main>
      <h2>Dean: Registration Approvals</h2>
      <div>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
          </select>
        </label>
        <button onClick={load} disabled={busy}>
          Refresh
        </button>
      </div>
      {error ? <p>{error}</p> : null}
      {busy ? <p>Loading...</p> : null}
      {data ? (
        <div>
          <p>
            Department: {data.department?.code ? `${data.department.code} - ${data.department.name}` : String(data.department)}
            {' | '}
            Count: {data.count}
          </p>
          <ul>
            {(data.requests || []).map((r) => (
              <li key={r._id}>
                <div>
                  <div>
                    <strong>{r.name}</strong> ({r.email})
                  </div>
                  <div>
                    Dept:{' '}
                    {r.department?.code ? `${r.department.code} - ${r.department.name}` : String(r.department)} | Program:{' '}
                    {r.program?.code ? `${r.program.code} - ${r.program.name}` : String(r.program)}
                  </div>
                  <div>Status: {r.status}</div>
                  {r.rejectionReason ? <div>Reason: {r.rejectionReason}</div> : null}
                  <div>
                    {status === 'pending' ? (
                      <>
                        <button onClick={() => approve(r._id)}>Approve</button>{' '}
                        <button onClick={() => reject(r._id)}>Reject</button>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
      ) : null}
    </main>
  );
}

