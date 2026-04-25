import { useEffect, useState, useCallback } from 'react';
import { apiAuth } from '../lib/api.js';
import QuestionForm from '../components/QuestionForm.jsx';
import '../styles/QuestionsPage.css';

const BASE = 'http://localhost:5000';

const STATE_LABELS = {
  draft: 'Draft',
  pending_chair: 'Pending Chair Review',
  returned: 'Returned for Revision',
  pending_dean: 'Pending Dean Review',
  approved: 'Approved',
  in_use: 'In Use',
  retired: 'Retired',
  rejected: 'Rejected',
};

const ALL_STATES = Object.keys(STATE_LABELS);

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function QuestionsPage({ me, role, programId, programLabel, programs, onProgramChange }) {
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editQuestion, setEditQuestion] = useState(null);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiAuth(`${BASE}/api/questions`);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    if (!programId) return;
    try {
      const url = role === 'dean'
        ? `${BASE}/api/tags?program=${programId}`
        : `${BASE}/api/tags`;
      const data = await apiAuth(url);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [programId, role]);

  useEffect(() => { fetchQuestions(); }, [fetchQuestions]);
  useEffect(() => { fetchTags(); }, [fetchTags]);

  const programFilteredQuestions = questions.filter((q) => {
    if (role === 'dean' && programId) {
      const qProg = q.program?._id || q.program;
      if (String(qProg) !== String(programId)) return false;
    }
    return true;
  });

  const filtered = programFilteredQuestions.filter((q) => filter === 'all' || q.state === filter);

  function handleSaved(newQuestion, isEdit) {
    if (isEdit) {
      setQuestions((prev) => prev.map((q) => (q._id === newQuestion._id ? newQuestion : q)));
    } else {
      setQuestions((prev) => [newQuestion, ...prev]);
    }
    setShowForm(false);
    setEditQuestion(null);
  }

  async function handleDelete(q) {
    if (!window.confirm(`Delete "${q.title}"?`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${q._id}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((x) => x._id !== q._id));
    } catch (err) {
      alert(err.message || 'Failed to delete question.');
    }
  }

  async function handleSubmit(q) {
    if (!window.confirm(`Submit "${q.title}" for Chair review? You won't be able to edit it after this.`)) return;
    try {
      const data = await apiAuth(`${BASE}/api/questions/${q._id}/submit`, { method: 'POST' });
      setQuestions((prev) => prev.map((x) => (x._id === q._id ? data.question : x)));
    } catch (err) {
      alert(err.message || 'Failed to submit question.');
    }
  }

  return (
    <div>
      <h1>My Questions</h1>
      <p>{role === 'dean' ? 'Creating questions for your department programs' : `${programLabel || 'Your Program'}`}</p>

      {/* Dean: Program Selector */}
      {role === 'dean' && (
        <div>
          <label><strong>Select Program: </strong></label>
          <select value={programId || ''} onChange={(e) => onProgramChange(e.target.value)}>
            <option value="">— Select a program —</option>
            {programs.map((p) => (
              <option key={p._id} value={p._id}>{p.name} ({p.code})</option>
            ))}
          </select>
        </div>
      )}

      <hr />

      {/* Stats */}
      <div>
        {['draft', 'pending_chair', 'returned', 'approved'].map((s) => (
          <span key={s} style={{ marginRight: 16 }}>
            <strong>{programFilteredQuestions.filter((q) => q.state === s).length}</strong> {STATE_LABELS[s]}
          </span>
        ))}
      </div>

      <br />

      {/* Filter + New Button */}
      <div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All ({programFilteredQuestions.length})</option>
          {ALL_STATES.map((s) => (
            <option key={s} value={s}>
              {STATE_LABELS[s]} ({programFilteredQuestions.filter((q) => q.state === s).length})
            </option>
          ))}
        </select>
        {' '}
        {(role !== 'dean' || programId) && (
          <button onClick={() => setShowForm(true)}>+ New Question</button>
        )}
      </div>

      <br />

      {/* Question List */}
      {loading ? (
        <p>Loading questions…</p>
      ) : filtered.length === 0 ? (
        <p>{filter === 'all' ? 'No questions yet. Create your first one!' : `No ${STATE_LABELS[filter] || filter} questions.`}</p>
      ) : (
        <table border="1" cellPadding="8">
          <thead>
            <tr>
              <th>Title</th>
              <th>Subject</th>
              {role === 'dean' && <th>Program</th>}
              <th>State</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q._id}>
                <td>
                  <strong>{q.title}</strong>
                  <br />
                  <small>{q.description?.slice(0, 80)}{q.description?.length > 80 ? '…' : ''}</small>
                  {q.state === 'returned' && q.revisionNote && (
                    <><br /><strong>Note:</strong> {q.revisionNote}</>
                  )}
                  {q.state === 'rejected' && q.rejectionReason && (
                    <><br /><strong>Rejected:</strong> {q.rejectionReason}</>
                  )}
                </td>
                <td>{q.tag?.name || '—'}</td>
                {role === 'dean' && <td>{q.program?.code || q.program?.name || '—'}</td>}
                <td><strong>{STATE_LABELS[q.state] || q.state}</strong></td>
                <td>{formatDate(q.updatedAt)}</td>
                <td>
                  {q.state === 'draft' && (
                    <>
                      <button onClick={() => { setEditQuestion(q); setShowForm(true); }}>Edit</button>{' '}
                      <button onClick={() => handleSubmit(q)}>Submit</button>{' '}
                      <button onClick={() => handleDelete(q)}>Delete</button>
                    </>
                  )}
                  {q.state === 'returned' && (
                    <>
                      <button onClick={() => { setEditQuestion(q); setShowForm(true); }}>Edit</button>{' '}
                      <button onClick={() => handleSubmit(q)}>Re-submit</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* New/Edit Question Modal */}
      {showForm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{editQuestion ? 'Edit Question' : 'New Question'}</h2>
            <hr />
            <QuestionForm
              tags={tags}
              programId={programId}
              initialData={editQuestion}
              onSaved={handleSaved}
              onClose={() => { setShowForm(false); setEditQuestion(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
