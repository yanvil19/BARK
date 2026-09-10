import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { uploadDocumentForImport, submitImportedQuestions, getImportLimits, validateAndCountDocument, extractQuestionsFromToken } from '../../lib/importApi.js';
import QuestionForm from '../../components/QuestionForm.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import '../../styles/shared/CreateQuestions.css';
import PageHeader from '../../components/PageHeader.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

import { getStatusLabel } from '../../utils/statusLabels.js';

const STATE_FILTERS = ['all', 'draft', 'pending_chair', 'restored', 'returned', 'approved', 'rejected'];

function formatResetTime(isoDateStr) {
  if (!isoDateStr) return '';
  const date = new Date(isoDateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const timePart = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (isToday) {
    return `Today at ${timePart}`;
  }
  const datePart = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${datePart} at ${timePart}`;
}

function formatCountdown(seconds) {
  if (seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0 || hrs > 0) parts.push(`${mins}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncateText(text, max = 80) {
  if (!text) return '';

  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return clean.length > max
    ? `${clean.slice(0, max)}...`
    : clean;
}

export default function CreateQuestions({ role, programId, programLabel, programs = [], onProgramChange, me }) {
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
  const [importLimits, setImportLimits] = useState({
    hourly: { used: 0, max: 8, remaining: 8, resetAt: null, resetInSeconds: 0 },
    daily: { used: 0, max: 20, remaining: 20, resetAt: null, resetInSeconds: 0 },
    isLimitReached: false,
    earliestResetAt: null,
  });
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [extractionProgress, setExtractionProgress] = useState({ current: 0, total: 0, status: 'idle' });
  const [importStage, setImportStage] = useState('idle'); // 'idle' | 'counting' | 'extracting' | 'completed'
  const progressTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [questionToSubmit, setQuestionToSubmit] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [showProgramPickerModal, setShowProgramPickerModal] = useState(false);
  const [pendingDeanAction, setPendingDeanAction] = useState('create');
  const [pendingProgramId, setPendingProgramId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [hasImportDraft, setHasImportDraft] = useState(false);
  const [isRestoringImportDraft, setIsRestoringImportDraft] = useState(false);
  const [maxImages, setMaxImages] = useState(5);
  const itemsPerPage = 10;

  const fetchLimits = useCallback(async () => {
    try {
      const data = await getImportLimits();
      if (data?.limits) {
        setImportLimits(data.limits);
        if (data.limits.earliestResetAt) {
          const secs = Math.max(0, Math.ceil((new Date(data.limits.earliestResetAt).getTime() - Date.now()) / 1000));
          setCountdownSeconds(secs);
        } else {
          setCountdownSeconds(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch import limits:', err);
    }
  }, []);

  const fetchQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const programParam = programId ? `&programId=${encodeURIComponent(programId)}` : '';
      const data = await apiAuth(`${BASE}/api/questions?page=${encodeURIComponent(currentPage)}&limit=${encodeURIComponent(itemsPerPage)}${programParam}`);
      setQuestions(data.questions || []);
      setTotalPages(typeof data.totalPages === 'number' ? Math.max(1, data.totalPages) : 1);
      setTotalItems(typeof data.totalItems === 'number' ? Math.max(0, data.totalItems) : 0);
    } catch (err) {
      console.error('Failed to load questions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, programId]);

  const fetchTags = useCallback(async () => {
    try {
      const url = (role === 'dean' && programId) ? `${BASE}/api/tags?program=${programId}` : `${BASE}/api/tags`;
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
    if (showImportModal) {
      fetchLimits();
    }
  }, [showImportModal, fetchLimits]);

  useEffect(() => {
    if (!importLimits.isLimitReached || countdownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          fetchLimits();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [importLimits.isLimitReached, countdownSeconds, fetchLimits]);

  useEffect(() => {
    apiAuth('/api/admin/settings/public')
      .then(res => setMaxImages(Number(res?.maxUploadImages ?? 5)))
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery, subjectFilter, sortBy, programId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const importDraftKey = `question_draft_import_${me?._id || 'guest'}`;
      const item = window.localStorage.getItem(importDraftKey);
      if (item) {
        try {
          const parsed = JSON.parse(item);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setHasImportDraft(true);
            return;
          }
        } catch (e) {
          // ignore
        }
      }
      setHasImportDraft(false);
    }
  }, [showImportModal, me?._id]);

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
    STATE_FILTERS.forEach((state) => {
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

      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
    });

    return next;
  }, [baseQuestions, filter, searchQuery, sortBy, subjectFilter]);

  const { paginatedQuestions } = useMemo(() => {
    return {
      paginatedQuestions: filteredQuestions,
    };
  }, [filteredQuestions]);

  function closeFormModal() {
    setShowForm(false);
    setEditQuestion(null);
    setImportedQuestions([]);
    setIsRestoringImportDraft(false);
  }

  function closeViewModal() {
    setShowViewModal(false);
    setViewQuestion(null);
  }

  function closeDeleteModal() {
    setQuestionToDelete(null);
  }

  function openCreateModal() {
    setEditQuestion(null);
    setShowForm(true);
  }

  function requestDeanProgramThen(action) {
    if (role !== 'dean') {
      if (action === 'import') openImportModal();
      else openCreateModal();
      return;
    }

    setPendingDeanAction(action);
    setPendingProgramId(programId || programs[0]?._id || '');
    setShowProgramPickerModal(true);
  }

  function closeProgramPickerModal() {
    setShowProgramPickerModal(false);
    setPendingDeanAction('create');
    setPendingProgramId('');
  }

  function confirmProgramPickerModal() {
    if (!pendingProgramId) return;
    onProgramChange?.(pendingProgramId);
    setShowProgramPickerModal(false);

    if (pendingDeanAction === 'import') openImportModal();
    else openCreateModal();

    setPendingDeanAction('create');
    setPendingProgramId('');
  }

  function markQuestionAsRead(question) {
    if (!question?._id) return;
    if ((question.state === 'returned' || question.state === 'rejected') && !question.feedbackRead) {
      apiAuth(`${BASE}/api/questions/${question._id}/mark-read`, { method: 'PATCH' })
        .then(() => {
          setQuestions((prev) =>
            prev.map((q) => (q._id === question._id ? { ...q, feedbackRead: true } : q))
          );
          window.dispatchEvent(new CustomEvent('badge-counts-updated'));
        })
        .catch(() => {});
    }
  }

  function openEditModal(question) {
    setEditQuestion(question);
    setShowForm(true);
    markQuestionAsRead(question);
  }

  function openViewModal(question) {
    setViewQuestion(question);
    setShowViewModal(true);
    markQuestionAsRead(question);
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
  }

  async function confirmDelete() {
    if (!questionToDelete) return;
    try {
      await apiAuth(`${BASE}/api/questions/${questionToDelete._id}`, { method: 'DELETE' });
      setQuestions((prev) => prev.filter((item) => item._id !== questionToDelete._id));
      closeDeleteModal();
      window.dispatchEvent(new CustomEvent('badge-counts-updated'));
    } catch (err) {
      setFeedbackModal({
        title: 'Delete Failed',
        tone: 'danger',
        message: err.message || 'Failed to delete question.',
      });
    }
  }

  function handleSubmit(question) {
    setQuestionToSubmit(question);
  }

  async function confirmSubmit() {
    if (!questionToSubmit) return;

    setSubmitBusy(true);
    try {
      const data = await apiAuth(`${BASE}/api/questions/${questionToSubmit._id}/submit`, { method: 'POST' });
      setQuestions((prev) => prev.map((item) => (item._id === questionToSubmit._id ? data.question : item)));
      setQuestionToSubmit(null);
      window.dispatchEvent(new CustomEvent('badge-counts-updated'));
    } catch (err) {
      setFeedbackModal({
        title: 'Submission Failed',
        tone: 'danger',
        message: err.message || 'Failed to submit question.',
      });
    } finally {
      setSubmitBusy(false);
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

    // ── Stage 1: AI counts questions ──────────────────────────────────────────
    setImportStage('counting');
    setExtractionProgress({ current: 0, total: 0, status: 'counting' });

    let sessionToken = null;
    let questionCount = 0;

    try {
      const countResult = await validateAndCountDocument(file);
      sessionToken = countResult.token;
      questionCount = countResult.questionCount;
    } catch (error) {
      setImportLoading(false);
      setImportStage('idle');
      setExtractionProgress({ current: 0, total: 0, status: 'idle' });
      console.error('Count stage error:', error);
      // If the server returned updated limits (e.g. counted as an attempt), apply them directly
      if (error.data?.limits) {
        setImportLimits(error.data.limits);
      } else {
        fetchLimits();
      }
      setImportError(error.message || error.data?.error || 'Failed to analyze the document. Please try again.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // ── Stage 2: Full extraction ──────────────────────────────────────────────
    setImportStage('extracting');
    setExtractionProgress({ current: 0, total: questionCount, status: 'extracting' });

    if (progressTimerRef.current) clearInterval(progressTimerRef.current);

    // Animate bar from 0 → questionCount over ~8s, then switch to 'finalizing'
    const intervalMs = Math.max(300, Math.round(8000 / questionCount));
    let step = 0;
    progressTimerRef.current = setInterval(() => {
      step += 1;
      setExtractionProgress((prev) => ({ ...prev, current: Math.min(step, questionCount) }));
      if (step >= questionCount) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
        // Bar is full — switch to finalizing while API may still be running
        setImportStage('finalizing');
      }
    }, intervalMs);

    // Kick off extraction in parallel with animation
    let extractionResult = null;
    let extractionError = null;
    try {
      extractionResult = await extractQuestionsFromToken(sessionToken, tags);
    } catch (error) {
      extractionError = error;
    }

    // Ensure timer is cleared if API finished before animation did
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }

    // If there was an extraction error, bail out
    if (extractionError) {
      setImportLoading(false);
      setImportStage('idle');
      setExtractionProgress({ current: 0, total: 0, status: 'idle' });
      console.error('Extraction error:', extractionError);
      fetchLimits();
      setImportError(extractionError.message || extractionError.data?.error || 'Failed to import questions. Please try again.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Make sure bar shows as fully filled before completing
    setExtractionProgress({ current: questionCount, total: questionCount, status: 'completed' });

    try {
      const preFilledQuestions = (extractionResult.questions || []).map(q => {
        const matchedTag = tags.find(
          t => t.name.toLowerCase() === (q.suggested_tag || '').toLowerCase()
        );

        return {
          description: q.question_text || '',
          answers: Object.entries(q.options || {})
            .filter(([, text]) => text !== null)
            .map(([key, text]) => ({
              text,
              isCorrect: key === q.correct_answer,
            })),
          rationalization: q.rationalization || '',
          image_required: q.image_required || false,
          image_note: q.image_note || null,
          flags: q.flags || [],
          tagId: matchedTag?._id || '',
        };
      });

      if (preFilledQuestions.length === 0) {
        throw new Error('No questions could be extracted from this file. Please check the format and try again.');
      }

      if (extractionResult.limits) {
        setImportLimits(extractionResult.limits);
      } else {
        fetchLimits();
      }

      // Brief completed state, then open review form
      setImportStage('completed');

      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(`question_draft_import_${me?._id || 'guest'}`);
      }

      setTimeout(() => {
        setImportedQuestions(preFilledQuestions);
        setIsRestoringImportDraft(false);
        setShowImportModal(false);
        setEditQuestion(null);
        setShowForm(true);
        setImportLoading(false);
        setImportStage('idle');
        setExtractionProgress({ current: 0, total: 0, status: 'idle' });
      }, 700);

    } catch (error) {
      setImportLoading(false);
      setImportStage('idle');
      setExtractionProgress({ current: 0, total: 0, status: 'idle' });
      console.error('Post-extraction error:', error);
      fetchLimits();
      setImportError(error.message || 'Failed to import questions. Please try again.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <main className="qp-page">
      <PageHeader
        className="shared-page-header--bleed"
        title={getPageTitle()}
        subtitle={getPageSubtitle()}
      >
        <div className="qp-header-actions">
          {role !== 'dean' && programLabel ? (
            <span className="qp-program-chip">{programLabel}</span>
          ) : null}

          <div className="qp-header-actions-buttons">
            <button
              type="button"
              className="qp-btn-add"
              onClick={() => requestDeanProgramThen('import')}
              disabled={role === 'dean' && programs.length === 0}
              title={role === 'dean' && programs.length === 0 ? 'No program available for your department.' : ''}
            >
              + Import Questions
            </button>
            <button
              type="button"
              className="qp-btn-add"
              onClick={() => requestDeanProgramThen('create')}
              disabled={role === 'dean' && programs.length === 0}
              title={role === 'dean' && programs.length === 0 ? 'No program available for your department.' : ''}
            >
              + Create Question
            </button>
          </div>
        </div>
      </PageHeader>

      <div className="qp-state-pills">
        {STATE_FILTERS.map((state) => (
          <button
            key={state}
            type="button"
            className={`qp-state-pill ${filter === state ? 'qp-state-pill--active' : ''}`}
            onClick={() => setFilter(state)}
          >
            <span className="qp-state-pill-count">{counts[state] || 0}</span>
            <span>{state === 'all' ? 'All' : getStatusLabel(state)}</span>
          </button>
        ))}
      </div>

      <QuestionFilters
        className="qp-filters-wrapper"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search question"
        role={role}
        subjectFilter={subjectFilter}
        onSubjectChange={setSubjectFilter}
        subjectOptions={subjectOptions}
        programFilter={programId}
        onProgramChange={onProgramChange}
        programOptions={programs}
        sortBy={sortBy}
        onSortChange={setSortBy}
        sortOptions={[
          { value: 'newest', label: 'Sort: Newest' },
          { value: 'oldest', label: 'Sort: Oldest' },
        ]}
      />

      {!canCreateQuestion && role === 'dean' ? (
        <p className="qp-helper-note">Choose a program filter, or click Create/Import and select a program from the modal.</p>
      ) : null}

      <div className="qp-table-wrap">
        {loading ? (
          <p className="qp-loading">Loading questions...</p>
        ) : (
          <table className="qp-table">
            <thead>
              <tr>
                <th style={{ width: '320px' }}>Question</th>
                <th>Subject</th>
                {role === 'dean' && <th>Program</th>}
                <th>Status</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuestions.length === 0 ? (
                <tr>
                  <td colSpan={role === 'dean' ? 6 : 5} className="qp-empty">
                    {filter === 'all'
                      ? 'No questions found. Create your first one!'
                      : `No ${getStatusLabel(filter)} questions found.`}
                  </td>
                </tr>
              ) : (
                paginatedQuestions.map((question) => (
                  <tr key={question._id}>
                    <td>
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
                        {getStatusLabel(question.state)}
                      </span>
                    </td>

                    <td>{formatDate(question.updatedAt || question.createdAt)}</td>

                    <td className="qp-actions-cell">
                      {question.state === 'draft' || question.state === 'returned' ? (
                        <>
                          <button className="qp-btn-edit" onClick={() => openEditModal(question)}>Edit</button>
                          <button className="qp-btn-submit" onClick={() => handleSubmit(question)}>
                            {question.state === 'returned' ? 'Re-submit' : 'Submit'}
                          </button>
                          <button className="qp-btn-delete" onClick={() => handleDelete(question)}>Delete</button>
                        </>
                      ) : null}

                      {question.state !== 'draft' && question.state !== 'returned' ? (
                        <>
                          <button className="qp-btn-view" onClick={() => openViewModal(question)}>View</button>
                          {question.state === 'rejected' ? (
                            <button className="qp-btn-delete" onClick={() => handleDelete(question)}>Delete</button>
                          ) : null}
                        </>
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
            Showing {filteredQuestions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {filteredQuestions.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + filteredQuestions.length} of {totalItems} questions
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
          me={me}
          tags={tags}
          programId={programId}
          initialData={editQuestion}
          maxImages={maxImages}
          importedQuestions={importedQuestions.length > 0 ? importedQuestions : null}
          isImportDraft={isRestoringImportDraft}
          onFeedback={setFeedbackModal}
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
          onFeedback={setFeedbackModal}
          onClose={closeViewModal}
          readOnly={true}
        />
      </Modal>

      <ConfirmationModal
        open={!!questionToDelete}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title="Delete Question"
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to <strong>"delete"</strong> this question?
          </p>
        )}
        confirmLabel="Delete Question"
        confirmVariant="danger"
      >
        <p className="qp-warning-text" style={{ margin: 0 }}>
          This action cannot be undone. The question will be permanently removed.
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!questionToSubmit}
        onClose={() => {
          if (submitBusy) return;
          setQuestionToSubmit(null);
        }}
        onConfirm={confirmSubmit}
        title={questionToSubmit?.state === 'returned' ? 'Re-submit Question' : 'Submit Question'}
        message={(
          <p style={{ margin: 0 }}>
            Submit this question for Chair review? You won't be able to edit it after this.
          </p>
        )}
        confirmLabel={questionToSubmit?.state === 'returned' ? 'Re-submit' : 'Submit'}
        confirmVariant="primary"
        busy={submitBusy}
      />

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      {/* Import Modal */}
      <Modal
        open={showImportModal}
        onClose={closeImportModal}
        title="Import Questions"
      >
        <div className="qp-modal-copy qp-modal-copy--import">
          <p className="qp-modal-subtitle">
            Upload a PDF or DOCX file containing multiple choice questions. An AI will extract the questions for your review.
          </p>

          <div className="qp-import-guidelines">
            <div className="qp-import-guideline">
              <strong>Hourly Uploads</strong>
              <span className="qp-import-quota-val">
                {importLimits.hourly.used} / {importLimits.hourly.max}
              </span>
            </div>
            <div className="qp-import-guideline">
              <strong>Daily Uploads</strong>
              <span className="qp-import-quota-val">
                {importLimits.daily.used} / {importLimits.daily.max}
              </span>
            </div>
            <div className="qp-import-guideline">
              <strong>Max Questions</strong>
              <span>20 per upload</span>
            </div>
          </div>

          {importLimits.isLimitReached && (
            <div className="import-limit-banner">
              <div className="import-limit-icon">⏳</div>
              <div className="import-limit-text">
                <strong>Upload Limit Reached</strong>
                <p>
                  You have reached your upload quota. Next upload available in{' '}
                  <span className="import-limit-countdown">
                    {formatCountdown(countdownSeconds)}
                  </span>
                  {importLimits.earliestResetAt && (
                    <> ({formatResetTime(importLimits.earliestResetAt)})</>
                  )}.
                </p>
              </div>
            </div>
          )}

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
            disabled={importLoading || importLimits.isLimitReached}
          />
          <div className={`import-drop-zone ${importLoading ? 'is-loading' : ''} ${importLimits.isLimitReached ? 'is-disabled' : ''}`}>
            {importLoading ? (
              <div className="import-loading-container">
                {/* ── Stage 1: AI is counting questions ───────────────── */}
                {importStage === 'counting' && (
                  <>
                    <div className="import-loading-header">
                      <span className="import-loading-spinner" />
                      <h3 className="import-loading-title">Analyzing document &amp; counting questions…</h3>
                    </div>
                    <span className="import-drop-zone-footnote">
                      Please wait while the AI reads your file and counts the questions.
                    </span>
                  </>
                )}

                {/* ── Stage 2: Segmented bar filling up ───────────────── */}
                {importStage === 'extracting' && (
                  <>
                    <div className="import-loading-header">
                      <span className="import-loading-spinner" />
                      <h3 className="import-loading-title">
                        Extracting questions… ({extractionProgress.current} of {extractionProgress.total} processed)
                      </h3>
                    </div>

                    <div
                      className="import-segmented-bar"
                      role="progressbar"
                      aria-valuenow={extractionProgress.current}
                      aria-valuemin="0"
                      aria-valuemax={extractionProgress.total}
                    >
                      {Array.from({ length: extractionProgress.total }, (_, i) => {
                        const num = i + 1;
                        const isDone = num <= extractionProgress.current;
                        return (
                          <div key={num} className={`import-bar-segment ${isDone ? 'is-done' : ''}`} title={`Question ${num}`}>
                            <span className="import-bar-segment-num">{num}</span>
                          </div>
                        );
                      })}
                    </div>

                    <span className="import-drop-zone-footnote">
                      Please wait while the AI analyzes document structure, choices, and rationalizations.
                    </span>
                  </>
                )}

                {/* ── Stage 3: Bar full, finalizing results ───────────── */}
                {importStage === 'finalizing' && (
                  <>
                    <div className="import-loading-header">
                      <span className="import-loading-spinner" />
                      <h3 className="import-loading-title">Finalizing your questions…</h3>
                    </div>
                    <span className="import-drop-zone-footnote">
                      Almost done! Packaging your extracted questions for review.
                    </span>
                  </>
                )}

                {/* ── Stage 4: Completed ───────────────────────────────── */}
                {importStage === 'completed' && (
                  <>
                    <div className="import-loading-header">
                      <h3 className="import-loading-title">
                        ✅ {extractionProgress.current} question{extractionProgress.current === 1 ? '' : 's'} extracted successfully!
                      </h3>
                    </div>
                    <span className="import-drop-zone-footnote">
                      Opening review form…
                    </span>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="import-drop-zone-copy">
                  <h3>{importLimits.isLimitReached ? 'Upload temporarily paused' : 'Upload your question file'}</h3>
                  <p className="import-drop-zone-sub">
                    {importLimits.isLimitReached
                      ? `Limit reached. Resets ${formatResetTime(importLimits.earliestResetAt)}`
                      : 'Drag & drop or browse your typed PDF or DOCX file'}
                  </p>
                </div>
                <button
                  type="button"
                  className="qp-btn-upload qp-btn-upload--large"
                  onClick={triggerFileInput}
                  disabled={importLoading || importLimits.isLimitReached}
                >
                  📁 Choose File
                </button>
                <span className="import-drop-zone-footnote">
                  This feature uses AI to extract multiple-choice questions (max 20 questions per file).
                </span>
              </>
            )}
          </div>
        </div>

        <div className="modal-actions qp-modal-actions">
          {hasImportDraft && !importLoading && (
            <button
              type="button"
              className="modal-btn-primary"
              onClick={() => {
                setImportedQuestions([]);
                setIsRestoringImportDraft(true);
                setShowImportModal(false);
                setEditQuestion(null);
                setShowForm(true);
              }}
            >
              Restore Previous Session
            </button>
          )}
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={closeImportModal}
            disabled={importLoading}
          >
            {importLoading ? 'Please wait...' : 'Cancel'}
          </button>
        </div>
      </Modal>

      <Modal
        open={showProgramPickerModal}
        onClose={closeProgramPickerModal}
        title="Choose Program"
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            Select a program before continuing.
          </p>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          <DropdownSelect
            className="dd-full-width"
            value={pendingProgramId}
            onChange={(e) => setPendingProgramId(e.target.value)}
            placeholder="Select a program"
            options={programs.map((program) => ({
              value: program._id,
              label: `${program.name}${program.code ? ` (${program.code})` : ''}`,
            }))}
          />

          <div className="modal-actions qp-modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={closeProgramPickerModal}
            >
              Cancel
            </button>
            <button
              type="button"
              className="modal-btn-primary"
              onClick={confirmProgramPickerModal}
              disabled={!pendingProgramId}
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>

    </main>
  );
}
