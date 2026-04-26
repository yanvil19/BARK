import { useEffect, useState, useCallback, useMemo } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/ChairApprovals.css';

const BASE = 'http://localhost:5000';

const STATE_FILTERS = ['all', 'pending_chair', 'returned', 'approved', 'rejected'];

const STATE_LABELS = {
  pending_chair: 'Pending Review',
  returned: 'Returned for Revision',
  approved: 'Approved',
  rejected: 'Rejected',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStateLabel(state) {
  return STATE_LABELS[state] || state;
}

function truncateText(text, max = 100) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export default function ChairApprovals({ me }) {
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const programLabel = me?.program?.name || me?.program?.code || '';

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

  const fetchTags = useCallback(async () => {
    try {
      const data = await apiAuth(`${BASE}/api/tags`);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, []);

  useEffect(() => { 
    fetchApprovals(); 
    fetchTags();
  }, [fetchApprovals, fetchTags]);

  async function handleApprove(q) {
    if (!window.confirm(`Approve "${q.title}"? It will be marked as approved and ready to use.`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${q._id}/review`, {
        method: 'POST',
        body: { action: 'approve' }
      });
      setQuestions((prev) => prev.map((x) => x._id === q._id ? { ...x, state: 'approved' } : x));
      setSelectedQuestion((prev) => prev && prev._id === q._id ? { ...prev, state: 'approved' } : prev);
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
      const updatedQuestion = {
        ...actionModal.question,
        state: newState,
        ...(newState === 'returned' ? { revisionNote: note.trim() } : { rejectionReason: note.trim() })
      };
      setQuestions((prev) => prev.map((x) => x._id === actionModal.question._id ? updatedQuestion : x));
      setSelectedQuestion(updatedQuestion);
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
      const updated = { ...q, state: 'pending_chair', rejectionReason: null };
      setQuestions((prev) => prev.map((x) => x._id === q._id ? updated : x));
      setSelectedQuestion(updated);
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
      setSelectedQuestion(null);
    } catch (err) {
      alert(err.message || 'Failed to delete question.');
    }
  }

  const subjectOptions = useMemo(() => {
    const map = new Map();
    tags.forEach((tag) => {
      if (tag?._id && tag?.name) {
        map.set(String(tag._id), { id: String(tag._id), name: tag.name });
      }
    });
    questions.forEach((q) => {
      const id = q.tag?._id || q.tag;
      const name = q.tag?.name;
      if (id && name && !map.has(String(id))) {
        map.set(String(id), { id: String(id), name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, tags]);

  const counts = useMemo(() => {
    const result = { all: questions.length };
    STATE_FILTERS.forEach((state) => {
      if (state === 'all') return;
      result[state] = questions.filter((q) => q.state === state).length;
    });
    return result;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    
    let result = questions.filter((q) => {
      if (filter !== 'all' && q.state !== filter) return false;
      
      if (subjectFilter) {
        const qTag = q.tag?._id || q.tag;
        if (String(qTag) !== String(subjectFilter)) return false;
      }

      if (!needle) return true;

      const content = [
        q.title,
        q.description,
        q.tag?.name,
        q.createdBy?.name,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return content.includes(needle);
    });

    return result;
  }, [questions, filter, searchQuery, subjectFilter]);

  const { paginatedQuestions, totalPages } = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedQuestions: filteredQuestions.slice(startIndex, endIndex),
      totalPages: Math.ceil(filteredQuestions.length / itemsPerPage),
    };
  }, [filteredQuestions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, subjectFilter]);

  return (
    <main className="ca-page">
      {/* ── Header ─────────────────────────────────────── */}
      <header className="ca-page-header">
        <div className="ca-header">
          <div>
            <h1 className="ca-title">Questions for Review and Approval</h1>
            <p className="ca-subtitle">Questions submitted by faculty for Program Chair review</p>
          </div>
          <div className="ca-header-actions">
            {programLabel ? <span className="ca-program-chip">{programLabel}</span> : null}
          </div>
        </div>
      </header>

      {/* ── Status Pills ────────────────────────────── */}
      <div className="ca-state-pills">
        {STATE_FILTERS.map((state) => (
          <button
            key={state}
            type="button"
            className={`ca-state-pill ${filter === state ? 'ca-state-pill--active' : ''}`}
            onClick={() => setFilter(state)}
          >
            <span className="ca-state-pill-count">{counts[state] || 0}</span>
            <span>{state === 'all' ? 'All' : formatStateLabel(state)}</span>
          </button>
        ))}
      </div>

      {/* ── Filters & Search ─────────────────────────── */}
      <div className="ca-filters">
        <input
          className="ca-search"
          type="text"
          placeholder="Search questions..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="ca-filter-select"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        >
          <option value="">Filter: All Subjects</option>
          {subjectOptions.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>

      {/* ── Main Layout ────────────────────────────── */}
      <div className="ca-layout">
        {/* Left Column: Questions List */}
        <div className="ca-list-panel">
          {loading ? (
            <div className="ca-empty">Loading questions…</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="ca-empty">No questions found.</div>
          ) : (
            <>
              <div className="ca-questions-list">
                {paginatedQuestions.map((q) => (
                  <div
                    key={q._id}
                    className={`ca-question-card ${selectedQuestion?._id === q._id ? 'is-active' : ''}`}
                    onClick={() => setSelectedQuestion(q)}
                  >
                    <div className="ca-card-top">
                      <div>
                        <h3 className="ca-card-title">{q.title}</h3>
                        <p className="ca-card-desc">{truncateText(q.description, 100)}</p>
                      </div>
                      <div className={`ca-state-badge ca-state--${q.state}`}>
                        {q.state === 'pending_chair' ? 'Pending' : formatStateLabel(q.state)}
                      </div>
                    </div>
                    <div className="ca-card-meta">
                      <span className="ca-tag-pill">{q.tag?.name || 'N/A'}</span>
                      <span className="ca-author">{q.createdBy?.name || 'Unknown'}</span>
                      <span className="ca-date">{formatDate(q.submittedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="ca-pagination">
                  <button
                    className="ca-pagination-btn"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    ← Previous
                  </button>
                  <div className="ca-pagination-pages">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        className={`ca-pagination-page ${currentPage === page ? 'ca-pagination-page--active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    className="ca-pagination-btn"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Question Details Sidebar */}
        {selectedQuestion ? (
          <div className="ca-sidebar">
            <div className="ca-sidebar-header">
              <h2 className="ca-sidebar-title">Review Question</h2>
              <button
                className="ca-sidebar-close"
                onClick={() => setSelectedQuestion(null)}
              >
                ✕
              </button>
            </div>

            <div className="ca-sidebar-content">
              {/* Question Details */}
              <section className="ca-section">
                <h3 className="ca-section-label">Question</h3>
                <h4 className="ca-question-detail-title">{selectedQuestion.title}</h4>
                <p className="ca-question-detail-text">{selectedQuestion.description}</p>
              </section>

              {/* Images */}
              {selectedQuestion.images && selectedQuestion.images.length > 0 && (
                <section className="ca-section">
                  <h3 className="ca-section-label">Images</h3>
                  <div className="ca-images">
                    {selectedQuestion.images.map((img, i) => (
                      <img
                        key={i}
                        src={img.startsWith('/') ? `${BASE}${img}` : img}
                        alt={`Question image ${i + 1}`}
                        className="ca-image"
                        onClick={() => setFullscreenImage(img.startsWith('/') ? `${BASE}${img}` : img)}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Answers */}
              <section className="ca-section">
                <h3 className="ca-section-label">Answers</h3>
                <div className="ca-answers">
                  {selectedQuestion.answers.map((ans, i) => (
                    <div key={i} className="ca-answer-item">
                      <div className={`ca-answer-indicator ${ans.isCorrect ? 'is-correct' : ''}`}>
                        {ans.isCorrect ? '✓' : '○'}
                      </div>
                      <div className="ca-answer-text">{ans.text}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Metadata */}
              <section className="ca-section">
                <div className="ca-meta-grid">
                  <div>
                    <span className="ca-meta-label">Subject</span>
                    <div className="ca-meta-value">{selectedQuestion.tag?.name || 'N/A'}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Professor</span>
                    <div className="ca-meta-value">{selectedQuestion.createdBy?.name || 'Unknown'}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Date</span>
                    <div className="ca-meta-value">{formatDate(selectedQuestion.submittedAt)}</div>
                  </div>
                </div>
              </section>

              {/* Revision/Rejection Notes */}
              {selectedQuestion.state === 'returned' && selectedQuestion.revisionNote && (
                <section className="ca-section ca-section--note">
                  <h3 className="ca-section-label">Revision Note</h3>
                  <p className="ca-note-text">{selectedQuestion.revisionNote}</p>
                </section>
              )}

              {selectedQuestion.state === 'rejected' && selectedQuestion.rejectionReason && (
                <section className="ca-section ca-section--note">
                  <h3 className="ca-section-label">Rejection Reason</h3>
                  <p className="ca-note-text">{selectedQuestion.rejectionReason}</p>
                </section>
              )}
            </div>

            {/* Action Buttons */}
            <div className="ca-sidebar-actions">
              {selectedQuestion.state === 'pending_chair' ? (
                <>
                  <button
                    className="ca-btn ca-btn--approve"
                    onClick={() => handleApprove(selectedQuestion)}
                  >
                    Approve
                  </button>
                  <button
                    className="ca-btn ca-btn--return"
                    onClick={() => {
                      setActionModal({ question: selectedQuestion, action: 'return' });
                      setNote('');
                    }}
                  >
                    Return for Revision
                  </button>
                  <button
                    className="ca-btn ca-btn--reject"
                    onClick={() => {
                      setActionModal({ question: selectedQuestion, action: 'reject' });
                      setNote('');
                    }}
                  >
                    Reject
                  </button>
                </>
              ) : selectedQuestion.state === 'rejected' ? (
                <>
                  <button
                    className="ca-btn ca-btn--restore"
                    onClick={() => handleRestore(selectedQuestion)}
                  >
                    Restore to Review
                  </button>
                  <button
                    className="ca-btn ca-btn--delete"
                    onClick={() => handleDelete(selectedQuestion)}
                  >
                    Delete Permanently
                  </button>
                </>
              ) : (
                <p className="ca-no-actions">No actions available for this question.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select a question to view details</p>
          </div>
        )}
      </div>

      {/* Action Modal (Return / Reject) */}
      {actionModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>{actionModal.action === 'return' ? 'Return for Revision' : 'Reject Question'}</h3>
              <button
                className="ca-modal-close"
                onClick={() => setActionModal(null)}
                type="button"
              >
                ✕
              </button>
            </div>
            <div className="ca-modal-body">
              <div>
                <strong>Question:</strong> {actionModal.question.title}
              </div>
              <div className="ca-form-group">
                <label className="ca-label">
                  <strong>{actionModal.action === 'return' ? 'Revision Note (required)' : 'Rejection Reason (required)'}</strong>
                </label>
                <textarea
                  className="ca-textarea"
                  rows="5"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={actionModal.action === 'return' ? "Explain what needs to be fixed..." : "Explain why this question is being rejected..."}
                  autoFocus
                />
              </div>
            </div>
            <div className="ca-modal-footer">
              <button 
                className="ca-btn-cancel"
                onClick={() => setActionModal(null)} 
                disabled={submitting}
              >
                Cancel
              </button>
              <button 
                className="ca-btn-submit"
                onClick={submitAction} 
                disabled={submitting || !note.trim()}
              >
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div className="ca-image-overlay" onClick={() => setFullscreenImage(null)}>
          <div className="ca-image-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="ca-image-close"
              onClick={() => setFullscreenImage(null)}
            >
              Close
            </button>
            <img src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}
    </main>
  );
}
