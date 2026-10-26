import AuthImage from '../../components/AuthImage.jsx';
import AnswerImage from '../../components/AnswerImage.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { getStatusLabel } from '../../utils/statusLabels.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { Modal } from '../../components/Modal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import Pagination from '../../components/Pagination.jsx';
import '../../styles/shared/CreateExams.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;
const EXAM_CREATE_DRAFT_KEY = 'draft_exam_create';
const EMPTY_EXAM_FORM = {
  name: '',
  startDateTime: '',
  endDateTime: '',
  description: '',
  instructions: '',
  targetAudience: 'student',
  status: 'draft',
  isTimed: false,
  timeLimitMinutes: 180,
  passingThreshold: 70,
};

function readExamCreateDraft() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(EXAM_CREATE_DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to restore exam creation draft:', err);
    return null;
  }
}

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + 'T' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes())
  );
}

function ensureISOString(value) {
  if (!value) return '';
  // If already in ISO format with Z, return as-is
  if (value.endsWith('Z')) return value;
  // If it's a local string, convert via Date object to ISO+Z
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function formatDurationFromMinutes(value) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return '';
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs && mins) return `${hrs} hours ${mins} minutes`;
  if (hrs) return `${hrs} hour${hrs === 1 ? '' : 's'}`;
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

function truncateText(text, max = 100) {
  if (!text) return '';

  const clean = text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length <= max) return clean;

  return `${clean.slice(0, max)}...`;
}

// Grey circle + check beside a field label or tab; turns green once valid / complete
function FieldCheck({ valid, validText = 'Valid', invalidText = 'Not yet valid' }) {
  return (
    <span
      className={`mbe-field-check${valid ? ' is-valid' : ''}`}
      role="img"
      aria-label={valid ? validText : invalidText}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function MockBoardExam({ me, editingExamId, onExamSaved, onClearEditing }) {
  const isEditing = !!editingExamId;
  const initialDraftRef = useRef(isEditing ? null : readExamCreateDraft());

  const [programs, setPrograms] = useState([]);
  const [programId, setProgramId] = useState(() => initialDraftRef.current?.programId || '');
  const [subjectOptions, setSubjectOptions] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState(() => (
    Array.isArray(initialDraftRef.current?.selectedTagIds) ? initialDraftRef.current.selectedTagIds : []
  ));
  const [approvedQuestions, setApprovedQuestions] = useState([]);
  const [selectedQuestions, setSelectedQuestions] = useState(() => (
    Array.isArray(initialDraftRef.current?.selectedQuestions) ? initialDraftRef.current.selectedQuestions : []
  ));
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState({});
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [questionFilterTagId, setQuestionFilterTagId] = useState('');
  const [approvedSelectionFilter, setApprovedSelectionFilter] = useState('all');
  const [questionStateFilter, setQuestionStateFilter] = useState('all');
  const [selectedQuestionFilterTagId, setSelectedQuestionFilterTagId] = useState('');
  const [expandedQuestionIds, setExpandedQuestionIds] = useState({});
  const [returnModal, setReturnModal] = useState(null);
  const [returnNote, setReturnNote] = useState('');
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnError, setReturnError] = useState('');
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [filteredBulkModal, setFilteredBulkModal] = useState(null); // 'add' | 'remove' | null
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  // Subject search + pagination
  const [subjectSearch, setSubjectSearch] = useState('');
  const [subjectPage, setSubjectPage] = useState(1);
  const SUBJECTS_PER_PAGE = 8;
  // Approved questions pagination
  const [questionPage, setQuestionPage] = useState(1);
  const QUESTIONS_PER_PAGE = 15;
  // TODO: temporary demo pattern - for production, consider autosaving drafts to the backend instead of localStorage, since this content is confidential and shouldn't persist client-side long-term
  const [form, setForm] = useState(() => (
    initialDraftRef.current?.form && typeof initialDraftRef.current.form === 'object'
      ? { ...EMPTY_EXAM_FORM, ...initialDraftRef.current.form }
      : EMPTY_EXAM_FORM
  ));

  // Active tab state: 'details' | 'subjects' | 'questions' | 'review'
  const [activeTab, setActiveTab] = useState('details');

  useEffect(() => {
    if (isEditing) return;
    const id = setTimeout(() => {
      try {
        const hasDraft =
          Boolean(programId) ||
          selectedTagIds.length > 0 ||
          selectedQuestions.length > 0 ||
          JSON.stringify(form) !== JSON.stringify(EMPTY_EXAM_FORM);

        if (!hasDraft) {
          window.localStorage.removeItem(EXAM_CREATE_DRAFT_KEY);
          return;
        }

        window.localStorage.setItem(EXAM_CREATE_DRAFT_KEY, JSON.stringify({
          programId,
          selectedTagIds,
          selectedQuestions,
          form,
        }));
      } catch (err) {
        console.warn('Failed to save exam creation draft:', err);
      }
    }, 500);
    return () => clearTimeout(id);
  }, [form, isEditing, programId, selectedQuestions, selectedTagIds]);

  const isAlumniExam = (form.targetAudience || 'student') === 'alumni';

  const computedDuration = useMemo(() => {
    if (!form.startDateTime || !form.endDateTime) return null;
    const start = new Date(form.startDateTime);
    const end = new Date(form.endDateTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
    const diffMins = Math.round((end - start) / 60000);
    if (diffMins < 0) return 'Invalid (End is before Start)';
    const hrs = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return `${hrs} hours ${mins} minutes`;
  }, [form.startDateTime, form.endDateTime]);

  // Re-check schedule validity as time passes (a start time can slip into the past)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // ─── Details field checks (grey → green once valid) ────────────────────────
  // Schedule rules mirror the server's publish checks: start in the future, end after start.
  const startTime = form.startDateTime ? new Date(form.startDateTime).getTime() : NaN;
  const endTime = form.endDateTime ? new Date(form.endDateTime).getTime() : NaN;
  const timeLimit = form.timeLimitMinutes === '' ? NaN : Number(form.timeLimitMinutes);
  const threshold = form.passingThreshold === '' ? NaN : Number(form.passingThreshold);
  const fieldValid = {
    name: (form.name || '').trim() !== '',
    program: Boolean(programId),
    start: Number.isFinite(startTime) && startTime > now,
    end: Number.isFinite(startTime) && Number.isFinite(endTime) && endTime > startTime && endTime > now,
    timeLimit: Number.isFinite(timeLimit) && timeLimit >= 1,
    passingThreshold: Number.isFinite(threshold) && threshold >= 0 && threshold <= 100,
    description: (form.description || '').trim() !== '',
    instructions: (form.instructions || '').trim() !== '',
  };

  useEffect(() => {
    async function fetchPrograms() {
      setLoadingPrograms(true);
      try {
        const data = await apiAuth(`${BASE}/api/catalog/programs`);
        const deptId = me?.department?._id || me?.department;
        const deptPrograms = (data.programs || []).filter((program) => {
          const programDept = program.department?._id || program.department;
          return String(programDept) === String(deptId);
        });
        setPrograms(deptPrograms);

        if (!editingExamId && deptPrograms.length === 1) setProgramId(deptPrograms[0]._id);

        let filtered = deptPrograms;

        if (me.role === 'program_chair') {
          const myProgramId = me?.program?._id || me?.program;
          filtered = deptPrograms.filter((program) => String(program._id) === String(myProgramId));
          setPrograms(filtered);

          if (filtered.length === 1) {
            setProgramId(filtered[0]._id);
          }
        }

      } catch (err) {
        console.error('Failed to load programs:', err);
      } finally {
        setLoadingPrograms(false);
      }
    }

    if (me?.department) fetchPrograms();
  }, [editingExamId, me]);

  useEffect(() => {
    async function loadExamForEdit() {
      if (!editingExamId) return;
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(editingExamId)}`);
        const exam = data.exam;
        const nextTagIds = (exam.subjectTags || []).map((tag) => tag._id || tag);
        const nextQuestions = (exam.questions || []).map((question) => ({
          ...question,
          tagId: question.tag?._id || question.tag,
        }));

        setProgramId(exam.program?._id || exam.program || '');
        setSelectedTagIds(nextTagIds);
        setSelectedQuestions(nextQuestions);
        setForm({
          name: exam.name || '',
          startDateTime: toLocalDateTimeInput(exam.startDateTime),
          endDateTime: toLocalDateTimeInput(exam.endDateTime),
          description: exam.description || '',
          instructions: exam.instructions || '',
          targetAudience: exam.targetAudience || 'student',
          status: exam.status || 'draft',
          isTimed: Boolean(exam.isTimed),
          timeLimitMinutes: exam.timeLimitMinutes || 180,
          passingThreshold: exam.passingThreshold || 70,
        });
      } catch (err) {
        setFeedbackModal({
          title: 'Unable to Load Exam',
          tone: 'danger',
          message: err.message || 'Failed to load mock board exam.',
        });
      }
    }

    loadExamForEdit();
  }, [editingExamId]);

  useEffect(() => {
    async function fetchSubjects() {
      if (!programId) {
        setSubjectOptions([]);
        setSelectedTagIds([]);
        return;
      }
      setLoadingSubjects(true);
      try {
        const data = await apiAuth(`${BASE}/api/tags?program=${encodeURIComponent(programId)}`);
        setSubjectOptions(data.tags || []);
      } catch (err) {
        console.error('Failed to load subjects:', err);
      } finally {
        setLoadingSubjects(false);
      }
    }

    fetchSubjects();
  }, [programId]);

  useEffect(() => {
    async function fetchApprovedQuestions() {
      if (!programId || selectedTagIds.length === 0) {
        setApprovedQuestions([]);
        setSelectedQuestions((prev) => prev.filter((question) => selectedTagIds.includes(question.tag?._id || question.tagId || question.tag)));
        return;
      }

      setLoadingQuestions(true);
      try {
        const params = new URLSearchParams({
          program: programId,
          tags: selectedTagIds.join(','),
          states: 'approved'
        });
        const data = await apiAuth(`${BASE}/api/mock-board-exams/approved-questions?${params.toString()}`);
        setApprovedQuestions(data.questions || []);
      } catch (err) {
        console.error('Failed to load approved questions:', err);
      } finally {
        setLoadingQuestions(false);
      }
    }

    fetchApprovedQuestions();
  }, [programId, selectedTagIds]);

  useEffect(() => {
    setSelectedQuestions((prev) =>
      prev.filter((question) => {
        const questionTagId = question.tag?._id || question.tagId || question.tag;
        return selectedTagIds.length === 0 || selectedTagIds.includes(String(questionTagId));
      })
    );
  }, [selectedTagIds]);

  const selectedQuestionIds = useMemo(
    () => new Set(selectedQuestions.map((question) => String(question._id))),
    [selectedQuestions]
  );

  const filteredApprovedQuestions = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return approvedQuestions
      .map((question) => organizeQuestionAnswers(question))
      .filter((question) => {
        const matchesSearch = !needle || [question.description, question.tag?.name, question.createdBy?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle);

        const questionTagId = String(question.tag?._id || question.tagId || question.tag || '');
        const matchesTag = !questionFilterTagId || questionTagId === String(questionFilterTagId);
        const isSelected = selectedQuestionIds.has(String(question._id));
        const matchesSelection =
          approvedSelectionFilter === 'all' ||
          (approvedSelectionFilter === 'selected' && isSelected) ||
          (approvedSelectionFilter === 'unselected' && !isSelected);

        const matchesState = questionStateFilter === 'all' || question.state === questionStateFilter;

        return matchesSearch && matchesTag && matchesSelection && matchesState;
      });

    // Keep questions belonging to the same group contiguous and ordered by groupOrder
    const groupClusters = new Map();
    const result = [];
    for (const q of filtered) {
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
  }, [approvedQuestions, approvedSelectionFilter, questionFilterTagId, searchQuery, selectedQuestionIds, questionStateFilter]);

  const filteredSubjectOptions = useMemo(
    () => subjectOptions.filter((tag) => selectedTagIds.includes(String(tag._id))),
    [selectedTagIds, subjectOptions]
  );

  const filteredSelectedQuestions = useMemo(
    () =>
      selectedQuestions.filter((question) => {
        const questionTagId = String(question.tag?._id || question.tagId || question.tag || '');
        return !selectedQuestionFilterTagId || questionTagId === String(selectedQuestionFilterTagId);
      }),
    [selectedQuestionFilterTagId, selectedQuestions]
  );

  useEffect(() => {
    if (!questionFilterTagId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(questionFilterTagId));
    if (!stillExists) setQuestionFilterTagId('');
  }, [filteredSubjectOptions, questionFilterTagId]);

  useEffect(() => {
    if (!selectedQuestionFilterTagId) return;
    const stillExists = filteredSubjectOptions.some((tag) => String(tag._id) === String(selectedQuestionFilterTagId));
    if (!stillExists) setSelectedQuestionFilterTagId('');
  }, [filteredSubjectOptions, selectedQuestionFilterTagId]);

  function handleTagChange(tagId) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((item) => item !== tagId) : [...prev, tagId]
    );
  }

  function resolveImageUrl(image) {
    return image?.startsWith('/') ? `${BASE}${image}` : image;
  }

  function handleQuestionToggle(question) {
    const isGrouped = Boolean(question.groupId);
    const relatedQuestions = isGrouped
      ? approvedQuestions.filter(q => q.groupId === question.groupId)
      : [question];

    const relatedIds = new Set(relatedQuestions.map(q => String(q._id)));
    const isAnySelected = selectedQuestions.some(item => relatedIds.has(String(item._id)));

    setSelectedQuestions((prev) => {
      if (isAnySelected) {
        // Deselect all members of this group
        return prev.filter(item => !relatedIds.has(String(item._id)));
      }
      // Add all members of this group (avoiding duplicates)
      const existingIds = new Set(prev.map(item => String(item._id)));
      const toAdd = relatedQuestions.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...toAdd];
    });
  }

  function handleBulkCheckbox(e, question) {
    e.stopPropagation();
    const isGrouped = Boolean(question.groupId);
    const relatedQuestions = isGrouped
      ? approvedQuestions.filter(q => q.groupId === question.groupId)
      : [question];
    const relatedIds = relatedQuestions.map(q => q._id);

    setBulkSelectedIds(prev => {
      const next = new Set(prev);
      const isCurrentlySelected = next.has(question._id);
      if (isCurrentlySelected) {
        relatedIds.forEach(id => next.delete(id));
      } else {
        relatedIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function handleToggleAllFiltered() {
    const visibleIds = filteredApprovedQuestions.map(q => q._id);
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => bulkSelectedIds.has(id));

    if (allSelected) {
      setBulkSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setBulkSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  function handleBulkAddSelected() {
    if (bulkSelectedIds.size === 0) return;
    const questionsToAdd = approvedQuestions.filter(q => bulkSelectedIds.has(q._id));
    setSelectedQuestions(prev => {
      const existingIds = new Set(prev.map(q => String(q._id)));
      const newQuestions = questionsToAdd.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...newQuestions];
    });
    setBulkSelectedIds(new Set());
  }

  function handleBulkRemoveSelected() {
    if (bulkSelectedIds.size === 0) return;
    setSelectedQuestions(prev => prev.filter(q => !bulkSelectedIds.has(q._id)));
    setBulkSelectedIds(new Set());
  }

  function handleConfirmAddFiltered() {
    setSelectedQuestions(prev => {
      const existingIds = new Set(prev.map(q => String(q._id)));
      const newQuestions = filteredApprovedQuestions.filter(q => !existingIds.has(String(q._id)));
      return [...prev, ...newQuestions];
    });
    setFilteredBulkModal(null);
  }

  function handleConfirmRemoveFiltered() {
    const filteredIds = new Set(filteredApprovedQuestions.map(q => String(q._id)));
    setSelectedQuestions(prev => prev.filter(q => !filteredIds.has(String(q._id))));
    setFilteredBulkModal(null);
  }

  function getFilterDescription() {
    const parts = [];
    if (searchQuery.trim()) parts.push(`"${searchQuery.trim()}"`);
    if (questionFilterTagId) {
      const tag = filteredSubjectOptions.find(t => String(t._id) === String(questionFilterTagId));
      if (tag) parts.push(tag.name);
    }
    if (approvedSelectionFilter === 'unselected') parts.push('not selected yet');
    return parts.length > 0 ? parts.join(', ') : null;
  }

  function handleReturnQuestion(question) {
    setReturnModal(question);
    setReturnNote(feedbackByQuestionId[question._id] || '');
    setReturnError('');
  }

  function toggleQuestionExpanded(questionId) {
    setExpandedQuestionIds((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  }

  async function submitReturnQuestion() {
    if (!returnModal) return;
    if (!returnNote.trim()) {
      setReturnError('Please enter feedback before returning this question.');
      return;
    }

    setReturnSubmitting(true);
    setReturnError('');
    try {
      await apiAuth(`${BASE}/api/questions/${returnModal._id}/dean-return`, {
        method: 'POST',
        body: { note: returnNote.trim() },
      });
      setFeedbackByQuestionId((prev) => ({ ...prev, [returnModal._id]: returnNote.trim() }));
      setApprovedQuestions((prev) => prev.filter((item) => item._id !== returnModal._id));
      setSelectedQuestions((prev) => prev.filter((item) => item._id !== returnModal._id));
      setReturnModal(null);
      setReturnNote('');
    } catch (err) {
      setReturnError(err.message || 'Failed to return question.');
      setFeedbackModal({
        title: 'Return Failed',
        tone: 'danger',
        message: err.message || 'Failed to return question.',
      });
    } finally {
      setReturnSubmitting(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        programId,
        subjectTagIds: selectedTagIds,
        questionIds: selectedQuestions.map((question) => question._id),
        startDateTime: ensureISOString(form.startDateTime),
        endDateTime: ensureISOString(form.endDateTime),
        description: form.description,
        instructions: form.instructions,
        targetAudience: form.targetAudience || 'student',
        status: editingExamId ? (form.status || 'draft') : 'draft',
        isTimed: isAlumniExam ? Boolean(form.isTimed) : false,
        timeLimitMinutes: isAlumniExam && form.isTimed ? Number(form.timeLimitMinutes) : null,
        passingThreshold: form.passingThreshold,
      };

      if (editingExamId) {
        await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(editingExamId)}`, {
          method: 'PATCH',
          body: payload,
        });
      } else {
        await apiAuth(`${BASE}/api/mock-board-exams`, {
          method: 'POST',
          body: payload,
        });
      }

      window.localStorage.removeItem(EXAM_CREATE_DRAFT_KEY);

      setForm(EMPTY_EXAM_FORM);
      setSelectedTagIds([]);
      setApprovedQuestions([]);
      setSelectedQuestions([]);
      setActiveTab('details');
      if (programs.length === 1) setProgramId(programs[0]._id);
      else setProgramId('');
      if (onClearEditing) onClearEditing();
      if (onExamSaved) onExamSaved();
      setFeedbackModal({
        title: editingExamId ? 'Mock Board Exam Updated' : 'Mock Board Exam Created',
        tone: 'success',
        message: editingExamId
          ? 'Your changes were saved successfully.'
          : 'The mock board exam was created successfully.',
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Save Failed',
        tone: 'danger',
        message: err.message || 'Failed to save mock board exam.',
      });
    } finally {
      setSaving(false);
    }
  }

  // ─── Derived helpers for Review tab ────────────────────────────────────────
  const questionsBySubject = useMemo(() => {
    const map = {};
    for (const q of selectedQuestions) {
      const tagName = q.tag?.name || 'Unknown Subject';
      if (!map[tagName]) map[tagName] = 0;
      map[tagName]++;
    }
    return map;
  }, [selectedQuestions]);

  const selectedProgram = programs.find(p => String(p._id) === String(programId));

  // ─── Tab completion indicators ──────────────────────────────────────────────
  // Details is complete when every field shown on the tab is valid (time limit only for timed alumni exams)
  const detailsComplete = Object.entries(fieldValid).every(([field, valid]) => (
    field === 'timeLimit' && !(isAlumniExam && form.isTimed) ? true : valid
  ));
  const subjectsComplete = selectedTagIds.length > 0;
  const questionsComplete = selectedQuestions.length > 0;
  const reviewComplete = detailsComplete && subjectsComplete && questionsComplete;

  // ─── Audience hero config ───────────────────────────────────────────────────
  const audienceConfig = isAlumniExam
    ? {
        label: 'ALUMNI EXAM',
        sublabel: 'Practice exam for alumni, available within the scheduled period.',
      }
    : {
        label: 'STUDENT EXAM',
        sublabel: 'Scheduled exam for currently enrolled students.',
      };

  return (
    <main className="mbe-page" data-audience={isAlumniExam ? 'alumni' : 'student'}>
      <PageHeader
        className="shared-page-header--bleed"
        title="Mock Board Exam"
        subtitle={isEditing ? 'Edit an existing mock board exam.' : 'Create a new mock board exam for students or alumni.'}
      />

      <form className="mbe-form" onSubmit={handleSubmit}>

        {/* ── Audience Hero Banner ──────────────────────────────────────────── */}
        <div className="mbe-hero-banner" data-audience={isAlumniExam ? 'alumni' : 'student'}>
          <div className="mbe-hero-left">
            <div className="mbe-hero-text">
              <span className="mbe-hero-label">{audienceConfig.label}</span>
              <span className="mbe-hero-sublabel">{audienceConfig.sublabel}</span>
            </div>
          </div>
          <div className="mbe-hero-right">
            <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>
              {getStatusLabel(form.status)}
            </span>
            {isEditing && (
              <span className="mbe-hero-editing-badge">Editing</span>
            )}
          </div>
        </div>

        {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
        <div className="mbe-tab-bar" role="tablist" aria-label="Exam creation steps">
          {[
            { key: 'details', label: 'Details', complete: detailsComplete, badge: null },
            { key: 'subjects', label: 'Subjects', complete: subjectsComplete, badge: selectedTagIds.length > 0 ? selectedTagIds.length : null },
            { key: 'questions', label: 'Questions', complete: questionsComplete, badge: selectedQuestions.length > 0 ? selectedQuestions.length : null },
            { key: 'review', label: 'Review & Save', complete: reviewComplete, badge: null },
          ].map(({ key, label, complete, badge }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`mbe-tab-btn ${activeTab === key ? 'is-active' : ''}`}
              onClick={() => setActiveTab(key)}
            >
              <FieldCheck valid={complete} validText="Complete" invalidText="Incomplete" />
              {label}
              {badge !== null && (
                <span className={`mbe-tab-badge ${activeTab === key ? 'is-active' : ''}`}>{badge}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: DETAILS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'details' && (
          <section className="mbe-card mbe-form-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>

            {/* Audience toggle cards */}
            <fieldset className="mbe-audience-fieldset">
              <legend className="mbe-audience-legend">Who is this exam for?</legend>
              <div className="mbe-audience-cards">

                <label className={`mbe-audience-card mbe-audience-card--student ${!isAlumniExam ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="targetAudience"
                    value="student"
                    checked={!isAlumniExam}
                    onChange={() => setForm((prev) => ({ ...prev, targetAudience: 'student', isTimed: false }))}
                  />
                  <span className="mbe-audience-card-title">Students</span>
                  <span className="mbe-audience-card-desc">Scheduled exam for enrolled students with a fixed time window.</span>
                </label>

                <label className={`mbe-audience-card mbe-audience-card--alumni ${isAlumniExam ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="targetAudience"
                    value="alumni"
                    checked={isAlumniExam}
                    onChange={() => setForm((prev) => ({ ...prev, targetAudience: 'alumni' }))}
                  />
                  <span className="mbe-audience-card-title">Alumni</span>
                  <span className="mbe-audience-card-desc">Practice exam for alumni. Supports multiple attempts and optional timers.</span>
                </label>

              </div>
            </fieldset>

            <div className="mbe-form-grid">
              <div className="mbe-field">
                <label>
                  <span className="mbe-label-row">Exam Name <FieldCheck valid={fieldValid.name} /></span>
                  <input
                    className="mbe-input"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </label>
              </div>

              <div className="mbe-field">
                <label>
                  <span className="mbe-label-row">Program <FieldCheck valid={fieldValid.program} /></span>
                  <select
                    className="mbe-input"
                    value={programId}
                    onChange={(e) => {
                      setProgramId(e.target.value);
                      setSelectedTagIds([]);
                      setSelectedQuestions([]);
                    }}
                    required
                    disabled={loadingPrograms || me.role === 'program_chair'}
                  >
                    <option value="">Select a program</option>
                    {programs.map((program) => (
                      <option key={program._id} value={program._id}>
                        {program.name} {program.code ? `(${program.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mbe-field">
                <div className="mbe-field-heading">
                  <label><span className="mbe-label-row">Exam Start <FieldCheck valid={fieldValid.start} /></span></label>
                </div>
                <DateTimePicker
                  value={form.startDateTime}
                  onChange={(val) => setForm((prev) => ({ ...prev, startDateTime: val }))}
                />
              </div>

              <div className="mbe-field">
                <div className="mbe-field-heading">
                  <label><span className="mbe-label-row">Exam End <FieldCheck valid={fieldValid.end} /></span></label>
                  <span className={`mbe-field-meta ${computedDuration?.includes('Invalid') ? 'is-error' : ''}`}>
                    {computedDuration ? `Duration: ${computedDuration}` : '\u00A0'}
                  </span>
                </div>
                <DateTimePicker
                  value={form.endDateTime}
                  onChange={(val) => setForm((prev) => ({ ...prev, endDateTime: val }))}
                />
              </div>

              {isAlumniExam && (
                <div className="mbe-field mbe-field--full">
                  <div className="mbe-alumni-settings">
                    <div>
                      <h3>Alumni Attempt Timer</h3>
                      <p>This alumni exam becomes available when published and its schedule starts, and stays open until it ends, is archived or unpublished.</p>
                    </div>

                    <label className="mbe-check-row">
                      <input
                        type="checkbox"
                        checked={Boolean(form.isTimed)}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          isTimed: e.target.checked,
                          timeLimitMinutes: prev.timeLimitMinutes || 180,
                        }))}
                      />
                      <span>Make each alumni attempt timed</span>
                    </label>

                    {form.isTimed ? (
                      <label className="mbe-timer-field">
                        <span className="mbe-label-row">Time Limit (minutes) <FieldCheck valid={fieldValid.timeLimit} /></span>
                        <input
                          className="mbe-input"
                          type="number"
                          min="1"
                          step="1"
                          value={form.timeLimitMinutes}
                          onChange={(e) => setForm((prev) => ({ ...prev, timeLimitMinutes: e.target.value }))}
                          required
                        />
                        <span className="mbe-field-meta">
                          {formatDurationFromMinutes(form.timeLimitMinutes) || 'Enter the allowed attempt time.'}
                        </span>
                      </label>
                    ) : (
                      <p className="mbe-availability-note">Attempts will be untimed.</p>
                    )}
                  </div>
                </div>
              )}

              <div className="mbe-field">
                <label>
                  <span className="mbe-label-row">Passing Threshold (%) <FieldCheck valid={fieldValid.passingThreshold} /></span>
                  <input
                    className="mbe-input"
                    type="number"
                    min="0"
                    max="100"
                    value={form.passingThreshold}
                    onChange={(e) => setForm((prev) => ({ ...prev, passingThreshold: Number(e.target.value) }))}
                    required
                  />
                </label>
              </div>

              <div className="mbe-field mbe-field--full mbe-textarea-grid">
                <label>
                  <span className="mbe-label-row">Description <FieldCheck valid={fieldValid.description} /></span>
                  <textarea
                    className="mbe-input mbe-textarea"
                    rows="4"
                    value={form.description}
                    onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="General description of the exam..."
                  />
                </label>
                <label>
                  <span className="mbe-label-row">Instructions <FieldCheck valid={fieldValid.instructions} /></span>
                  <textarea
                    className="mbe-input mbe-textarea"
                    rows="4"
                    value={form.instructions}
                    onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                    placeholder="Exam instructions for students..."
                  />
                </label>
              </div>
            </div>

          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: SUBJECTS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'subjects' && (
          <section className="mbe-card mbe-selection-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
            <div className="mbe-section-heading">
              <div>
                <h2>Subjects</h2>
                <p>Choose the subject areas that will be included in this exam.</p>
              </div>
              <div className="mbe-section-badges">
                <span className="mbe-count-pill">{selectedTagIds.length} selected</span>
              </div>
            </div>

            {!programId ? <p className="mbe-empty-message">Select a program first (in the Details tab) before choosing subjects.</p> : null}
            {programId && loadingSubjects ? <p className="mbe-empty-message">Loading subjects...</p> : null}
            {programId && !loadingSubjects && subjectOptions.length === 0 ? <p className="mbe-empty-message">No subjects found for this program.</p> : null}
            {programId && !loadingSubjects && subjectOptions.length > 0 ? (() => {
              const filteredBySearch = subjectOptions.filter((tag) =>
                !subjectSearch.trim() || tag.name.toLowerCase().includes(subjectSearch.trim().toLowerCase())
              );
              const totalSubjectPages = Math.max(1, Math.ceil(filteredBySearch.length / SUBJECTS_PER_PAGE));
              const safeSubjectPage = Math.min(subjectPage, totalSubjectPages);
              const pagedSubjects = filteredBySearch.slice((safeSubjectPage - 1) * SUBJECTS_PER_PAGE, safeSubjectPage * SUBJECTS_PER_PAGE);
              return (
                <>
                  <div className="mbe-subject-search-row">
                    <input
                      className="mbe-input mbe-subject-search"
                      type="text"
                      placeholder="Search subjects..."
                      value={subjectSearch}
                      onChange={(e) => { setSubjectSearch(e.target.value); setSubjectPage(1); }}
                    />
                  </div>
                  {filteredBySearch.length === 0 ? (
                    <p className="mbe-empty-message">No subjects match your search.</p>
                  ) : (
                    <div className="mbe-tag-grid">
                      {pagedSubjects.map((tag) => (
                        <label key={tag._id} className={`mbe-tag-option ${selectedTagIds.includes(String(tag._id)) ? 'is-selected' : ''}`}>
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(String(tag._id))}
                            onChange={() => handleTagChange(String(tag._id))}
                          />
                          <span>{tag.name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <Pagination
                    currentPage={safeSubjectPage}
                    totalItems={filteredBySearch.length}
                    pageSize={SUBJECTS_PER_PAGE}
                    onPageChange={setSubjectPage}
                    itemLabel="subjects"
                    classPrefix="el"
                  />
                </>
              );
            })() : null}


          </section>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: QUESTIONS
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'questions' && (
          <>
            {/* Approved questions pool */}
            <section className="mbe-card mbe-table-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
              <div className="mbe-section-heading">
                <div>
                  <h2>Approved Questions</h2>
                  <p>Browse each approved question as a preview card, then add the best ones to your exam.</p>
                </div>
                <div className="mbe-section-badges">
                  <span className="mbe-count-pill">{selectedQuestions.length} picked</span>
                </div>
              </div>

              {!programId ? <p className="mbe-empty-message">Select a program first.</p> : null}
              {programId && selectedTagIds.length === 0 ? <p className="mbe-empty-message">Select at least one subject to show approved questions.</p> : null}
              {programId && selectedTagIds.length > 0 ? (
                <>
                  {bulkSelectedIds.size > 0 && (
                    <div className="ca-bulk-toolbar mbe-bulk-toolbar">
                      <span className="ca-bulk-count">
                        {bulkSelectedIds.size} question{bulkSelectedIds.size > 1 ? 's' : ''} selected
                      </span>
                      <div className="ca-bulk-actions">
                        {approvedQuestions.some((question) => (
                          bulkSelectedIds.has(question._id) && !selectedQuestionIds.has(String(question._id))
                        )) && (
                          <button className="ca-bulk-btn ca-bulk-btn--approve" type="button" onClick={handleBulkAddSelected}>
                            Add to exam
                          </button>
                        )}
                        {approvedQuestions.some((question) => (
                          bulkSelectedIds.has(question._id) && selectedQuestionIds.has(String(question._id))
                        )) && (
                          <button className="ca-bulk-btn ca-bulk-btn--remove" type="button" onClick={handleBulkRemoveSelected}>
                            Remove from exam
                          </button>
                        )}
                        <button className="ca-bulk-btn ca-bulk-btn--clear" type="button" onClick={() => setBulkSelectedIds(new Set())}>
                          Clear selection
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mbe-question-filters">
                    <input
                      className="mbe-input mbe-search"
                      type="text"
                      placeholder="Search approved question"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select
                      className="mbe-input mbe-filter-select"
                      value={questionFilterTagId}
                      onChange={(e) => setQuestionFilterTagId(e.target.value)}
                    >
                      <option value="">All selected subjects</option>
                      {filteredSubjectOptions.map((tag) => (
                        <option key={tag._id} value={tag._id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="mbe-input mbe-filter-select"
                      value={approvedSelectionFilter}
                      onChange={(e) => setApprovedSelectionFilter(e.target.value)}
                    >
                      <option value="all">All questions</option>
                      <option value="selected">Selected only</option>
                      <option value="unselected">Not selected yet</option>
                    </select>
                  </div>

                  <div className="mbe-question-bulk-controls">
                    <label className="mbe-select-matching">
                      <input
                        type="checkbox"
                        className="ca-checkbox"
                        checked={filteredApprovedQuestions.length > 0 && filteredApprovedQuestions.every((question) => bulkSelectedIds.has(question._id))}
                        ref={(element) => {
                          if (element) {
                            const someSelected = filteredApprovedQuestions.some((question) => bulkSelectedIds.has(question._id));
                            const allSelected = filteredApprovedQuestions.length > 0 && filteredApprovedQuestions.every((question) => bulkSelectedIds.has(question._id));
                            element.indeterminate = someSelected && !allSelected;
                          }
                        }}
                        onChange={handleToggleAllFiltered}
                        disabled={filteredApprovedQuestions.length === 0}
                      />
                      <span>
                        Select all {filteredApprovedQuestions.length} matching question{filteredApprovedQuestions.length === 1 ? '' : 's'}
                      </span>
                    </label>
                    {filteredApprovedQuestions.length > 0 && (
                      <>
                        {approvedSelectionFilter === 'selected' ? (
                          <button
                            type="button"
                            className="mbe-btn mbe-btn-ghost mbe-btn-small mbe-filter-action mbe-filter-action--danger"
                            onClick={() => setFilteredBulkModal('remove')}
                          >
                            Remove all matching
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="mbe-btn mbe-btn-ghost mbe-btn-small mbe-filter-action"
                            onClick={() => setFilteredBulkModal('add')}
                          >
                            Add all matching
                          </button>
                        )}
                      </>
                    )}
                  </div>

              {loadingQuestions ? <p className="mbe-empty-message">Loading approved questions...</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length === 0 ? <p className="mbe-empty-message">No approved questions match the selected subjects.</p> : null}
              {!loadingQuestions && filteredApprovedQuestions.length > 0 ? (() => {
                                const totalQPages = Math.max(1, Math.ceil(filteredApprovedQuestions.length / QUESTIONS_PER_PAGE));
                const safeQPage = Math.min(questionPage, totalQPages);
                const pagedQuestions = filteredApprovedQuestions.slice((safeQPage - 1) * QUESTIONS_PER_PAGE, safeQPage * QUESTIONS_PER_PAGE);

                // Group contiguous questions belonging to the same group so they render inside a single set container
                const pagedItems = [];
                let activeGroupItem = null;
                for (const q of pagedQuestions) {
                  if (!q.groupId) {
                    if (activeGroupItem) {
                      pagedItems.push(activeGroupItem);
                      activeGroupItem = null;
                    }
                    pagedItems.push({ type: 'single', question: q });
                  } else {
                    if (activeGroupItem && activeGroupItem.groupId === q.groupId) {
                      activeGroupItem.questions.push(q);
                    } else {
                      if (activeGroupItem) pagedItems.push(activeGroupItem);
                      activeGroupItem = {
                        type: 'group',
                        groupId: q.groupId,
                        questions: [q],
                      };
                    }
                  }
                }
                if (activeGroupItem) pagedItems.push(activeGroupItem);

                return (
                  <>
                    <div className="mbe-approved-stack">
                      {pagedItems.map((item) => {
                        if (item.type === 'single') {
                          const question = item.question;
                          const isSelected = selectedQuestionIds.has(String(question._id));
                          const imageCount = question.images?.length || 0;
                          const answerCount = question.answers?.length || 0;
                          const isExpanded = !!expandedQuestionIds[question._id];

                          return (
                            <article
                              key={question._id}
                              className={`mbe-question-card mbe-question-card--stack ${isSelected ? 'is-selected' : ''} ${bulkSelectedIds.has(question._id) ? 'is-bulk-selected' : ''}`}
                            >
                              <div className="mbe-question-main">
                                <label className="ca-checkbox-wrapper mbe-bulk-checkbox mbe-card-checkbox" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="ca-checkbox"
                                    checked={bulkSelectedIds.has(question._id)}
                                    onChange={(e) => handleBulkCheckbox(e, question)}
                                  />
                                </label>
                                <button
                                  type="button"
                                  className="mbe-question-copy mbe-question-toggle"
                                  onClick={() => toggleQuestionExpanded(question._id)}
                                  aria-expanded={isExpanded}
                                >
                                  <div className="mbe-question-meta-row">
                                    <span className="mbe-subject-pill">{question.tag?.name || 'No subject'}</span>
                                    <span className="mbe-meta-text">{answerCount} answers | {imageCount} images</span>
                                    {question.createdBy?.name ? (
                                      <span className="mbe-meta-text">By {question.createdBy.name}</span>
                                    ) : null}
                                    <span className={`mbe-expand-icon ${isExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
                                  </div>

                                  {!isExpanded && (
                                    <div className="mbe-question-headline mbe-question-headline--compact">
                                      {truncateText(question.description, 100)}
                                    </div>
                                  )}
                                </button>

                                <div className="mbe-question-actions">
                                  <button
                                    className={`mbe-select-btn ${isSelected ? 'is-selected' : ''}`}
                                    type="button"
                                    onClick={() => handleQuestionToggle(question)}
                                  >
                                    {isSelected ? 'Added' : 'Add'}
                                  </button>
                                  {!question.is_used_in_exam && (
                                    <button
                                      className="mbe-btn mbe-btn-ghost mbe-btn-small"
                                      type="button"
                                      onClick={() => handleReturnQuestion(question)}
                                    >
                                      Return
                                    </button>
                                  )}
                                </div>
                              </div>

                              {isExpanded ? (
                                <div className="mbe-question-details">
                                  <section className="mbe-question-panel">
                                    <p className="mbe-panel-label">Question</p>
                                    <p className="mbe-question-description">{question.description || 'No description provided.'}</p>
                                  </section>

                                  {imageCount > 0 ? (
                                    <section className="mbe-question-panel">
                                      <p className="mbe-panel-label">Images</p>
                                      <div className="mbe-preview-images">
                                        {question.images.map((image, index) => (
                                          <button
                                            key={index}
                                            type="button"
                                            className="mbe-preview-image-link"
                                            onClick={() => setFullscreenImage(resolveImageUrl(image))}
                                          >
                                            <AuthImage
                                              className="mbe-preview-image"
                                              src={resolveImageUrl(image)}
                                              alt={`Question image ${index + 1}`}
                                            />
                                          </button>
                                        ))}
                                      </div>
                                    </section>
                                  ) : null}

                                  <section className="mbe-question-panel">
                                    <p className="mbe-panel-label">Answers</p>
                                    <ul className="mbe-answer-list mbe-answer-list--cards">
                                      {(question.answers || []).map((answer) => (
                                        <li key={answer._id || answer.text} className={answer.isCorrect ? 'is-correct' : ''}>
                                          <span className="mbe-answer-label">{answer.optionLabel}</span>
                                          <span>
                                            {answer.text}
                                            <AnswerImage src={answer.image} alt={`Answer ${answer.optionLabel} image`} onZoom={setFullscreenImage} className="answer-image--block" />
                                          </span>
                                          {answer.isCorrect ? <strong>Correct</strong> : null}
                                        </li>
                                      ))}
                                    </ul>
                                  </section>

                                  {question.rationalization && (
                                    <section className="mbe-question-panel">
                                      <p className="mbe-panel-label">Rationalization</p>
                                      <p className="mbe-question-description">{question.rationalization}</p>
                                    </section>
                                  )}
                                </div>
                              ) : null}
                            </article>
                          );
                        }

                        // Group item
                        const firstQ = item.questions[0];
                        const groupSiblings = approvedQuestions.filter(q => q.groupId === item.groupId);
                        const groupTitle = firstQ.groupContext?.trim() ? truncateText(firstQ.groupContext.trim(), 90) : `Question Set (${groupSiblings.length} questions)`;
                        const isGroupCollapsed = collapsedGroups.has(item.groupId);
                        const isGroupSelected = groupSiblings.length > 0 && groupSiblings.every(q => selectedQuestionIds.has(String(q._id)));
                        const isAllGroupBulkSelected = groupSiblings.length > 0 && groupSiblings.every(q => bulkSelectedIds.has(q._id));
                        const isSomeGroupBulkSelected = groupSiblings.some(q => bulkSelectedIds.has(q._id));

                        return (
                          <div key={item.groupId} className={`mbe-group-set-box ${isGroupCollapsed ? 'is-collapsed' : ''}`}>
                            <div
                              className={`mbe-group-header-card ${isGroupCollapsed ? 'is-collapsed' : ''}`}
                              onClick={() => setCollapsedGroups(prev => {
                                const next = new Set(prev);
                                if (next.has(item.groupId)) next.delete(item.groupId);
                                else next.add(item.groupId);
                                return next;
                              })}
                              title="Click to collapse / expand question set"
                              style={{ cursor: 'pointer' }}
                            >
                              <div className="mbe-group-header-left">
                                <label className="ca-checkbox-wrapper mbe-bulk-checkbox mbe-group-header-checkbox" onClick={e => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    className="ca-checkbox"
                                    checked={isAllGroupBulkSelected}
                                    ref={el => { if (el) el.indeterminate = isSomeGroupBulkSelected && !isAllGroupBulkSelected; }}
                                    onChange={(e) => handleBulkCheckbox(e, firstQ)}
                                  />
                                </label>
                                <span className="mbe-group-header-icon" aria-hidden="true">
                                  <svg viewBox="0 0 24 24" fill="none">
                                    <rect x="4" y="5" width="16" height="5" rx="1.5" />
                                    <rect x="4" y="14" width="16" height="5" rx="1.5" />
                                    <path d="M8 7.5h8M8 16.5h8" />
                                  </svg>
                                </span>
                                <span className="mbe-group-header-title">{groupTitle}</span>
                                <span className="mbe-group-header-badge">{groupSiblings.length} questions</span>
                              </div>
                              <div className="mbe-group-header-actions">
                                <button
                                  type="button"
                                  className={`mbe-select-btn mbe-select-btn--group ${isGroupSelected ? 'is-selected' : ''}`}
                                  onClick={(e) => { e.stopPropagation(); handleQuestionToggle(firstQ); }}
                                >
                                  {isGroupSelected ? 'Remove Set' : 'Add Set'}
                                </button>
                              </div>
                            </div>

                            {!isGroupCollapsed && (
                              <div className="mbe-group-set-body">
                                {item.questions.map((question) => {
                                  const isSelected = selectedQuestionIds.has(String(question._id));
                                  const imageCount = question.images?.length || 0;
                                  const answerCount = question.answers?.length || 0;
                                  const isExpanded = !!expandedQuestionIds[question._id];

                                  return (
                                    <article
                                      key={question._id}
                                      className={`mbe-question-card mbe-question-card--stack ${isSelected ? 'is-selected' : ''} ${bulkSelectedIds.has(question._id) ? 'is-bulk-selected' : ''} is-grouped`}
                                    >
                                      <div className="mbe-question-main">
                                        <button
                                          type="button"
                                          className="mbe-question-copy mbe-question-toggle"
                                          onClick={() => toggleQuestionExpanded(question._id)}
                                          aria-expanded={isExpanded}
                                        >
                                          <div className="mbe-question-meta-row">
                                            <span className="mbe-subject-pill">{question.tag?.name || 'No subject'}</span>
                                            <span className="mbe-part-badge">Part {(question.groupOrder ?? 0) + 1}</span>
                                            <span className="mbe-meta-text">{answerCount} answers | {imageCount} images</span>
                                            {question.createdBy?.name ? (
                                              <span className="mbe-meta-text">By {question.createdBy.name}</span>
                                            ) : null}
                                            <span className={`mbe-expand-icon ${isExpanded ? 'is-open' : ''}`} aria-hidden="true">▾</span>
                                          </div>

                                          {!isExpanded && (
                                            <div className="mbe-question-headline mbe-question-headline--compact">
                                              {truncateText(question.description, 100)}
                                            </div>
                                          )}
                                        </button>

                                        <div className="mbe-question-actions">
                                          {!question.is_used_in_exam && (
                                            <button
                                              className="mbe-btn mbe-btn-ghost mbe-btn-small"
                                              type="button"
                                              onClick={() => handleReturnQuestion(question)}
                                            >
                                              Return
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {isExpanded ? (
                                        <div className="mbe-question-details">
                                          <section className="mbe-question-panel">
                                            <p className="mbe-panel-label">Question</p>
                                            <p className="mbe-question-description">{question.description || 'No description provided.'}</p>
                                          </section>

                                          {imageCount > 0 ? (
                                            <section className="mbe-question-panel">
                                              <p className="mbe-panel-label">Images</p>
                                              <div className="mbe-preview-images">
                                                {question.images.map((image, index) => (
                                                  <button
                                                    key={index}
                                                    type="button"
                                                    className="mbe-preview-image-link"
                                                    onClick={() => setFullscreenImage(resolveImageUrl(image))}
                                                  >
                                                    <AuthImage
                                                      className="mbe-preview-image"
                                                      src={resolveImageUrl(image)}
                                                      alt={`Question image ${index + 1}`}
                                                    />
                                                  </button>
                                                ))}
                                              </div>
                                            </section>
                                          ) : null}

                                          <section className="mbe-question-panel">
                                            <p className="mbe-panel-label">Answers</p>
                                            <ul className="mbe-answer-list mbe-answer-list--cards">
                                              {(question.answers || []).map((answer) => (
                                                <li key={answer._id || answer.text} className={answer.isCorrect ? 'is-correct' : ''}>
                                                  <span className="mbe-answer-label">{answer.optionLabel}</span>
                                                  <span>
                                                    {answer.text}
                                                    <AnswerImage src={answer.image} alt={`Answer ${answer.optionLabel} image`} onZoom={setFullscreenImage} className="answer-image--block" />
                                                  </span>
                                                  {answer.isCorrect ? <strong>Correct</strong> : null}
                                                </li>
                                              ))}
                                            </ul>
                                          </section>

                                          {question.rationalization && (
                                            <section className="mbe-question-panel">
                                              <p className="mbe-panel-label">Rationalization</p>
                                              <p className="mbe-question-description">{question.rationalization}</p>
                                            </section>
                                          )}
                                        </div>
                                      ) : null}
                                    </article>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                        <Pagination
                          currentPage={safeQPage}
                          totalItems={filteredApprovedQuestions.length}
                          pageSize={QUESTIONS_PER_PAGE}
                          onPageChange={setQuestionPage}
                          itemLabel="questions"
                          classPrefix="el"
                        />
                      </>
                    );
                  })() : null}
                </>
              ) : null}
            </section>

            {/* Selected questions table */}
            <section className="mbe-card mbe-table-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
              <div className="mbe-section-heading">
                <div>
                  <h2>Selected Questions</h2>
                  <p>Questions currently included in this mock board exam, shown as a clean audit view.</p>
                </div>
                <div className="mbe-section-badges">
                  <span className="mbe-count-pill">{selectedQuestions.length} total</span>
                </div>
              </div>

              {selectedQuestions.length === 0 ? <p className="mbe-empty-message">No questions selected yet.</p> : null}
              {selectedQuestions.length > 0 ? (
                <>
                  <div className="mbe-toolbar mbe-toolbar--selected">
                    <select
                      className="mbe-input mbe-filter-select"
                      value={selectedQuestionFilterTagId}
                      onChange={(e) => setSelectedQuestionFilterTagId(e.target.value)}
                    >
                      <option value="">All selected subjects</option>
                      {filteredSubjectOptions.map((tag) => (
                        <option key={tag._id} value={tag._id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mbe-table-wrap">
                    <table className="mbe-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Subject</th>
                          <th>Choices</th>
                          <th>Images</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSelectedQuestions.length > 0 ? (
                          filteredSelectedQuestions.map((question, index) => (
                            <tr key={question._id}>
                              <td>{index + 1}</td>
                              <td>
                                <span className="mbe-subject-pill">{question.tag?.name || '-'}</span>
                              </td>
                              <td>{question.answers?.length || 0}</td>
                              <td>{question.images?.length || 0}</td>
                              <td>
                                <button className="mbe-btn mbe-btn-danger mbe-btn-small" type="button" onClick={() => handleQuestionToggle(question)}>
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="6" className="mbe-table-empty">No selected questions match this subject.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>


          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB: REVIEW & SAVE
        ════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'review' && (
          <section className="mbe-card mbe-form-card" data-audience={isAlumniExam ? 'alumni' : 'student'}>
            <div className="mbe-section-heading">
              <div>
                <h2>Review & Save</h2>
                <p>Review your exam details before saving.</p>
              </div>
            </div>

            <div className="mbe-review-grid">

              {/* Audience */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Exam Type</p>
                <span className={`mbe-audience-pill mbe-audience-pill--${isAlumniExam ? 'alumni' : 'student'} mbe-audience-pill--lg`}>
                  {isAlumniExam ? 'Alumni Exam' : 'Student Exam'}
                </span>
              </div>

              {/* Name */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Exam Name</p>
                <p className="mbe-review-value">{form.name || <em className="mbe-review-empty">Not set</em>}</p>
              </div>

              {/* Program */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Program</p>
                <p className="mbe-review-value">
                  {selectedProgram ? `${selectedProgram.name}${selectedProgram.code ? ` (${selectedProgram.code})` : ''}` : <em className="mbe-review-empty">Not selected</em>}
                </p>
              </div>

              {/* Status */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Status</p>
                <span className={`mbe-status-pill mbe-status-pill--${form.status}`}>{getStatusLabel(form.status)}</span>
              </div>

              {/* Schedule */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Schedule</p>
                <p className="mbe-review-value">
                  {form.startDateTime && form.endDateTime
                    ? <>{new Date(form.startDateTime).toLocaleString()} → {new Date(form.endDateTime).toLocaleString()}{computedDuration && !computedDuration.includes('Invalid') ? <span className="mbe-review-duration"> ({computedDuration})</span> : null}</>
                    : <em className="mbe-review-empty">No schedule set</em>}
                </p>
              </div>

              {/* Passing threshold */}
              <div className="mbe-review-block">
                <p className="mbe-review-label">Passing Threshold</p>
                <p className="mbe-review-value">{form.passingThreshold}%</p>
              </div>

              {/* Timer (alumni only) */}
              {isAlumniExam && (
                <div className="mbe-review-block">
                  <p className="mbe-review-label">Attempt Timer</p>
                  <p className="mbe-review-value">
                    {form.isTimed
                      ? `Timed — ${formatDurationFromMinutes(form.timeLimitMinutes) || `${form.timeLimitMinutes} min`} per attempt`
                      : 'Untimed'}
                  </p>
                </div>
              )}

              {/* Subjects */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Subjects ({selectedTagIds.length})</p>
                {selectedTagIds.length === 0
                  ? <em className="mbe-review-empty">No subjects selected</em>
                  : (
                    <div className="mbe-review-tag-list">
                      {filteredSubjectOptions.map(tag => (
                        <span key={tag._id} className="mbe-subject-pill">{tag.name}</span>
                      ))}
                    </div>
                  )}
              </div>

              {/* Questions breakdown */}
              <div className="mbe-review-block mbe-review-block--full">
                <p className="mbe-review-label">Questions ({selectedQuestions.length} total)</p>
                {selectedQuestions.length === 0
                  ? <em className="mbe-review-empty">No questions selected</em>
                  : (
                    <div className="mbe-review-subject-breakdown">
                      {Object.entries(questionsBySubject).map(([name, count]) => (
                        <div key={name} className="mbe-review-subject-row">
                          <span className="mbe-subject-pill">{name}</span>
                          <span className="mbe-review-q-count">{count} question{count !== 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

            </div>

            <div className="mbe-tab-footer">
              <div className="mbe-review-actions">
                {editingExamId ? (
                  <button className="mbe-btn mbe-btn-ghost" type="button" onClick={onClearEditing}>
                    Cancel Edit
                  </button>
                ) : null}
                <button className="mbe-btn mbe-btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : editingExamId ? 'Update Mock Board Exam' : 'Create Mock Board Exam'}
                </button>
              </div>
            </div>
          </section>
        )}

      </form>

      {/* ── Fullscreen image overlay ──────────────────────────────────────── */}
      {fullscreenImage ? (
        <div className="mbe-image-overlay" onClick={() => setFullscreenImage(null)}>
          <div className="mbe-image-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="mbe-image-close"
              onClick={() => setFullscreenImage(null)}
            >
              Close
            </button>
            <AuthImage src={fullscreenImage} alt="Question preview" className="mbe-image-full" />
          </div>
        </div>
      ) : null}

      {/* ── Feedback modal ────────────────────────────────────────────────── */}
      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      {/* ── Return question modal ─────────────────────────────────────────── */}
      <Modal
        open={!!returnModal}
        onClose={() => {
          if (returnSubmitting) return;
          setReturnModal(null);
          setReturnNote('');
          setReturnError('');
        }}
        title="Return Question with Feedback"
        size="compact"
        bodyClassName="custom-modal-body--compact"
      >
        <div className="modal-confirmation">
          <div className="modal-form-group">
            <label>Feedback (required)</label>
            <textarea
              className="modal-textarea"
              rows="5"
              value={returnNote}
              onChange={(e) => {
                setReturnNote(e.target.value);
                if (returnError) setReturnError('');
              }}
              placeholder="Explain why this question is being returned..."
              autoFocus
            />
          </div>
        </div>

        {returnError ? <p className="modal-error">{returnError}</p> : null}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn-cancel"
            onClick={() => {
              setReturnModal(null);
              setReturnNote('');
              setReturnError('');
            }}
            disabled={returnSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-btn-primary"
            onClick={submitReturnQuestion}
            disabled={returnSubmitting || !returnNote.trim()}
          >
            {returnSubmitting ? 'Submitting...' : 'Return Question'}
          </button>
        </div>
      </Modal>

      {/* ── Add/Remove All Filtered confirmation modal ────────────────────── */}
      {filteredBulkModal && (
        <Modal
          open={!!filteredBulkModal}
          onClose={() => setFilteredBulkModal(null)}
          title={
            filteredBulkModal === 'remove'
              ? 'Remove All Filtered'
              : getFilterDescription() ? 'Add All Filtered' : 'Add All Questions'
          }
          size="compact"
          bodyClassName="custom-modal-body--compact"
        >
          <div className="modal-confirmation">
            <div className="modal-confirmation-message">
              {filteredBulkModal === 'remove' ? 'Remove' : 'Add'}{' '}
              <strong>{filteredApprovedQuestions.length}</strong> question{filteredApprovedQuestions.length !== 1 ? 's' : ''}{' '}
              {filteredBulkModal === 'remove' ? 'from' : 'to'} exam?
            </div>
            <div className="modal-confirmation-extra">
              {filteredBulkModal === 'remove' ? (
                <>This will remove all <strong>{filteredApprovedQuestions.length}</strong> currently visible selected questions{getFilterDescription() ? <> matching <em>{getFilterDescription()}</em></> : null} across all pages.</>
              ) : getFilterDescription() ? (
                <>This will add all <strong>{filteredApprovedQuestions.length}</strong> questions matching <em>{getFilterDescription()}</em> across all pages.</>
              ) : (
                <>This will add all <strong>{filteredApprovedQuestions.length}</strong> available questions across all pages.</>
              )}
            </div>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="modal-btn-cancel"
              onClick={() => setFilteredBulkModal(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={filteredBulkModal === 'remove' ? 'modal-btn-danger' : 'modal-btn-primary'}
              onClick={filteredBulkModal === 'remove' ? handleConfirmRemoveFiltered : handleConfirmAddFiltered}
            >
              {filteredBulkModal === 'remove' ? 'Confirm & Remove' : 'Confirm & Add'}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
