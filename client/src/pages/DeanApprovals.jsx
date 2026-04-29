import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/StudentManager.css';

export default function DeanApprovals({ embedded = false }) {
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
      {!embedded ? <h2>Dean: Registration Approvals</h2> : null}

      {!embedded ? (
        <>
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
        </>
      ) : (
        <section className="sm-card">
          <div className="sm-card-header">
            <div>
              <h3>User Management</h3>
              <p>Below are the users waiting for approval</p>
            </div>
            <div className="sm-card-summary">
              <span className="sm-card-summary-label">Pending</span>
              <strong className="sm-card-summary-value">{data?.count || 0}</strong>
            </div>
          </div>

          {error ? <p className="sm-feedback sm-feedback--error">{error}</p> : null}
          {busy ? <p className="sm-feedback">Loading pending registrations...</p> : null}

          {!busy ? (
            <div className="sm-table-wrap">
              <table className="sm-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>ID Number</th>
                    <th>Role</th>
                    <th>Program</th>
                    <th>Review Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.requests || []).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="sm-empty">
                        No pending registrations found.
                      </td>
                    </tr>
                  ) : (
                    (data?.requests || []).map((request) => (
                      <tr key={request._id}>
                        <td>
                          <div className="sm-user-cell">
                            <strong>{request.name}</strong>
                            <span>{request.email}</span>
                          </div>
                        </td>
                        <td>{request.studentId || request.alumniId || '-'}</td>
                        <td>
                          <span className={`sm-role-pill sm-role-pill--${request.userType}`}>
                            {request.userType === 'alumni' ? 'Alumni' : 'Student'}
                          </span>
                        </td>
                        <td>{request.program?.code || request.program?.name || '-'}</td>
                        <td>
                          <div className="sm-action-row">
                            <button type="button" className="sm-btn sm-btn--approve" onClick={() => approve(request._id)}>
                              Approve
                            </button>
                            <button type="button" className="sm-btn sm-btn--reject" onClick={() => reject(request._id)}>
                              Reject with Feedback
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}
    </main>
  );
}
