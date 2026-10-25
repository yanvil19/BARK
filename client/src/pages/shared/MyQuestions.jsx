import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { uploadDocumentForImport, submitImportedQuestions, getImportLimits, validateAndCountDocument, extractQuestionsFromToken } from '../../lib/importApi.js';
import QuestionForm from '../../components/QuestionForm.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import Table from '../../components/Table.jsx';
import Pagination from '../../components/Pagination.jsx';
import ActionMenu from '../../components/ActionMenu.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import '../../styles/shared/MyQuestions.css';
import PageHeader from '../../components/PageHeader.jsx';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

import { getStatusLabel } from '../../utils/statusLabels.js';

const STATE_FILTERS = ['all', 'draft', 'pending_chair', 'restored', 'returned', 'approved', 'rejected'];

// Dot tone for the table status cell (.ui-table-status in Table.css)
const QUESTION_STATUS_TONES = {
  draft: 'hollow',
  pending_chair: 'amber',
  returned: 'orange',
  approved: 'green',
  rejected: 'red',
  restored: 'violet',
};

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

export default function MyQuestions({ role, programId, programLabel, programs = [], onProgramChange, me }) {
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [editQuestion, setEditQuestion] = useState(null);
  const [editGroupQuestions, setEditGroupQuestions] = useState(null);
  const [viewQuestion, setViewQuestion] = useState(null);
  const [viewGroupQuestions, setViewGroupQuestions] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
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

    // Keep questions belonging to the same group contiguous and ordered by groupOrder
    const groupClusters = new Map();
    const result = [];
    for (const q of next) {
      if (!q.groupId) {
        result.push(q);
      } else {
        if (!groupClusters.has(q.groupId)) {
          groupClusters.set(q.groupId, []);
          result.push({ _isGroupClusterPlaceholder: true, groupId: q.groupId });
        }
        groupClusters.get(q.groupId).push(q);
      }
    }

    const finalQuestions = [];
    for (const item of result) {
      if (item._isGroupClusterPlaceholder) {
        const cluster = groupClusters.get(item.groupId) || [];
        cluster.sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));
        finalQuestions.push(...cluster);
      } else {
        finalQuestions.push(item);
      }
    }

    return finalQuestions;
  }, [baseQuestions, filter, searchQuery, sortBy, subjectFilter]);

  function getQuestionActions(question) {
    const isDraftOrReturned = question.state === 'draft' || question.state === 'returned';
    const isGrouped = !!question.groupId;
    const items = [];

    items.push({
      key: 'view',
      label: 'View Details',
      onClick: () => openViewModal(question),
    });

    if (isDraftOrReturned) {
      items.push({
        key: 'edit',
        label: isGrouped ? 'Edit Question Set' : 'Edit Question',
        onClick: () => openEditModal(question),
      });
    }

    if (question.state === 'draft' || question.state === 'returned' || question.state === 'rejected') {
      items.push({
        key: 'delete',
        label: isGrouped ? 'Delete Question Set' : 'Delete Question',
        danger: true,
        onClick: () => {
          if (isGrouped) {
            setQuestionToDelete({ ...question, isGroupAction: true });
          } else {
            handleDelete(question);
          }
        },
      });
    }

    return items;
  }

  // A question set shows as one row (its first member); remember each set's size for the badge
  const { tableRows, groupSizes } = useMemo(() => {
    const sizes = new Map();
    const rows = [];
    filteredQuestions.forEach((q) => {
      if (!q.groupId) {
        rows.push(q);
        return;
      }
      if (!sizes.has(q.groupId)) rows.push(q);
      sizes.set(q.groupId, (sizes.get(q.groupId) || 0) + 1);
    });
    return { tableRows: rows, groupSizes: sizes };
  }, [filteredQuestions]);

  const questionColumns = [
    {
      key: 'question',
      label: 'Question',
      width: '320px',
      className: 'ui-table-cell-lead',
      render: (question) => (
        <>
          <div className="qp-question-text">
            {question.groupId ? (
              <>
                <strong>{truncateText(question.groupContext?.trim() || 'Question Set', 100)}</strong>
                <span className="qp-badge qp-badge--group" title="Fixed Question Group">
                  Set ({groupSizes.get(question.groupId)} questions)
                </span>
              </>
            ) : (
              truncateText(question.description, 120)
            )}
          </div>

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
        </>
      ),
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (question) => (
        question.tag?.name ? (
          <span className="qp-badge qp-badge--subject">{question.tag.name}</span>
        ) : (
          <span className="qp-none">(none)</span>
        )
      ),
    },
    ...(role === 'dean' ? [{
      key: 'program',
      label: 'Program',
      render: (question) => (
        question.program?.code || question.program?.name ? (
          <span className="qp-badge qp-badge--program">
            {question.program?.code || question.program?.name}
          </span>
        ) : (
          <span className="qp-none">(none)</span>
        )
      ),
    }] : []),
    {
      key: 'status',
      label: 'Status',
      render: (question) => (
        <span className={`ui-table-status ui-table-status--${QUESTION_STATUS_TONES[question.state] || 'default'}`}>
          {getStatusLabel(question.state)}
        </span>
      ),
    },
    {
      key: 'updated',
      label: 'Updated',
      render: (question) => <span className="qp-cell-soft">{formatDate(question.updatedAt || question.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (question) => {
        const isGrouped = !!question.groupId;
        const canSubmit = question.state === 'draft' || question.state === 'returned';
        // When the row button is already "View Details", don't repeat it in the menu;
        // hide the menu entirely if nothing else is left.
        const menuItems = getQuestionActions(question).filter((item) => canSubmit || item.key !== 'view');
        return (
          <div className="ui-table-actions">
            {canSubmit ? (
              <button
                type="button"
                className="ui-table-btn ui-table-btn--success"
                onClick={() => handleSubmit(question, isGrouped)}
              >
                {question.state === 'returned' ? 'Re-submit' : 'Submit'}
              </button>
            ) : (
              <button
                type="button"
                className="ui-table-btn ui-table-btn--secondary ui-table-btn--view"
                onClick={() => openViewModal(question)}
              >
                View Details
              </button>
            )}

            {menuItems.length > 0 && (
              <ActionMenu
                items={menuItems}
                ariaLabel="More actions"
              />
            )}
          </div>
        );
      },
    },
  ];

  function closeFormModal() {
    setShowForm(false);
    setEditQuestion(null);
    setEditGroupQuestions(null);
    setImportedQuestions([]);
    setIsRestoringImportDraft(false);
  }

  function closeViewModal() {
    setShowViewModal(false);
    setViewQuestion(null);
    setViewGroupQuestions(null);
  }

  function closeDeleteModal() {
    setQuestionToDelete(null);
  }

  function openCreateModal() {
    setEditQuestion(null);
    setEditGroupQuestions(null);
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
        .catch(() => { });
    }
  }

  function openEditModal(question) {
    if (question?.groupId) {
      // Find all siblings in local state first
      const siblings = questions
        .filter((q) => q.groupId === question.groupId)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

      setEditQuestion(question);
      setEditGroupQuestions(siblings.length > 0 ? siblings : [question]);
      setShowForm(true);

      // Also fetch fresh group data from backend in background to ensure up-to-date
      apiAuth(`${BASE}/api/questions/group/${question.groupId}`)
        .then((res) => {
          if (Array.isArray(res?.questions) && res.questions.length > 0) {
            setEditGroupQuestions(res.questions);
          }
        })
        .catch(() => { });
    } else {
      setEditQuestion(question);
      setEditGroupQuestions(null);
      setShowForm(true);
    }
    markQuestionAsRead(question);
  }

  function openViewModal(question) {
    if (question?.groupId) {
      const siblings = questions
        .filter((q) => q.groupId === question.groupId)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0));

      setViewQuestion(question);
      setViewGroupQuestions(siblings.length > 0 ? siblings : [question]);
      setShowViewModal(true);

      apiAuth(`${BASE}/api/questions/group/${question.groupId}`)
        .then((res) => {
          if (Array.isArray(res?.questions) && res.questions.length > 0) {
            setViewGroupQuestions(res.questions);
          }
        })
        .catch(() => { });
    } else {
      setViewQuestion(question);
      setViewGroupQuestions(null);
      setShowViewModal(true);
    }
    markQuestionAsRead(question);
  }

  function handleSaved(savedData, isEdit) {
    if (Array.isArray(savedData)) {
      if (savedData.length > 0 && savedData[0].groupId) {
        // Group saved/updated: update existing members or append new
        const savedIds = new Set(savedData.map((q) => q._id));
        const savedMap = new Map(savedData.map((q) => [q._id, q]));
        setQuestions((prev) => {
          const updated = prev.map((q) => (savedIds.has(q._id) ? savedMap.get(q._id) : q));
          const existingIds = new Set(prev.map((q) => q._id));
          const newlyCreated = savedData.filter((q) => !existingIds.has(q._id));
          return [...newlyCreated, ...updated];
        });
      } else if (isEdit && savedData.length === 1) {
        setQuestions((prev) => prev.map((q) => (q._id === savedData[0]._id ? savedData[0] : q)));
      } else {
        setQuestions((prev) => [...savedData, ...prev]);
      }
    } else if (savedData) {
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
      if (questionToDelete.isGroupAction && questionToDelete.groupId) {
        await apiAuth(`${BASE}/api/questions/group/${questionToDelete.groupId}`, { method: 'DELETE' });
        setQuestions((prev) => prev.filter((item) => item.groupId !== questionToDelete.groupId));
      } else {
        await apiAuth(`${BASE}/api/questions/${questionToDelete._id}`, { method: 'DELETE' });
        setQuestions((prev) => prev.filter((item) => item._id !== questionToDelete._id));
      }
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

  function handleSubmit(question, isGroup = false) {
    setQuestionToSubmit({ ...question, isGroupAction: isGroup });
  }

  async function confirmSubmit() {
    if (!questionToSubmit) return;

    setSubmitBusy(true);
    try {
      if (questionToSubmit.isGroupAction && questionToSubmit.groupId) {
        const data = await apiAuth(`${BASE}/api/questions/group/${questionToSubmit.groupId}/submit`, { method: 'POST' });
        const updatedIds = new Set(data.questions.map(q => q._id));
        const updatedMap = new Map(data.questions.map(q => [q._id, q]));
        setQuestions((prev) => prev.map((item) => (updatedIds.has(item._id) ? updatedMap.get(item._id) : item)));
      } else {
        const data = await apiAuth(`${BASE}/api/questions/${questionToSubmit._id}/submit`, { method: 'POST' });
        setQuestions((prev) => prev.map((item) => (item._id === questionToSubmit._id ? data.question : item)));
      }
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

      <CapsuleFilters
        className="qp-state-pills"
        ariaLabel="Filter questions by status"
        options={STATE_FILTERS.map((state) => ({
          value: state,
          label: state === 'all' ? 'All' : getStatusLabel(state),
          count: counts[state] || 0,
        }))}
        value={filter}
        onChange={setFilter}
      />

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

      <Table
        className="qp-questions-table"
        columns={questionColumns}
        data={tableRows}
        keyField="_id"
        loading={loading}
        emptyMessage={filter === 'all'
          ? 'No questions found. Create your first one!'
          : `No ${getStatusLabel(filter)} questions found.`}
      />

      {!loading && totalItems > 0 && (
        <div className="ui-table-footer">
          <Pagination
            currentPage={currentPage}
            totalItems={totalItems}
            pageSize={itemsPerPage}
            onPageChange={setCurrentPage}
            itemLabel="questions"
          />
        </div>
      )}

      <Modal
        open={showForm}
        onClose={closeFormModal}
        title={editGroupQuestions ? 'Edit Question Set' : editQuestion ? 'Edit Question' : 'Create Question'}
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            {editGroupQuestions
              ? `Update all ${editGroupQuestions.length} questions in this set, reorder positions, or update the scenario context.`
              : editQuestion
                ? 'Update the question details and save your changes.'
                : importedQuestions.length > 0
                  ? `${importedQuestions.length} questions extracted. Review, assign tags, and save.`
                  : 'Add a new question draft for your program.'}
          </p>
          {programLabel ? <span className="qp-modal-program-chip">{programLabel}</span> : null}
        </div>

        <QuestionForm
          key={editGroupQuestions ? `group-${editGroupQuestions[0]?.groupId}` : editQuestion ? `single-${editQuestion._id}` : 'new'}
          me={me}
          tags={tags}
          programId={programId}
          initialData={editQuestion}
          initialGroupQuestions={editGroupQuestions}
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
        title={viewGroupQuestions ? 'View Question Set' : 'View Question'}
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            {viewGroupQuestions
              ? `Review details of all ${viewGroupQuestions.length} questions in this question set. This view is read-only.`
              : 'Review the details of your submitted question. This view is read-only.'}
          </p>
          {programLabel ? <span className="qp-modal-program-chip">{programLabel}</span> : null}
        </div>

        <QuestionForm
          key={viewGroupQuestions ? `view-group-${viewGroupQuestions[0]?.groupId}` : viewQuestion ? `view-single-${viewQuestion._id}` : 'view'}
          tags={tags}
          initialData={viewQuestion}
          initialGroupQuestions={viewGroupQuestions}
          onFeedback={setFeedbackModal}
          onClose={closeViewModal}
          readOnly={true}
        />
      </Modal>

      <ConfirmationModal
        open={!!questionToDelete}
        onClose={closeDeleteModal}
        onConfirm={confirmDelete}
        title={questionToDelete?.isGroupAction ? 'Delete Question Group' : 'Delete Question'}
        message={(
          <p style={{ margin: 0 }}>
            Are you sure you want to <strong>delete</strong> this {questionToDelete?.isGroupAction ? 'entire question group' : 'question'}?
          </p>
        )}
        confirmLabel={questionToDelete?.isGroupAction ? 'Delete Question Group' : 'Delete Question'}
        confirmVariant="danger"
      >
        <p className="qp-warning-text" style={{ margin: 0 }}>
          This action cannot be undone. {questionToDelete?.isGroupAction ? 'All questions in this group will be permanently removed.' : 'The question will be permanently removed.'}
        </p>
      </ConfirmationModal>

      <ConfirmationModal
        open={!!questionToSubmit}
        onClose={() => {
          if (submitBusy) return;
          setQuestionToSubmit(null);
        }}
        onConfirm={confirmSubmit}
        title={
          questionToSubmit?.isGroupAction
            ? (questionToSubmit?.state === 'returned' ? 'Re-submit Question Group' : 'Submit Question Group')
            : (questionToSubmit?.state === 'returned' ? 'Re-submit Question' : 'Submit Question')
        }
        message={(
          <p style={{ margin: 0 }}>
            Submit {questionToSubmit?.isGroupAction ? 'this entire question group' : 'this question'} for Chair review? You won't be able to edit it after this.
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
              <div className="import-limit-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 3h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M6 21h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M7 3v3a5 5 0 0 0 10 0V3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M7 21v-3a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </div>
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
                        <svg className="import-loading-title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" stroke="currentColor" strokeWidth="2" />
                          <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {extractionProgress.current} question{extractionProgress.current === 1 ? '' : 's'} extracted successfully!
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
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  </svg>
                  Choose File
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
