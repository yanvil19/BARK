import { useEffect, useState, useCallback } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/ChairApprovals.css';

const BASE = 'http://localhost:5000';

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ChairApprovals({ me }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null); // { question, action: 'return' | 'reject' }
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('pending_chair'); // default to pending

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiAuth(`${BASE}/api/questions/approvals`);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  async function handleApprove(q) {
    if (!window.confirm(`Approve "${q.title}"? It will be sent to the Dean for final review.`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${q._id}/review`, {
        method: 'POST',
        body: { action: 'approve' }
      });
      setQuestions((prev) => prev.map((x) => x._id === q._id ? { ...x, state: 'pending_dean' } : x));
    } catch (err) {
      alert(err.message || 'Failed to approve question.');
    }
  }

  async function submitAction() {
    if (!note.trim()) {
      alert(`A ${actionModal.action === 'return' ? 'revision note' : 'rejection reason'} is required.`);
      return;
    }
    setSubmitting(true);
    try {
      await apiAuth(`${BASE}/api/questions/${actionModal.question._id}/review`, {
        method: 'POST',
        body: { action: actionModal.action, note: note.trim() }
      });
      const newState = actionModal.action === 'return' ? 'returned' : 'rejected';
      setQuestions((prev) => prev.map((x) => x._id === actionModal.question._id ? { 
        ...x, 
        state: newState, 
        ...(newState === 'returned' ? { revisionNote: note.trim() } : { rejectionReason: note.trim() })
      } : x));
      setActionModal(null);
      setNote('');
    } catch (err) {
      alert(err.message || 'Failed to submit review.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore(q) {
    if (!window.confirm(`Restore "${q.title}" to pending review queue?`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${q._id}/review`, {
        method: 'POST',
        body: { action: 'restore' }
      });
      // Updating state to 'pending_chair' to keep it in the list (since listApprovals fetches both)
      setQuestions((prev) => prev.map((x) => x._id === q._id ? { ...x, state: 'pending_chair', rejectionReason: null } : x));
    } catch (err) {
      alert(err.message || 'Failed to restore question.');
    }
  }

  async function handleDelete(q) {
    if (!window.confirm(`Permanently delete "${q.title}"? This cannot be undone.`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${q._id}/review`, {
        method: 'POST',
        body: { action: 'delete' }
      });
      setQuestions((prev) => prev.filter((x) => x._id !== q._id));
    } catch (err) {
      alert(err.message || 'Failed to delete question.');
    }
  }

  function toggleExpand(id) {
    setExpandedId(expandedId === id ? null : id);
  }

  const filtered = questions.filter((q) => {
    if (filter === 'all') return true;
    if (filter === 'approved') return q.state === 'pending_dean' || q.state === 'approved';
    return q.state === filter;
  });

  return (
    <div>
      <h1>Approve Questions</h1>
      <p>Questions submitted by faculty for Program Chair review.</p>

      <hr />

      <div style={{ marginBottom: 16 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '6px 12px', fontSize: '14px' }}>
          <option value="all">All</option>
          <option value="pending_chair">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="returned">Return for Revision</option>
        </select>
      </div>

      {loading ? (
        <p>Loading questions…</p>
      ) : filtered.length === 0 ? (
        <p>No questions found for this filter.</p>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Subject</th>
              <th>State</th>
              <th>Submitted At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => {
              const isExpanded = expandedId === q._id;
              return (
                <tr key={q._id}>
                  <td>
                    <strong>{q.title}</strong>
                    <br />
                    <button type="button" onClick={() => toggleExpand(q._id)}>
                      {isExpanded ? 'Hide Details' : 'View Question Details'}
                    </button>
                    {isExpanded && (
                      <div>
                        <hr />
                        <p>{q.description}</p>
                        
                        {q.images && q.images.length > 0 && (
                          <div>
                            {q.images.map((img, i) => (
                              <img key={i} src={img.startsWith('/') ? `${BASE}${img}` : img} alt="" width="150" />
                            ))}
                          </div>
                        )}

                        <p><strong>Answers:</strong></p>
                        <ul>
                          {q.answers.map((ans, i) => (
                            <li key={i}>
                              {ans.text} {ans.isCorrect && <strong>(Correct)</strong>}
                            </li>
                          ))}
                        </ul>
                        <hr />
                      </div>
                    )}
                  </td>
                  <td>{q.createdBy?.name}</td>
                  <td>{q.tag?.name}</td>
                  <td>
                    {q.state === 'rejected' ? (
                      <div>
                        <strong>Rejected</strong>
                        <p style={{ color: 'red', fontSize: '12px', margin: '4px 0 0 0' }}>{q.rejectionReason}</p>
                      </div>
                    ) : q.state === 'returned' ? (
                      <div>
                        <strong>Returned</strong>
                        <p style={{ color: 'orange', fontSize: '12px', margin: '4px 0 0 0' }}>{q.revisionNote}</p>
                      </div>
                    ) : q.state === 'pending_dean' || q.state === 'approved' ? (
                      <strong style={{ color: 'green' }}>Approved</strong>
                    ) : (
                      <strong>Pending Review</strong>
                    )}
                  </td>
                  <td>{formatDate(q.submittedAt)}</td>
                  <td>
                    {q.state === 'pending_chair' ? (
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                        <button onClick={() => handleApprove(q)}>Approve</button>
                        <br />
                        <button onClick={() => { setActionModal({ question: q, action: 'return' }); setNote(''); }}>Return</button>
                        <br />
                        <button onClick={() => { setActionModal({ question: q, action: 'reject' }); setNote(''); }}>Reject</button>
                      </div>
                    ) : q.state === 'rejected' ? (
                      <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                        <button onClick={() => handleRestore(q)}>Restore</button>
                        <br />
                        <button onClick={() => handleDelete(q)}>Delete</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#666' }}>No actions available</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Action Modal (Return / Reject) */}
      {actionModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{actionModal.action === 'return' ? 'Return for Revision' : 'Reject Question'}</h2>
            <p><strong>Question:</strong> {actionModal.question.title}</p>

            <label>
              <strong>{actionModal.action === 'return' ? 'Revision Note (required):' : 'Rejection Reason (required):'}</strong>
            </label>
            <br />
            <textarea
              rows="5"
              cols="50"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={actionModal.action === 'return' ? "Explain what needs to be fixed..." : "Explain why this question is being rejected..."}
              autoFocus
            />

            <br />
            <button onClick={() => setActionModal(null)} disabled={submitting}>Cancel</button>
            <button onClick={submitAction} disabled={submitting || !note.trim()}>
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
