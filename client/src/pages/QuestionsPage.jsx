import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { uploadDocumentForImport, submitImportedQuestions } from '../lib/importApi.js';
import QuestionForm from '../components/QuestionForm.jsx';
import { Modal } from '../components/Modal.jsx';
import '../styles/QuestionsPage.css';

const BASE = 'http://localhost:5000';

const STATE_LABELS = {
  draft: 'Draft',
  pending_chair: 'Pending Chair Review',
  returned: 'Returned for Revision',
  approved: 'Approved',
  in_use: 'In Use',
  retired: 'Retired',
  rejected: 'Rejected',
};

const STATE_FILTERS = ['all', 'draft', 'pending_chair', 'returned', 'approved'];
const ARCHIVAL_FILTERS = ['in_use', 'retired', 'rejected'];

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

export default function QuestionsPage({ role, programId, programLabel, programs = [], onProgramChange }) {
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [editQuestion, setEditQuestion] = useState(null);
  const [viewQuestion, setViewQuestion] = useState(null);
  // Import-related state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedQuestions, setImportedQuestions] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const moreMenuRef = useRef(null);

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
    if (!programId && role === 'dean') {
      setTags([]);
      return;
    }

    try {
      const url = role === 'dean' ? `${BASE}/api/tags?program=${programId}` : `${BASE}/api/tags`;
      const data = await apiAuth(url);
      setTags(data.tags || []);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  }, [programId, role]);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    function handlePointerDown(event) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target)) {
        setShowMoreMenu(false);
      }
    }

    function handleEscape(event) {
      if (event.key === 'Escape') {
        setShowMoreMenu(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, subjectFilter, sortBy]);

  const baseQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (role === 'dean' && programId) {
        const qProgram = q.program?._id || q.program;
        if (String(qProgram) !== String(programId)) return false;
      }
      return true;
    });
  }, [programId, questions, role]);

  const subjectOptions = useMemo(() => {
    const map = new Map();

    tags.forEach((tag) => {
      if (tag?._id && tag?.name) {
        map.set(String(tag._id), { id: String(tag._id), name: tag.name });
      }
    });

    baseQuestions.forEach((q) => {
      const id = q.tag?._id || q.tag;
      const name = q.tag?.name;
      if (id && name && !map.has(String(id))) {
        map.set(String(id), { id: String(id), name });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [baseQuestions, tags]);

  const counts = useMemo(() => {
    const result = { all: baseQuestions.length };
    [...STATE_FILTERS, ...ARCHIVAL_FILTERS].forEach((state) => {
      if (state === 'all') return;
      result[state] = baseQuestions.filter((q) => q.state === state).length;
    });
    return result;
  }, [baseQuestions]);

  const filteredQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    const next = baseQuestions.filter((q) => {
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
        q.program?.name,
        q.program?.code,
        q.revisionNote,
        q.rejectionReason,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return content.includes(needle);
    });

    next.sort((a, b) => {
      if (sortBy === 'oldest') {
        return new Date(a.updatedAt || a.createdAt || 0) - new Date(b.updatedAt || b.createdAt || 0);
      }

      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }

      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });

    return next;
  }, [baseQuestions, filter, searchQuery, sortBy, subjectFilter]);

  const { paginatedQuestions, totalPages } = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return {
      paginatedQuestions: filteredQuestions.slice(startIndex, endIndex),
      totalPages: Math.ceil(filteredQuestions.length / itemsPerPage),
    };
  }, [filteredQuestions, currentPage]);

  function closeFormModal() {
    setShowForm(false);
    setEditQuestion(null);
    setImportedQuestions([]);
  }

  function closeViewModal() {
    setShowViewModal(false);
    setViewQuestion(null);
  }

  function openCreateModal() {
    setEditQuestion(null);
    setShowForm(true);
  }

  function openEditModal(question) {
    setEditQuestion(question);
    setShowForm(true);
  }

  function openViewModal(question) {
    setViewQuestion(question);
    setShowViewModal(true);
  }

  function handleSaved(savedData, isEdit) {
    if (Array.isArray(savedData)) {
      if (isEdit && savedData.length === 1) {
        setQuestions((prev) => prev.map((q) => (q._id === savedData[0]._id ? savedData[0] : q)));
      } else {
        setQuestions((prev) => [...savedData, ...prev]);
      }
    } else {
      if (isEdit) {
        setQuestions((prev) => prev.map((q) => (q._id === savedData._id ? savedData : q)));
      } else {
        setQuestions((prev) => [savedData, ...prev]);
      }
    }
    closeFormModal();
  }

  function handleDelete(question) {
    setQuestionToDelete(question);
    setShowDeleteModal(true);
  }

  async function confirmDelete() {
    if (!questionToDelete) return;
    try {
      await apiAuth(`${BASE}/api/questions/${questionToDelete._id}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((item) => item._id !== questionToDelete._id));
      setShowDeleteModal(false);
      setQuestionToDelete(null);
    } catch (err) {
      alert(err.message || 'Failed to delete question.');
    }
  }

  async function handleSubmit(question) {
    if (!window.confirm(`Submit "${question.title}" for Chair review? You won't be able to edit it after this.`)) return;

    try {
      const data = await apiAuth(`${BASE}/api/questions/${question._id}/submit`, { method: 'POST' });
      setQuestions((prev) => prev.map((item) => (item._id === question._id ? data.question : item)));
    } catch (err) {
      alert(err.message || 'Failed to submit question.');
    }
  }

  function getPageTitle() {
    return 'My Questions';
  }

  function getPageSubtitle() {
    if (role === 'dean') return 'Create, edit, and manage your questions, then track their review statuses by program.';
    return 'Create, edit, and manage your question drafts and submissions';
  }

  const canCreateQuestion = role !== 'dean' || !!programId;
  const canImport = role !== 'dean' || !!programId;

  // ===== IMPORT HANDLERS =====

  function openImportModal() {
    setShowImportModal(true);
    setImportError(null);
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportError(null);
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e) {
      const file = e.target.files?.[0];
      if (!file) return;

      setImportLoading(true);
      setImportError(null);

      try {
          const result = await uploadDocumentForImport(file);

          const preFilledQuestions = result.questions.map(q => ({
              title: q.question_text?.substring(0, 100) || '',
              description: q.question_text || '',
              answers: Object.entries(q.options || {})
                  .filter(([, text]) => text !== null)
                  .map(([key, text]) => ({
                      text,
                      isCorrect: key === q.correct_answer,
                  })),
              flags: q.flags || [],
          }));

          if (preFilledQuestions.length === 0) {
              throw new Error('No questions could be extracted from this file. Please check the format and try again.');
          }

          setImportedQuestions(preFilledQuestions);
          setShowImportModal(false);
          setEditQuestion(null);
          setShowForm(true);

      } catch (error) {
          console.error('Import error:', error);
          setImportError(error.message || 'Failed to import questions. Please try again.');
      } finally {
          setImportLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
  }

  return (
    <main className="qp-page">
      <header className="qp-page-header">
        <div className="qp-header">
          <div>
            <h1 className="qp-title">{getPageTitle()}</h1>
            <p className="qp-subtitle">{getPageSubtitle()}</p>
          </div>

          <div className="qp-header-actions">
            {role !== 'dean' && programLabel ? (
              <span className="qp-program-chip">{programLabel}</span>
            ) : null}

            {canCreateQuestion && (
              <div className="qp-header-actions-buttons">
                <button type="button" className="qp-btn-add" onClick={openImportModal}>
                  + Import Questions
                </button>
                <button type="button" className="qp-btn-add" onClick={openCreateModal}>
                  + Create Question
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="qp-state-pills">
        {STATE_FILTERS.map((state) => (
          <button
            key={state}
            type="button"
            className={`qp-state-pill ${filter === state ? 'qp-state-pill--active' : ''}`}
            onClick={() => setFilter(state)}
          >
            <span className="qp-state-pill-count">{counts[state] || 0}</span>
            <span>{state === 'all' ? 'All' : formatStateLabel(state)}</span>
          </button>
        ))}

        <div className="qp-more-wrap" ref={moreMenuRef}>
          <button
            type="button"
            className={`qp-state-pill qp-state-pill--more ${ARCHIVAL_FILTERS.includes(filter) ? 'qp-state-pill--active' : ''}`}
            onClick={() => setShowMoreMenu((prev) => !prev)}
            aria-expanded={showMoreMenu}
          >
            <span>More</span>
            <span className={`qp-more-caret ${showMoreMenu ? 'is-open' : ''}`}>^</span>
          </button>

          {showMoreMenu ? (
            <div className="qp-more-menu">
              <div className="qp-more-menu-label">Archival States</div>
              {ARCHIVAL_FILTERS.map((state) => (
                <button
                  key={state}
                  type="button"
                  className={`qp-more-item ${filter === state ? 'is-active' : ''}`}
                  onClick={() => {
                    setFilter(state);
                    setShowMoreMenu(false);
                  }}
                >
                  <span>{formatStateLabel(state)}</span>
                  <span className="qp-more-count">{counts[state] || 0}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {role === 'dean' && (
          <select
            className="qp-filter-select qp-filter-select--program"
            value={programId || ''}
            onChange={(e) => onProgramChange(e.target.value)}
          >
            <option value="">Filter: Program</option>
            {programs.map((program) => (
              <option key={program._id} value={program._id}>
                {program.name} ({program.code})
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="qp-filters">
        <input
          className="qp-search"
          type="text"
          placeholder="Search question"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select
          className="qp-filter-select"
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

        <select
          className="qp-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="title">Sort: Title A-Z</option>
        </select>
      </div>

      {!canCreateQuestion && role === 'dean' ? (
        <p className="qp-helper-note">Select a program first before creating a question.</p>
      ) : null}

      <div className="qp-table-wrap">
        {loading ? (
          <p className="qp-loading">Loading questions...</p>
        ) : (
          <table className="qp-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Subject</th>
                {role === 'dean' && <th>Program</th>}
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={role === 'dean' ? 6 : 5} className="qp-empty">
                    {filter === 'all'
                      ? 'No questions found. Create your first one!'
                      : `No ${formatStateLabel(filter)} questions found.`}
                  </td>
                </tr>
              ) : (
                paginatedQuestions.map((question) => (
                  <tr key={question._id}>
                    <td>
                      <div className="qp-question-title">{question.title}</div>
                      <div className="qp-question-text">{truncateText(question.description, 120)}</div>

                      {question.state === 'returned' && question.revisionNote ? (
                        <div className="qp-note qp-note--returned">
                          <strong>Revision Note:</strong> {question.revisionNote}
                        </div>
                      ) : null}

                      {question.state === 'rejected' && question.rejectionReason ? (
                        <div className="qp-note qp-note--rejected">
                          <strong>Rejected:</strong> {question.rejectionReason}
                        </div>
                      ) : null}
                    </td>

                    <td>
                      {question.tag?.name ? (
                        <span className="qp-badge qp-badge--subject">{question.tag.name}</span>
                      ) : (
                        <span className="qp-none">(none)</span>
                      )}
                    </td>

                    {role === 'dean' && (
                      <td>
                        {question.program?.code || question.program?.name ? (
                          <span className="qp-badge qp-badge--program">
                            {question.program?.code || question.program?.name}
                          </span>
                        ) : (
                          <span className="qp-none">(none)</span>
                        )}
                      </td>
                    )}

                    <td>
                      <span className={`qp-status qp-status--${question.state}`}>
                        <span className="qp-status-dot" />
                        {formatStateLabel(question.state)}
                      </span>
                    </td>

                    <td>{formatDate(question.updatedAt || question.createdAt)}</td>

                    <td className="qp-actions-cell">
                      {question.state === 'draft' ? (
                        <>
                          <button className="qp-btn-edit" onClick={() => openEditModal(question)}>Edit</button>
                          <button className="qp-btn-submit" onClick={() => handleSubmit(question)}>Submit</button>
                          <button className="qp-btn-delete" onClick={() => handleDelete(question)}>Delete</button>
                        </>
                      ) : null}

                      {question.state === 'returned' ? (
                        <>
                          <button className="qp-btn-edit" onClick={() => openEditModal(question)}>Edit</button>
                          <button className="qp-btn-submit" onClick={() => handleSubmit(question)}>Re-submit</button>
                        </>
                      ) : null}

                      {question.state !== 'draft' && question.state !== 'returned' ? (
                        <button className="qp-btn-view" onClick={() => openViewModal(question)}>View</button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {!loading && filteredQuestions.length > 0 && (
        <div className="qp-pagination">
          <div className="qp-pagination-info">
            Showing {filteredQuestions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredQuestions.length)} of {filteredQuestions.length} questions
          </div>
          <div className="qp-pagination-controls">
            <button 
              className="qp-pagination-btn" 
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <div className="qp-pagination-pages">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  className={`qp-pagination-page ${currentPage === page ? 'qp-pagination-page--active' : ''}`}
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </button>
              ))}
            </div>
            <button 
              className="qp-pagination-btn" 
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <Modal
          open={showForm}
          onClose={closeFormModal}
          title={editQuestion ? 'Edit Question' : 'Create Question'}
      >
          <div className="qp-modal-copy">
              <p className="qp-modal-subtitle">
                  {editQuestion
                      ? 'Update the question details and save your changes.'
                      : importedQuestions.length > 0
                          ? `${importedQuestions.length} questions extracted. Review, assign tags, and save.`
                          : 'Add a new question draft for your program.'}
              </p>
              {programLabel ? <span className="qp-modal-program-chip">{programLabel}</span> : null}
          </div>

          <QuestionForm
              tags={tags}
              programId={programId}
              initialData={editQuestion}
              importedQuestions={importedQuestions.length > 0 ? importedQuestions : null}
              onSaved={(savedData, isEdit) => {
                  handleSaved(savedData, isEdit);
                  setImportedQuestions([]); // Clear after save
              }}
              onClose={() => {
                  closeFormModal();
                  setImportedQuestions([]);
              }}
          />
      </Modal>

      <Modal
        open={showViewModal}
        onClose={closeViewModal}
        title="View Question"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            Review the details of your submitted question. This view is read-only.
          </p>
          {programLabel ? <span className="qp-modal-program-chip">{programLabel}</span> : null}
        </div>

        <QuestionForm
          tags={tags}
          initialData={viewQuestion}
          onClose={closeViewModal}
          readOnly={true}
        />
      </Modal>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Question"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            Are you sure you want to delete <strong>"{questionToDelete?.title}"</strong>?
          </p>
          <p className="qp-modal-subtitle qp-warning-text">
            This action cannot be undone. Drafts will be permanently removed.
          </p>
        </div>

        <div className="modal-actions qp-modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => setShowDeleteModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-danger"
            onClick={confirmDelete}
          >
            Delete Question
          </button>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={closeImportModal}
        title="Import Questions"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            Upload a PDF or DOCX file containing multiple choice questions. An AI will extract the questions for your review.
          </p>
          <p className="qp-modal-info">
            <strong>Supported formats:</strong> PDF (typed), DOCX<br />
            <strong>File size:</strong> Up to 10MB<br />
            <strong>Max questions:</strong> 20 per upload
          </p>
          {importError && (
            <div className="import-error-banner">
              {importError}
            </div>
          )}
        </div>

        <div className="import-upload-area">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelected}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            style={{ display: 'none' }}
            disabled={importLoading}
          />
          <button
            type="button"
            className="qp-btn-upload"
            onClick={triggerFileInput}
            disabled={importLoading}
          >
            {importLoading ? 'Processing...' : '📁 Choose File'}
          </button>
        </div>

        <div className="modal-actions qp-modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={closeImportModal}
            disabled={importLoading}
          >
            Cancel
          </button>
        </div>
      </Modal>

    </main>
  );
}
