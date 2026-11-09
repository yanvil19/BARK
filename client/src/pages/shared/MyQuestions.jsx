import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { getImportLimits, importQuestionsFromFile } from '../../lib/importApi.js';
import { mapExtractedQuestions } from '../../lib/importText.js';

// Word templates in client/public/templates, offered in the Import Questions window
const IMPORT_TEMPLATES = [
  {
    file: 'bark-import-template-single-questions.docx',
    downloadName: 'BARK Import Template - Single Questions.docx',
    title: 'Single Questions',
    description: 'Standalone questions with choices and answer, plus an optional rationalization and subject.',
  },
  {
    file: 'bark-import-template-question-sets.docx',
    downloadName: 'BARK Import Template - Question Sets.docx',
    title: 'Question Sets',
    description: 'Questions that share one passage, case or scenario. Can be mixed with single questions.',
  },
  {
    file: 'bark-import-template-math-equations.docx',
    downloadName: 'BARK Import Template - Math Equations.docx',
    title: 'Math Equations',
    description: 'Equations made with Word\'s equation tool, or typed as LaTeX between $ signs.',
  },
];
import QuestionForm from '../../components/QuestionForm.jsx';
import { Modal } from '../../components/Modal.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import Pagination from '../../components/Pagination.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import ImportReviewBubbles from '../../components/ImportReviewBubbles.jsx';
import SetMemberRows from '../../components/SetMemberRows.jsx';
import QuestionDetailPanels from '../../components/QuestionDetailPanels.jsx';
import { CardLegend, Marker, StateMarker, USED_IN_EXAM_ICON } from '../../components/QuestionMarkers.jsx';
import SafeHtml, { truncateHtml } from '../../components/SafeHtml.jsx';
import TrashButton, { TrashIcon } from '../../components/TrashButton.jsx';
import { useToast } from '../../components/Toast.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import usePanelLayout from '../../hooks/usePanelLayout.js';
// The list, panel and motion are the same as Approve Questions, so they share its styles
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/MyQuestions.css';
import PageHeader from '../../components/PageHeader.jsx';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

import { getStatusLabel } from '../../utils/statusLabels.js';

const STATE_FILTERS = ['all', 'draft', 'pending_chair', 'restored', 'returned', 'approved', 'rejected'];
const LEGEND_STATES = STATE_FILTERS.filter((state) => state !== 'all');
const ITEMS_PER_PAGE = 10;

// A set is one item in the list and the panel, so both find it by its groupId
function getItemKey(question) {
  return question.groupId || question._id;
}

function formatProgramLabel(program) {
  return program?.name || program?.code || 'N/A';
}

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

function formatCount(value, singular) {
  const total = Number(value) || 0;
  return `${total} ${singular}${total === 1 ? '' : 's'}`;
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

export default function MyQuestions({ role, programId, programLabel, programs = [], onProgramChange, me }) {
  const { notify } = useToast();
  const [questions, setQuestions] = useState([]);
  const [tags, setTags] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [editQuestion, setEditQuestion] = useState(null);
  const [editGroupQuestions, setEditGroupQuestions] = useState(null);
  // The panel: the open question or set, the question shown from a set, and the image opened full size
  const [selectedKey, setSelectedKey] = useState(null);
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  // Widened over the list, or covering the whole window
  const panelLayout = usePanelLayout(selectedKey);
  const [fullscreenImage, setFullscreenImage] = useState(null);
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
    maxQuestions: 40,
  });
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [importStage, setImportStage] = useState('idle'); // 'idle' | 'extracting' | 'completed'
  const [importSlow, setImportSlow] = useState(false); // the import has taken over 30 seconds
  const [importedCount, setImportedCount] = useState(0);
  const slowTimerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [questionToDelete, setQuestionToDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [questionToSubmit, setQuestionToSubmit] = useState(null);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [showProgramPickerModal, setShowProgramPickerModal] = useState(false);
  const [pendingDeanAction, setPendingDeanAction] = useState('create');
  const [pendingProgramId, setPendingProgramId] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasImportDraft, setHasImportDraft] = useState(false);
  const [isRestoringImportDraft, setIsRestoringImportDraft] = useState(false);
  const [maxImages, setMaxImages] = useState(5);
  const [maxAnswerImages, setMaxAnswerImages] = useState(5);
  const [maxGroupContextImages, setMaxGroupContextImages] = useState(5);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, filter, searchQuery, subjectFilter, sortBy, programId]);

  // ...and the open question's card stays in view when the columns change, once they finish gliding
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedKey, currentPage, panelLayout.isExpanded, panelLayout.isGliding]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedKey) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedKey]);

  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullscreenImage]);

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
      const programParam = programId ? `?programId=${encodeURIComponent(programId)}` : '';
      const data = await apiAuth(`${BASE}/api/questions${programParam}`);
      setQuestions(data.questions || []);
    } catch (err) {
      console.error('Failed to load questions:', err);
      notify(err.message || 'Your questions could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [notify, programId]);

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

  useEffect(() => () => clearTimeout(slowTimerRef.current), []);

  useEffect(() => {
    apiAuth('/api/admin/settings/public')
      .then(res => {
        setMaxImages(Number(res?.maxUploadImages ?? 5));
        setMaxAnswerImages(Number(res?.maxAnswerImages ?? 5));
        setMaxGroupContextImages(Number(res?.maxGroupContextImages ?? 5));
      })
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
        q.groupContext,
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

  // What each set contains, across the whole list so a search can't shrink it
  const setInfo = useMemo(() => {
    const info = new Map();
    baseQuestions.forEach((q) => {
      if (!q.groupId) return;
      const entry = info.get(q.groupId) || { size: 0, usedInExam: false };
      entry.size += 1;
      entry.usedInExam = entry.usedInExam || !!q.is_used_in_exam;
      info.set(q.groupId, entry);
    });
    return info;
  }, [baseQuestions]);

  // Each set's questions in set order, for the rows under its card
  const setMembersById = useMemo(() => {
    const sets = new Map();
    baseQuestions.forEach((q) => {
      if (!q.groupId) return;
      if (!sets.has(q.groupId)) sets.set(q.groupId, []);
      sets.get(q.groupId).push(q);
    });
    sets.forEach((members) => members.sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0)));
    return sets;
  }, [baseQuestions]);

  // A set shows as one card
  const displayQuestions = useMemo(() => {
    const seen = new Set();
    return filteredQuestions.filter((q) => {
      if (!q.groupId) return true;
      if (seen.has(q.groupId)) return false;
      seen.add(q.groupId);
      return true;
    });
  }, [filteredQuestions]);

  const totalPages = Math.ceil(displayQuestions.length / ITEMS_PER_PAGE) || 1;
  const paginatedQuestions = displayQuestions.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Deleted or submitted questions can leave the list, which can empty the last page
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Every count is in questions, like the status pills; a set is one list item but several questions
  const listedQuestionCount = displayQuestions.reduce((sum, q) => sum + (q.groupId ? setInfo.get(q.groupId)?.size || 1 : 1), 0);
  const isListPlural = displayQuestions.length !== 1;
  const listItemLabel = listedQuestionCount === displayQuestions.length
    ? (isListPlural ? 'questions' : 'question')
    : `${isListPlural ? 'items' : 'item'} (${formatCount(listedQuestionCount, 'question')})`;

  let emptyMessage = 'No questions found.';
  if (!searchQuery.trim() && !subjectFilter) {
    emptyMessage = filter === 'all'
      ? 'No questions found. Create your first one!'
      : `No ${getStatusLabel(filter)} questions found.`;
  }

  // The panel reads from the list, so a save, submit or delete shows there straight away
  const selectedMembers = useMemo(() => (
    selectedKey
      ? baseQuestions
        .filter((q) => getItemKey(q) === selectedKey)
        .sort((a, b) => (a.groupOrder ?? 0) - (b.groupOrder ?? 0))
      : []
  ), [baseQuestions, selectedKey]);
  const selectedQuestion = selectedMembers[0] || null;
  const currentIdx = Math.min(activeGroupIdx, Math.max(selectedMembers.length - 1, 0));
  const currentQuestion = selectedMembers[currentIdx] || null;
  const isSelectedSet = !!selectedQuestion?.groupId;
  const canEditSelected = selectedQuestion?.state === 'draft' || selectedQuestion?.state === 'returned';
  const selectedNoun = isSelectedSet ? 'question set' : 'question';

  function handleSelectQuestion(question) {
    const key = getItemKey(question);
    if (key === selectedKey) return;
    setSelectedKey(key);
    setActiveGroupIdx(0);
    // A set shares one note, so opening it reads the note for all of its questions
    markQuestionsAsRead(baseQuestions.filter((q) => getItemKey(q) === key));
  }

  // A row under a set's card opens the set at that question
  function openSetMember(question, index) {
    handleSelectQuestion(question);
    setActiveGroupIdx(index);
  }

  function closeFormModal() {
    setShowForm(false);
    setEditQuestion(null);
    setEditGroupQuestions(null);
    setImportedQuestions([]);
    setIsRestoringImportDraft(false);
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

  function markQuestionsAsRead(list) {
    const unread = list.filter((q) => (q.state === 'returned' || q.state === 'rejected') && !q.feedbackRead);
    if (unread.length === 0) return;
    Promise.all(unread.map((q) => (
      apiAuth(`${BASE}/api/questions/${q._id}/mark-read`, { method: 'PATCH' })
        .then(() => q._id)
        .catch(() => null)
    ))).then((ids) => {
      const readIds = new Set(ids.filter(Boolean));
      setQuestions((prev) => prev.map((q) => (readIds.has(q._id) ? { ...q, feedbackRead: true } : q)));
      window.dispatchEvent(new CustomEvent('badge-counts-updated'));
    });
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
  }

  // Puts saved questions into the list: replaces the ones already shown and adds new ones on top
  function mergeSavedQuestions(savedData, isEdit) {
    // Anything new lands at the top of the list, so show it there
    if (!isEdit) setCurrentPage(1);

    if (Array.isArray(savedData)) {
      if (savedData.length > 0 && savedData[0].groupId) {
        // Group saved/updated: update existing members, drop removed ones, and add new ones
        const { groupId } = savedData[0];
        const savedIds = new Set(savedData.map((q) => q._id));
        const savedMap = new Map(savedData.map((q) => [q._id, q]));
        setQuestions((prev) => {
          const updated = prev
            .filter((q) => q.groupId !== groupId || savedIds.has(q._id))
            .map((q) => (savedIds.has(q._id) ? savedMap.get(q._id) : q));
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
  }

  function handleSaved(savedData, isEdit) {
    mergeSavedQuestions(savedData, isEdit);
    closeFormModal();
  }

  function handleDelete(question) {
    setQuestionToDelete(question.groupId ? { ...question, isGroupAction: true } : question);
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
      notify(questionToDelete.isGroupAction ? 'Question set deleted.' : 'Question deleted.', { variant: 'success' });
      setSelectedKey(null);
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
      notify(`${questionToSubmit.isGroupAction ? 'Question set' : 'Question'} submitted for review.`, { variant: 'success' });
      // It has left a Draft or Returned view, so the panel goes with it
      if (filter !== 'all' && filter !== 'pending_chair') setSelectedKey(null);
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
    setImportStage('extracting');
    setImportSlow(false);
    setImportedCount(0);

    // A long file can take a while; after 30 seconds the message says so
    clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setImportSlow(true), 30000);

    try {
      // One request: the server reads the file, then the AI counts and extracts its questions
      const result = await importQuestionsFromFile(file, tags);

      // Formatting and $…$ equations become editor HTML; sets keep their shared passage
      const preFilledQuestions = mapExtractedQuestions(result.questions || [], tags);
      if (preFilledQuestions.length === 0) {
        throw new Error('No questions could be extracted from this file. Please check the format and try again.');
      }

      if (result.limits) {
        setImportLimits(result.limits);
      } else {
        fetchLimits();
      }

      // Brief completed state, then open review form
      setImportedCount(preFilledQuestions.length);
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
      }, 700);
    } catch (error) {
      setImportLoading(false);
      setImportStage('idle');
      console.error('Import error:', error);
      // The server sends the updated limits when the file used up an upload
      if (error.data?.limits) {
        setImportLimits(error.data.limits);
      } else {
        fetchLimits();
      }
      setImportError(error.message || error.data?.error || 'Failed to import questions. Please try again.');
    } finally {
      clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
      setImportSlow(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  return (
    <main className="my-questions-page ca-page page-shell">
      <PageHeader
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
        className="ca-state-pills"
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
        className="ca-filters-wrapper"
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

      <div className={panelLayout.layoutClass(Boolean(selectedQuestion))} onTransitionEnd={panelLayout.onLayoutTransitionEnd}>
        <section className="ca-list-panel" aria-label="Questions">
          <CardLegend states={LEGEND_STATES} />

          <div className="ca-list-scroll" ref={listScrollRef}>
            {loading ? (
              <div className="ca-empty">Loading questions...</div>
            ) : displayQuestions.length === 0 ? (
              <div className="ca-empty">{emptyMessage}</div>
            ) : (
              /* Keyed so the cards animate in for each new view, but not while typing a search */
              <div
                className="ca-questions-list"
                key={[filter, subjectFilter, programId, sortBy, currentPage].join('|')}
              >
                {paginatedQuestions.map((question, cardIndex) => {
                  const isGrouped = !!question.groupId;
                  const set = isGrouped ? setInfo.get(question.groupId) : null;
                  const isUsedInExam = question.state === 'approved' && (isGrouped ? set?.usedInExam : question.is_used_in_exam);
                  const updatedAt = question.updatedAt || question.createdAt;

                  return (
                    <Fragment key={getItemKey(question)}>
                    <div
                      className={`${isGrouped ? 'ca-group-header-card' : 'ca-question-card'} ${getItemKey(question) === selectedKey ? 'is-active' : ''}`}
                      style={{ '--card-index': cardIndex }}
                      onClick={() => handleSelectQuestion(question)}
                    >
                      <div className="ca-card-top">
                        {/* Its click bubbles up to the card, so keyboard users can open the card too */}
                        <button type="button" className="ca-card-open">
                          <span className={`ca-card-desc ${isGrouped ? 'ca-card-desc--set' : ''}`}>
                            {isGrouped
                              ? (question.groupContext?.trim() ? <SafeHtml html={truncateHtml(question.groupContext.trim(), 80)} /> : 'Question Set')
                              : <SafeHtml html={truncateHtml(question.description, 100)} />}
                          </span>
                        </button>
                        <div className="ca-card-markers">
                          {isGrouped && (
                            <Marker className="ca-marker--count" label={formatCount(set?.size, 'question')}>{set?.size}</Marker>
                          )}
                          {isUsedInExam && (
                            <Marker className="ca-marker--used" label="Used in exam">{USED_IN_EXAM_ICON}</Marker>
                          )}
                          <StateMarker state={question.state} />
                        </div>
                      </div>
                      <div className="ca-card-meta">
                        {role === 'dean' && <span className="ca-program-pill">{formatProgramLabel(question.program)}</span>}
                        <span className="ca-tag-pill">{question.tag?.name || 'No subject'}</span>
                        <span className="ca-card-meta-datetime">
                          <span className="ca-date">{formatDate(updatedAt)}</span>
                          <span className="ca-time">{formatTime(updatedAt)}</span>
                        </span>
                      </div>
                    </div>
                    {isGrouped && (
                      <SetMemberRows
                        members={setMembersById.get(question.groupId) || []}
                        open={getItemKey(question) === selectedKey}
                        activeIndex={currentIdx}
                        cardIndex={cardIndex}
                        onOpenMember={(index) => openSetMember(question, index)}
                      />
                    )}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {!loading && (
            <Pagination
              currentPage={currentPage}
              totalItems={displayQuestions.length}
              pageSize={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
              itemLabel={listItemLabel}
              classPrefix="ca"
              maxPageButtons={5}
            />
          )}
        </section>

        {selectedQuestion ? (
          <div className={panelLayout.sidebarClass} ref={panelRef}>
            <PanelHeader
              title={isSelectedSet ? `Question Set (${selectedMembers.length} Questions)` : 'Question Details'}
              isExpanded={panelLayout.isExpanded}
              onToggleExpanded={panelLayout.toggleExpanded}
              isFullscreen={panelLayout.isFullscreen}
              onToggleFullscreen={panelLayout.toggleFullscreen}
              onClose={() => setSelectedKey(null)}
              closeLabel="Close question details"
            />

            {/* Keyed so each question starts scrolled to the top */}
            <div className="ca-sidebar-content" key={selectedKey}>
              {/* First, since it says what to fix before the question is read again */}
              {selectedQuestion.state === 'returned' && (currentQuestion.revisionNote || selectedQuestion.revisionNote) && (
                <section className="ca-section ca-section--note">
                  <h3 className="ca-section-label">Revision Note</h3>
                  <p className="ca-note-text">{currentQuestion.revisionNote || selectedQuestion.revisionNote}</p>
                </section>
              )}

              {selectedQuestion.state === 'rejected' && (currentQuestion.rejectionReason || selectedQuestion.rejectionReason) && (
                <section className="ca-section ca-section--note">
                  <h3 className="ca-section-label">Rejection Reason</h3>
                  <p className="ca-note-text">{currentQuestion.rejectionReason || selectedQuestion.rejectionReason}</p>
                </section>
              )}

              {selectedMembers.length > 1 && (
                <ImportReviewBubbles
                  questions={selectedMembers}
                  currentIdx={currentIdx}
                  onSelectQuestion={setActiveGroupIdx}
                  readOnly
                  allInOneSet
                />
              )}

              {/* Keyed here and below so moving between a set's questions fades them in */}
              <QuestionDetailPanels
                key={currentQuestion._id}
                question={organizeQuestionAnswers(currentQuestion)}
                passage={isSelectedSet ? (currentQuestion.groupContext || '').trim() : ''}
                passageImages={isSelectedSet ? currentQuestion.groupContextImages || [] : []}
                onZoom={setFullscreenImage}
              />

              <section className="ca-section ca-review-metadata" key={`details-${currentQuestion._id}`}>
                <div className="ca-meta-grid">
                  <div>
                    <span className="ca-meta-label">Subject</span>
                    <div className="ca-meta-value">{currentQuestion.tag?.name || 'No subject'}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Program</span>
                    <div className="ca-meta-value">{formatProgramLabel(currentQuestion.program)}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Status</span>
                    <div className="ca-meta-value">{getStatusLabel(currentQuestion.state)}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Submitted</span>
                    <div className="ca-meta-value">{currentQuestion.submittedAt ? formatDateTime(currentQuestion.submittedAt) : 'Not submitted'}</div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Last Edited By</span>
                    <div className="ca-meta-value">
                      {currentQuestion.lastEditedAt ? (currentQuestion.lastEditedBy?.name || 'Unknown') : 'Not edited'}
                    </div>
                  </div>
                  <div>
                    <span className="ca-meta-label">Last Edited</span>
                    <div className="ca-meta-value">{formatDateTime(currentQuestion.lastEditedAt)}</div>
                  </div>
                </div>
              </section>
            </div>

            <div className="ca-sidebar-actions">
              {canEditSelected ? (
                <>
                  <button type="button" className="ca-btn ca-btn--edit" onClick={() => openEditModal(currentQuestion)}>Edit</button>
                  <button
                    type="button"
                    className="ca-btn ca-btn--approve"
                    onClick={() => handleSubmit(selectedQuestion, isSelectedSet)}
                  >
                    {selectedQuestion.state === 'returned' ? 'Re-submit' : 'Submit'}
                  </button>
                  <TrashButton label={`Delete ${selectedNoun}`} onClick={() => handleDelete(selectedQuestion)} />
                </>
              ) : selectedQuestion.state === 'rejected' ? (
                <button type="button" className="ca-btn ca-btn--reject qp-delete-btn" onClick={() => handleDelete(selectedQuestion)}>
                  <TrashIcon />
                  {isSelectedSet ? 'Delete Question Set' : 'Delete Question'}
                </button>
              ) : (
                <p className="ca-no-actions">No actions available for this {selectedNoun}.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="ca-sidebar ca-sidebar--empty">
            <p>Select a question to view details</p>
          </div>
        )}
      </div>

      <Modal
        open={showForm}
        onClose={closeFormModal}
        title={editGroupQuestions ? 'Edit Question Set' : editQuestion ? 'Edit Question' : 'Create Question'}
      >
        <div className="qp-modal-copy">
          <p className="qp-modal-subtitle">
            {editGroupQuestions
              ? 'Update the questions in this set and their shared passage, then save your changes.'
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
          maxAnswerImages={maxAnswerImages}
          maxGroupContextImages={maxGroupContextImages}
          importedQuestions={importedQuestions.length > 0 ? importedQuestions : null}
          isImportDraft={isRestoringImportDraft}
          onFeedback={setFeedbackModal}
          onSaved={(savedData, isEdit) => {
            handleSaved(savedData, isEdit);
            setImportedQuestions([]); // Clear after save
          }}
          // Some questions saved before an error: show them, keep the form open for the rest
          onPartialSave={(savedData) => mergeSavedQuestions(savedData, false)}
          onClose={() => {
            closeFormModal();
            setImportedQuestions([]);
          }}
        />
      </Modal>

      {fullscreenImage && (
        <div
          className="ca-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ca-image-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ca-image-close" onClick={() => setFullscreenImage(null)}>Close</button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="ca-image-full" />
          </div>
        </div>
      )}

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
            Upload a Word (.docx) or PDF file containing multiple choice questions. An AI will extract the questions for your review.
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
              <span>{importLimits.maxQuestions ?? 40} per upload</span>
            </div>
          </div>

          <section className="qp-import-templates" aria-labelledby="qp-import-templates-title">
            <div className="qp-import-templates-header">
              <h3 id="qp-import-templates-title" className="qp-import-templates-title">Templates</h3>
            </div>
            <p className="qp-import-templates-hint">
              Start from a template so the AI reads your file correctly. Word files keep bold, italic, underline and equations.
            </p>
            <ul className="qp-import-template-list">
              {IMPORT_TEMPLATES.map((template) => (
                <li key={template.file} className="qp-import-template">
                  <span className="qp-import-template-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </span>
                  <span className="qp-import-template-text">
                    <strong>{template.title}</strong>
                    <span>{template.description}</span>
                  </span>
                  <a
                    className="qp-import-template-download"
                    href={`${import.meta.env.BASE_URL}templates/${template.file}`}
                    download={template.downloadName}
                    aria-label={`Download the ${template.title} template (Word)`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M12 4v11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      <path d="m7 11 5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M5 20h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </section>

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
                {/* ── Reading the file and extracting (one request) ──── */}
                {importStage === 'extracting' && (
                  <>
                    <div className="import-loading-header">
                      <span className="import-loading-spinner" />
                      <h3 className="import-loading-title">Reading your file and extracting questions…</h3>
                    </div>
                    <span className="import-drop-zone-footnote" role="status">
                      {importSlow
                        ? 'Still working. A file with many questions can take a minute or more, so please keep this window open.'
                        : 'Please wait while the AI reads the questions, choices, answers and any rationalizations in your file.'}
                    </span>
                  </>
                )}

                {/* ── Completed ──────────────────────────────────────── */}
                {importStage === 'completed' && (
                  <>
                    <div className="import-loading-header">
                      <h3 className="import-loading-title">
                        <svg className="import-loading-title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                          <path d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Z" stroke="currentColor" strokeWidth="2" />
                          <path d="m8 12 3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        {importedCount} question{importedCount === 1 ? '' : 's'} extracted successfully!
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
                      : 'Drag & drop or browse your typed Word (.docx) or PDF file'}
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
                  This feature uses AI to extract multiple-choice questions (max {importLimits.maxQuestions ?? 40} questions per file).
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
