import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import { Modal } from '../../components/Modal.jsx';
import '../../styles/StudentManager.css';

export default function DeanApprovals({ embedded = false }) {
  const [status, setStatus] = useState('pending');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(null);

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

  function openApproveModal(request) {
    setApproveModal(request);
  }

  async function approve() {
    if (!approveModal?._id) return;
    setActionBusy(true);
    try {
      await apiAuth(`/api/auth/registrations/${encodeURIComponent(approveModal._id)}/approve`, { method: 'PATCH', body: {} });
      await load();
      setApproveModal(null);
    } catch (err) {
      setFeedbackModal({
        title: 'Approve Failed',
        tone: 'danger',
        message: err.message || 'Approve failed',
      });
    } finally {
      setActionBusy(false);
    }
  }

  function openRejectModal(request) {
    setRejectModal(request);
    setRejectReason('');
    setRejectError('');
  }

  async function reject() {
    if (!rejectModal?._id) return;
    setActionBusy(true);
    setRejectError('');
    try {
      await apiAuth(`/api/auth/registrations/${encodeURIComponent(rejectModal._id)}/reject`, {
        method: 'PATCH',
        body: { reason: rejectReason.trim() },
      });
      await load();
      setRejectModal(null);
      setRejectReason('');
    } catch (err) {
      setRejectError(err.message || 'Reject failed');
      setFeedbackModal({
        title: 'Reject Failed',
        tone: 'danger',
        message: err.message || 'Reject failed',
      });
    } finally {
      setActionBusy(false);
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
                            <button onClick={() => openApproveModal(r)}>Approve</button>{' '}
                            <button onClick={() => openRejectModal(r)}>Reject</button>
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
                            <button type="button" className="sm-btn sm-btn--approve" onClick={() => openApproveModal(request)}>
                              Approve
                            </button>
                            <button type="button" className="sm-btn sm-btn--reject" onClick={() => openRejectModal(request)}>
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

      <ConfirmationModal
        open={!!approveModal}
        onClose={() => {
          if (actionBusy) return;
          setApproveModal(null);
        }}
        onConfirm={approve}
        title="Approve Registration"
        message={(
          <p style={{ margin: 0 }}>
            Approve the registration request for <strong>{approveModal?.name}</strong>?
          </p>
        )}
        confirmLabel="Approve Request"
        cancelLabel="Cancel"
        confirmVariant="primary"
        busy={actionBusy}
      />

      <Modal
        open={!!rejectModal}
        onClose={() => {
          if (actionBusy) return;
          setRejectModal(null);
          setRejectReason('');
          setRejectError('');
        }}
        title="Reject Registration"
        size="compact"
        bodyClassName="custom-modal-body--compact"
      >
        <div className="modal-confirmation">
          <div className="modal-confirmation-message">
            <p><strong>Request:</strong> {rejectModal?.name}</p>
          </div>
          <div className="modal-form-group">
            <label>Rejection Reason (optional)</label>
            <textarea
              className="modal-textarea"
              rows="5"
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                if (rejectError) setRejectError('');
              }}
              placeholder="Add feedback the student can use when reapplying..."
              autoFocus
            />
          </div>
        </div>

        {rejectError ? <p className="modal-error">{rejectError}</p> : null}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => {
              setRejectModal(null);
              setRejectReason('');
              setRejectError('');
            }}
            disabled={actionBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={reject}
            disabled={actionBusy}
          >
            {actionBusy ? 'Submitting...' : 'Reject Request'}
          </button>
        </div>
      </Modal>

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />
    </main>
  );
}
