import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/QuestionApprovals.css';

const BASE = 'http://localhost:5000';

const STATE_FILTERS = ['all', 'pending_chair', 'returned', 'approved', 'rejected'];

const STATE_LABELS = {
  pending_chair: 'Pending Review',
  returned: 'Returned for Revision',
  approved: 'Approved',
  rejected: 'Rejected',
};

const LOCK_STALE_MS = 10 * 60 * 1000; // 10 minutes

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStateLabel(state) {
  return STATE_LABELS[state] || state;
}

function truncateText(text, max = 100) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function isBeingEvaluated(question, meId) {
  if (!question.currentReviewer || !question.reviewStartedAt) return false;
  const reviewerId = question.currentReviewer?._id || question.currentReviewer;
  if (reviewerId === meId) return false;
  const elapsed = Date.now() - new Date(question.reviewStartedAt).getTime();
  return elapsed < LOCK_STALE_MS;
}

function formatRoleLabel(role) {
  const map = { dean: 'Dean', program_chair: 'Program Chair', professor: 'Professor' };
  return map[role] || role;
}

export default function QuestionApprovals({ me }) {
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionModal, setActionModal] = useState(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState('newest');
  const [lockedQuestionId, setLockedQuestionId] = useState(null);
  const [warningModal, setWarningModal] = useState(null);
  const [actionTaken, setActionTaken] = useState(false);
  const itemsPerPage = 10;
  const programLabel = me?.program?.name || me?.program?.code || '';
  const lockedIdRef = useRef(null);

  // Keep ref in sync for beforeunload
  useEffect(() => { lockedIdRef.current = lockedQuestionId; }, [lockedQuestionId]);

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

  // Unlock on tab close via fetch keepalive (supports PATCH unlike sendBeacon)
  useEffect(() => {
    const handleUnload = () => {
      const id = lockedIdRef.current;
      if (!id) return;
      const token = window.localStorage.getItem('nu_board_token');
      if (!token) return;
      fetch(`${BASE}/api/questions/${id}/unlock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
        keepalive: true,
      });
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  async function unlockCurrent() {
    if (!lockedQuestionId) return;
    try {
      await apiAuth(`${BASE}/api/questions/${lockedQuestionId}/unlock`, { method: 'PATCH' });
    } catch { /* best effort */ }
    setLockedQuestionId(null);
  }

  async function handleSelectQuestion(question) {
    // If clicking the already-selected question, do nothing
    if (selectedQuestion?._id === question._id) return;

    // Unlock previous if no action was taken
    if (lockedQuestionId && !actionTaken) {
      await unlockCurrent();
    }

    setActionTaken(false);

    // Only lock pending_chair questions (the ones that can be acted on concurrently)
    if (question.state === 'pending_chair') {
      try {
        await apiAuth(`${BASE}/api/questions/${question._id}/lock`, { method: 'PATCH' });
        setLockedQuestionId(question._id);
        setSelectedQuestion(question);
      } catch (err) {
        if (err.status === 423) {
          // Show warning modal
          setWarningModal({
            question,
            reviewer: err.data?.reviewer || { name: 'Unknown', role: 'unknown' },
            minutesElapsed: err.data?.minutesElapsed || 0,
          });
        } else {
          setSelectedQuestion(question);
        }
      }
    } else {
      setSelectedQuestion(question);
    }
  }

  function handleWarningProceed() {
    if (!warningModal) return;
    setSelectedQuestion(warningModal.question);
    setLockedQuestionId(warningModal.question._id);
    setWarningModal(null);
  }

  async function handleCloseSidebar() {
    if (!actionTaken && lockedQuestionId) {
      await unlockCurrent();
    }
    setSelectedQuestion(null);
    setActionTaken(false);
    setLockedQuestionId(null);
  }

  async function handleApprove(question) {
    if (!window.confirm(`Approve "${question.title}"? It will be marked as approved and ready to use.`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${question._id}/review`, {
        method: 'POST',
        body: { action: 'approve' },
      });
      setActionTaken(true);
      setLockedQuestionId(null);
      setQuestions((prev) => prev.map((item) => (
        item._id === question._id ? { ...item, state: 'approved', currentReviewer: null, reviewStartedAt: null } : item
      )));
      setSelectedQuestion((prev) => (
        prev && prev._id === question._id ? { ...prev, state: 'approved', currentReviewer: null, reviewStartedAt: null } : prev
      ));
    } catch (err) {
      if (err.status === 409) {
        alert('This question has already been reviewed by someone else.');
        fetchApprovals();
        setSelectedQuestion(null);
      } else {
        alert(err.message || 'Failed to approve question.');
      }
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
        body: { action: actionModal.action, note: note.trim() },
      });

      setActionTaken(true);
      setLockedQuestionId(null);
      const newState = actionModal.action === 'return' ? 'returned' : 'rejected';
      const updatedQuestion = {
        ...actionModal.question,
        state: newState,
        currentReviewer: null,
        reviewStartedAt: null,
        ...(newState === 'returned'
          ? { revisionNote: note.trim() }
          : { rejectionReason: note.trim() }),
      };

      setQuestions((prev) => prev.map((item) => (
        item._id === actionModal.question._id ? updatedQuestion : item
      )));
      setSelectedQuestion(updatedQuestion);
      setActionModal(null);
      setNote('');
    } catch (err) {
      if (err.status === 409) {
        alert('This question has already been reviewed by someone else.');
        fetchApprovals();
        setSelectedQuestion(null);
        setActionModal(null);
        setNote('');
      } else {
        alert(err.message || 'Failed to submit review.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRestore(question) {
    if (!window.confirm(`Restore "${question.title}" to pending review queue?`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${question._id}/review`, {
        method: 'POST',
        body: { action: 'restore' },
      });
      const updated = { ...question, state: 'pending_chair', rejectionReason: null, currentReviewer: null, reviewStartedAt: null };
      setQuestions((prev) => prev.map((item) => (
        item._id === question._id ? updated : item
      )));
      setSelectedQuestion(updated);
    } catch (err) {
      if (err.status === 409) {
        alert('This question has already been modified by someone else.');
        fetchApprovals();
        setSelectedQuestion(null);
      } else {
        alert(err.message || 'Failed to restore question.');
      }
    }
  }

  async function handleDelete(question) {
    if (!window.confirm(`Permanently delete "${question.title}"? This cannot be undone.`)) return;
    try {
      await apiAuth(`${BASE}/api/questions/${question._id}/review`, {
        method: 'POST',
        body: { action: 'delete' },
      });
      setQuestions((prev) => prev.filter((item) => item._id !== question._id));
      setSelectedQuestion(null);
    } catch (err) {
      if (err.status === 409) {
        alert('This question has already been modified by someone else.');
        fetchApprovals();
        setSelectedQuestion(null);
      } else {
        alert(err.message || 'Failed to delete question.');
      }
    }
  }

  const subjectOptions = useMemo(() => {
    const map = new Map();
    tags.forEach((tag) => {
      if (tag?._id && tag?.name) {
        map.set(String(tag._id), { id: String(tag._id), name: tag.name });
      }
    });
    questions.forEach((question) => {
      const id = question.tag?._id || question.tag;
      const name = question.tag?.name;
      if (id && name && !map.has(String(id))) {
        map.set(String(id), { id: String(id), name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions, tags]);

  const programOptions = useMemo(() => {
    const map = new Map();
    questions.forEach((q) => {
      const id = q.program?._id || q.program;
      const name = q.program?.name || q.program?.code;
      if (id && name && !map.has(String(id))) {
        map.set(String(id), { id: String(id), name });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [questions]);

  const counts = useMemo(() => {
    const result = { all: questions.length };
    STATE_FILTERS.forEach((state) => {
      if (state === 'all') return;
      result[state] = questions.filter((question) => question.state === state).length;
    });
    return result;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    const next = questions.filter((question) => {
      if (filter !== 'all' && question.state !== filter) return false;
      if (subjectFilter) {
        const qTag = question.tag?._id || question.tag;
        if (String(qTag) !== String(subjectFilter)) return false;
      }
      if (programFilter) {
        const qProgram = question.program?._id || question.program;
        if (String(qProgram) !== String(programFilter)) return false;
      }
      if (!needle) return true;
      const content = [question.title, question.description, question.tag?.name, question.createdBy?.name]
        .filter(Boolean).join(' ').toLowerCase();
      return content.includes(needle);
    });
    next.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.submittedAt || a.createdAt || 0) - new Date(b.submittedAt || b.createdAt || 0);
      }
      return new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0);
    });
    return next;
  }, [questions, filter, searchQuery, subjectFilter, programFilter, sortBy]);

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
  }, [filter, searchQuery, subjectFilter, programFilter, sortBy]);

  return (
    <main className="ca-page">
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
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
        {me?.role === 'dean' && (
          <select
            className="ca-filter-select"
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
          >
            <option value="">Filter: All Programs</option>
            {programOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <select
          className="ca-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
        </select>
      </div>

      <div className="ca-layout">
        <div className="ca-list-panel">
          {loading ? (
            <div className="ca-empty">Loading questions...</div>
          ) : filteredQuestions.length === 0 ? (
            <div className="ca-empty">No questions found.</div>
          ) : (
            <>
              <div className="ca-questions-list">
                {paginatedQuestions.map((question) => (
                  <div
                    key={question._id}
                    className={`ca-question-card ${selectedQuestion?._id === question._id ? 'is-active' : ''}`}
                    onClick={() => handleSelectQuestion(question)}
                  >
                    <div className="ca-card-top">
                      <div>
                        <h3 className="ca-card-title">{question.title}</h3>
                        <p className="ca-card-desc">{truncateText(question.description, 100)}</p>
                      </div>
                      <div className="ca-card-badges">
                        <div className={`ca-state-badge ca-state--${question.state}`}>
                          {question.state === 'pending_chair' ? 'Pending' : formatStateLabel(question.state)}
                        </div>
                        {isBeingEvaluated(question, me?._id) && (
                          <div className="ca-evaluating-badge">
                            <span className="ca-evaluating-dot" />
                            Being Evaluated
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="ca-card-meta">
                      <span className="ca-tag-pill">{question.tag?.name || 'N/A'}</span>
                      <span className="ca-author">{question.createdBy?.name || 'Unknown'}</span>
                      <span className="ca-date">{formatDate(question.submittedAt)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {filteredQuestions.length > 0 && (
                <div className="ca-pagination">
                  <div className="ca-pagination-info">
                    Showing {filteredQuestions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredQuestions.length)} of {filteredQuestions.length} questions
                  </div>
                  <div className="ca-pagination-controls">
                    <button className="ca-pagination-btn" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>Previous</button>
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
                    <button className="ca-pagination-btn" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {selectedQuestion ? (
          <div className="ca-sidebar">
            <div className="ca-sidebar-header">
              <h2 className="ca-sidebar-title">Review Question</h2>
              <button className="ca-sidebar-close" onClick={handleCloseSidebar}>x</button>
            </div>

            <div className="ca-sidebar-content">
              <section className="ca-section">
                <h3 className="ca-section-label">Question</h3>
                <h4 className="ca-question-detail-title">{selectedQuestion.title}</h4>
                <p className="ca-question-detail-text">{selectedQuestion.description}</p>
              </section>

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
                  {me?.role === 'dean' && (
                    <div>
                      <span className="ca-meta-label">Program</span>
                      <div className="ca-meta-value">
                        {selectedQuestion.program?.name || selectedQuestion.program?.code || 'N/A'}
                      </div>
                    </div>
                  )}
                </div>
              </section>

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

            <div className="ca-sidebar-actions">
              {selectedQuestion.state === 'pending_chair' ? (
                <>
                  <button className="ca-btn ca-btn--approve" onClick={() => handleApprove(selectedQuestion)}>Approve</button>
                  <button className="ca-btn ca-btn--return" onClick={() => { setActionModal({ question: selectedQuestion, action: 'return' }); setNote(''); }}>Return for Revision</button>
                  <button className="ca-btn ca-btn--reject" onClick={() => { setActionModal({ question: selectedQuestion, action: 'reject' }); setNote(''); }}>Reject</button>
                </>
              ) : selectedQuestion.state === 'rejected' ? (
                <>
                  <button className="ca-btn ca-btn--restore" onClick={() => handleRestore(selectedQuestion)}>Restore to Review</button>
                  <button className="ca-btn ca-btn--delete" onClick={() => handleDelete(selectedQuestion)}>Delete Permanently</button>
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

      {/* Return / Reject Action Modal */}
      {actionModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal">
            <div className="ca-modal-header">
              <h3>{actionModal.action === 'return' ? 'Return for Revision' : 'Reject Question'}</h3>
              <button className="ca-modal-close" onClick={() => setActionModal(null)} type="button">x</button>
            </div>
            <div className="ca-modal-body">
              <div><strong>Question:</strong> {actionModal.question.title}</div>
              <div className="ca-form-group">
                <label className="ca-label">
                  <strong>{actionModal.action === 'return' ? 'Revision Note (required)' : 'Rejection Reason (required)'}</strong>
                </label>
                <textarea
                  className="ca-textarea"
                  rows="5"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={actionModal.action === 'return' ? 'Explain what needs to be fixed...' : 'Explain why this question is being rejected...'}
                  autoFocus
                />
              </div>
            </div>
            <div className="ca-modal-footer">
              <button className="ca-btn-cancel" onClick={() => setActionModal(null)} disabled={submitting}>Cancel</button>
              <button className="ca-btn-submit" onClick={submitAction} disabled={submitting || !note.trim()}>
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Concurrency Warning Modal */}
      {warningModal && (
        <div className="ca-modal-overlay">
          <div className="ca-modal ca-modal--warning">
            <div className="ca-modal-header ca-modal-header--warning">
              <h3>⚠️ Question Being Reviewed</h3>
              <button className="ca-modal-close" onClick={() => setWarningModal(null)} type="button">x</button>
            </div>
            <div className="ca-modal-body">
              <div className="ca-warning-content">
                <div className="ca-warning-icon">🔍</div>
                <p className="ca-warning-text">
                  <strong>{warningModal.reviewer.name}</strong> ({formatRoleLabel(warningModal.reviewer.role)}) has been reviewing this question for <strong>{warningModal.minutesElapsed} minute{warningModal.minutesElapsed !== 1 ? 's' : ''}</strong>. Proceeding may cause a conflict.
                </p>
              </div>
            </div>
            <div className="ca-modal-footer">
              <button className="ca-btn-cancel" onClick={() => setWarningModal(null)}>Go Back</button>
              <button className="ca-btn-submit ca-btn-submit--warning" onClick={handleWarningProceed}>Evaluate Anyway</button>
            </div>
          </div>
        </div>
      )}

      {fullscreenImage && (
        <div className="ca-image-overlay" onClick={() => setFullscreenImage(null)}>
          <div className="ca-image-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <img src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}
    </main>
  );
}
