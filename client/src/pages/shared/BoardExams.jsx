import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import AuthImage from '../../components/AuthImage.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import ImportReviewBubbles from '../../components/ImportReviewBubbles.jsx';
import QuestionDetailPanels from '../../components/QuestionDetailPanels.jsx';
import { stripHtml } from '../../components/SafeHtml.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { groupQuestionsForDisplay } from '../../lib/groupQuestionsForDisplay.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import { Modal } from '../../components/Modal.jsx';
import ExamCalendar from '../../components/ExamCalendar.jsx';
import Pagination from '../../components/Pagination.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import Table from '../../components/Table.jsx';
import ActionMenu from '../../components/ActionMenu.jsx';
import { AudienceIcon } from '../../components/CalendarIcons.jsx';
import '../../styles/shared/BoardExams.css';

const BASE = import.meta.env.VITE_API_URL;

// Exam, Program, Created, Subjects, Schedule, Activity, Status, Actions
const EXAM_TABLE_COLUMN_WIDTHS = [210, 140, 130, 160, 200, 130, 130, 170];

// Subjects listed in a table row before the rest collapse into "+N more"
const TABLE_SUBJECT_LIMIT = 2;

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'finished', label: 'Finished' },
  { value: 'archived', label: 'Archived' },
];

// Dot tone for the table status cell (.ui-table-status in Table.css)
const EXAM_STATUS_TONES = {
  draft: 'hollow',
  published: 'blue',
  ongoing: 'live',
  active: 'live',
  finished: 'green',
  archived: 'muted',
};

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(date) {
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

// "45 min", "2 hrs", "1 hr 30 min"
function formatShortDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins} min`;
  const hourLabel = `${hours} hr${hours === 1 ? '' : 's'}`;
  return mins ? `${hourLabel} ${mins} min` : hourLabel;
}

// Student exams show how long the exam runs; alumni exams show the limit per attempt
function formatScheduleLength(exam) {
  if ((exam.targetAudience || 'student') === 'alumni') {
    return exam.isTimed ? `${formatShortDuration(exam.durationMinutes)} per attempt` : 'Untimed attempts';
  }
  return exam.durationMinutes ? formatShortDuration(exam.durationMinutes) : '';
}

function renderScheduleCell(exam) {
  if (!exam.startDateTime) return <span className="ambe-muted">Not scheduled</span>;
  const start = new Date(exam.startDateTime);
  const end = exam.endDateTime ? new Date(exam.endDateTime) : null;
  const length = formatScheduleLength(exam);
  const fullRange = `${formatDateTime(start)} – ${end ? formatDateTime(end) : 'no end set'}`;

  // Exam windows that span several days show the dates only; the tooltip has the times
  if (end && start.toDateString() !== end.toDateString()) {
    const startLabel = start.getFullYear() === end.getFullYear()
      ? start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
      : formatDate(start);
    return (
      <div className="ambe-stack" title={fullRange}>
        <span className="ambe-stack-main ambe-nowrap">{startLabel} – {formatDate(end)}</span>
        {length ? <span className="ambe-stack-sub">{length}</span> : null}
      </div>
    );
  }

  return (
    <div className="ambe-stack" title={fullRange}>
      <span className="ambe-stack-main ambe-nowrap">{formatDate(start)}</span>
      <span className="ambe-stack-sub">
        <span className="ambe-nowrap">{formatTime(start)}{end ? ` – ${formatTime(end)}` : ''}</span>
        {length ? <>{' · '}<span className="ambe-nowrap">{length}</span></> : null}
      </span>
    </div>
  );
}

function formatDuration(minutes) {
  if (minutes === null || minutes === undefined || minutes === '') return '-';
  const total = Number(minutes) || 0;
  return `${total} minute${total === 1 ? '' : 's'}`;
}

function formatExamDuration(exam) {
  if ((exam?.targetAudience || 'student') === 'alumni' && !exam?.isTimed) return 'Untimed';
  return formatDuration(exam?.durationMinutes);
}

function formatCount(value, singular, plural = `${singular}s`) {
  const total = Number(value) || 0;
  return `${total} ${total === 1 ? singular : plural}`;
}

function canScheduleResultsRelease(exam) {
  if ((exam.targetAudience || 'student') === 'alumni') return false;
  if (exam.status !== 'finished') return false;
  // Release time passed — students can see results; no more changes
  if (exam.resultsReleased === true) return false;
  // Dean must be able to set a release date first (even if analytics were computed early)
  if (!exam.resultsReleaseDate) return true;
  // After upload, lock the release schedule
  if (exam.resultsUploaded === true || exam.computationStatus === 'computed') return false;
  // Scheduled but not uploaded yet — allow reschedule
  return true;
}

function sameExamId(a, b) {
  return String(a) === String(b);
}

function subjectKey(tag) {
  return String(tag?._id || tag?.name || '');
}

function toOneLine(text) {
  return stripHtml(String(text || '').replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// Number, subject and counts shown at the top of a question card
function QuestionMeta({ question, questionNumber, children }) {
  return (
    <span className="ambe-question-meta-row">
      <span className="ambe-question-number">Question {questionNumber}</span>
      <span className="ambe-subject-pill">{question.tag?.name || 'No subject'}</span>
      <span className="ambe-meta-text">
        {formatCount(question.answers?.length, 'answer')} | {formatCount(question.images?.length, 'image')}
      </span>
      {children}
    </span>
  );
}

function renderConflictMessage(err) {
  const conflicts = err?.data?.conflicts || [];

  if (conflicts.length === 0) {
    return err.message || 'Failed to publish exam.';
  }

  return (
    <div className="ambe-conflict-message">
      <p>
        This exam overlaps with an existing exam schedule. Please adjust the schedule before publishing.
      </p>
      <div className="ambe-conflict-list">
        {conflicts.map((conflict) => (
          <article key={conflict._id || conflict.name} className="ambe-conflict-item">
            <strong>{conflict.name}</strong>
            <span>{conflict.program?.name || conflict.program?.code || 'Program not specified'}</span>
            <span>{formatDateTime(conflict.startDateTime)} - {formatDateTime(conflict.endDateTime)}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function AvailableMockBoardExams({ refreshKey, onEditExam, me }) {
  const [exams, setExams] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState(null);
  // Exam details: the one open question ('question:<id>') or question set ('group:<groupId>')
  const [openDropdownKeys, setOpenDropdownKeys] = useState(() => new Set());
  // Exam details: the question shown in each open set, by groupId
  const [activeGroupIdx, setActiveGroupIdx] = useState({});
  const [questionTypeFilter, setQuestionTypeFilter] = useState('all');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [schedulingExamId, setSchedulingExamId] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedAudience, setSelectedAudience] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  useEffect(() => {
    if (!selectedExam) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [Boolean(selectedExam)]);

  function triggerCalendarRefresh() {
    setCalendarRefreshKey((prev) => prev + 1);
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedStatus('');
    setSelectedAudience('');
    setSelectedSubject('');
  }

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedProgramId, selectedStatus, selectedAudience, selectedSubject]);

  useEffect(() => {
    async function fetchExams() {
      setLoading(true);
      try {
        const endpoint = (me?.role === 'student' || me?.role === 'alumni')
          ? '/api/mock-board-exams/public'
          : '/api/mock-board-exams';
        const data = await apiAuth(`${BASE}${endpoint}`);
        setExams(data.exams || []);
      } catch (err) {
        console.error('Failed to load mock board exams:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchExams();
  }, [refreshKey, me?.role]);

  useEffect(() => {
    async function fetchPrograms() {
      if ((me?.role !== 'dean' && me?.role !== 'program_chair') || !me?.department) return;

      try {
        const data = await apiAuth(`${BASE}/api/catalog/programs`);
        const deptId = me.department?._id || me.department;
        const deptPrograms = (data.programs || []).filter((program) => {
          const programDept = program.department?._id || program.department;
          return String(programDept) === String(deptId);
        });

        setPrograms(deptPrograms);
        if (me?.role === 'program_chair') {
          const chairProgramId = me?.program?._id || me?.program;
          setSelectedProgramId(chairProgramId ? String(chairProgramId) : '');
        } else {
          setSelectedProgramId((prev) => {
            if (prev && deptPrograms.some((program) => String(program._id) === String(prev))) return prev;
            return 'all';
          });
        }
      } catch (err) {
        console.error('Failed to load programs:', err);
      }
    }

    fetchPrograms();
  }, [me]);

  useEffect(() => {
    setOpenDropdownKeys(new Set());
    setActiveGroupIdx({});
    setQuestionTypeFilter('all');
  }, [selectedExam?._id]);



  function closeConfirmationModal() {
    if (modalBusy) return;
    setConfirmationModal(null);
  }

  function closeFeedbackModal() {
    const nextAction = feedbackModal?.onClose;
    setFeedbackModal(null);
    nextAction?.();
  }

  function updateExamStatus(examId, status) {
    setExams((prev) => prev.map((exam) => (
      exam._id === examId ? { ...exam, status } : exam
    )));

    if (selectedExam?._id === examId) {
      setSelectedExam((prev) => (prev ? { ...prev, status } : prev));
    }

    triggerCalendarRefresh();
  }

  function closeExamDetails() {
    if (fullscreenImage) {
      setFullscreenImage(null);
      return;
    }
    setSelectedExam(null);
    setOpenDropdownKeys(new Set());
  }

  // Keep each question or question set's expanded state independent.
  function toggleQuestionDropdown(key) {
    setOpenDropdownKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleDelete(exam) {
    setConfirmationModal({
      type: 'delete',
      exam,
      title: 'Delete Archived Exam',
      message: (
        <p style={{ margin: 0 }}>
          Permanently delete <strong>{exam.name}</strong>?
        </p>
      ),
      confirmLabel: 'Delete Exam',
      confirmVariant: 'danger',
    });
  }

  async function confirmDelete(exam) {
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}`, {
        method: 'DELETE',
      });
      setExams((prev) => prev.filter((item) => item._id !== exam._id));
      if (selectedExam?._id === exam._id) setSelectedExam(null);
      setFeedbackModal({
        title: 'Exam Deleted',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> was removed permanently.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Delete Failed',
        tone: 'danger',
        message: err.message || 'Failed to delete mock board exam.',
      });
    }
  }

  function handleArchive(exam) {
    setConfirmationModal({
      type: 'archive',
      exam,
      title: 'Archive Exam',
      message: (
        <p style={{ margin: 0 }}>
          Archive <strong>{exam.name}</strong>? This will move it out of the active list.
        </p>
      ),
      confirmLabel: 'Archive Exam',
      confirmVariant: 'danger',
    });
  }

  function handleCopy(exam) {
    setConfirmationModal({
      type: 'copy',
      exam,
      title: 'Create Copy of Exam',
      message: (
        <p style={{ margin: 0 }}>
          Create a new draft copy of <strong>{exam.name}</strong>?
        </p>
      ),
      confirmLabel: 'Create Draft Copy',
      confirmVariant: 'primary',
    });
  }

  async function confirmCopy(exam) {
    try {
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}/copy`, { method: 'POST' });
      if (data.exam) setExams((prev) => [data.exam, ...prev]);
      setFeedbackModal({
        title: 'Draft Copy Created',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            A new draft was created from <strong>{exam.name}</strong>.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Copy Failed',
        tone: 'danger',
        message: err.message || 'Failed to create a draft copy.',
      });
    }
  }

  async function handleEndEarly(exam) {
    try {
      const stats = await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}/end-early-stats`);
      setConfirmationModal({
        type: 'endEarly',
        exam,
        title: 'End Exam Early',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{stats.completed}/{stats.total}</strong> {stats.programCode} students have answered this exam. End exam early?
          </p>
        ),
        confirmLabel: 'End Exam Now',
        confirmVariant: 'danger',
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Failed to fetch stats',
        tone: 'danger',
        message: err.message || 'Could not fetch exam progress.',
      });
    }
  }

  async function confirmEndEarly(exam) {
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}/end-early`, { method: 'POST' });
      updateExamStatus(exam._id, 'finished');
      setFeedbackModal({
        title: 'Exam Ended',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> has been ended successfully. Any in-progress attempts have been auto-submitted.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Action Failed',
        tone: 'danger',
        message: err.message || 'Failed to end exam early.',
      });
    }
  }

  async function confirmArchive(exam) {
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}/archive`, { method: 'PATCH' });
      updateExamStatus(exam._id, 'archived');
      setFeedbackModal({
        title: 'Exam Archived',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> is now archived.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Archive Failed',
        tone: 'danger',
        message: err.message || 'Failed to archive exam.',
      });
    }
  }

  function handlePublish(exam) {
    const audienceLabel = exam.targetAudience === 'alumni' ? 'alumni' : 'students';
    setConfirmationModal({
      type: 'publish',
      exam,
      title: 'Publish Draft Exam',
      message: (
        <p style={{ margin: 0 }}>
          Publish <strong>{exam.name}</strong>? This will make it available to {audienceLabel}.
        </p>
      ),
      confirmLabel: 'Publish Exam',
      confirmVariant: 'primary',
    });
  }

  async function confirmPublish(exam) {
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}`, {
        method: 'PATCH',
        body: {
          status: 'published',
          targetAudience: exam.targetAudience || 'student',
        },
      });
      updateExamStatus(exam._id, 'published');
      setFeedbackModal({
        title: 'Exam Published',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> is now live for {exam.targetAudience === 'alumni' ? 'alumni' : 'students'}.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Publish Failed',
        tone: 'danger',
        message: err.status === 409 ? renderConflictMessage(err) : (err.message || 'Failed to publish exam.'),
      });
    }
  }

  async function handleScheduleResults(examId, date) {
    const exam = exams.find((item) => sameExamId(item._id, examId));

    try {
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${examId}/release-results`, {
        method: 'PATCH',
        body: { resultsReleaseDate: date },
      });

      const savedReleaseDate = data.resultsReleaseDate || date;

      setExams((prev) => prev.map((item) => (
        sameExamId(item._id, examId)
          ? {
            ...item,
            resultsReleaseDate: savedReleaseDate,
            resultsReleased: false,
            resultsUploaded: item.resultsUploaded,
          }
          : item
      )));

      if (selectedExam && sameExamId(selectedExam._id, examId)) {
        setSelectedExam((prev) => (prev ? { ...prev, resultsReleaseDate: savedReleaseDate } : prev));
      }

      setSchedulingExamId(null);
      setFeedbackModal({
        title: 'Results Release Scheduled',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            {exam?.name ? <><strong>{exam.name}</strong> will release results on </> : 'Results will be released on '}
            <strong>{formatDateTime(date)}</strong>.
          </p>
        ),
      });
    } catch (err) {
      // Unmount the picker so "Schedule results" can open it again for this exam
      setSchedulingExamId(null);
      setFeedbackModal({
        title: 'Scheduling Failed',
        tone: 'danger',
        message: err.message || 'Failed to schedule results release.',
      });
    }
  }

  function handleEdit(exam) {
    if (['ongoing', 'finished', 'archived'].includes(exam.status)) {
      setFeedbackModal({
        title: 'Editing Disabled',
        tone: 'warning',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> is {exam.status} and can no longer be edited.
          </p>
        ),
      });
      return;
    }

    onEditExam(exam._id);
  }

  async function handleConfirmAction() {
    if (!confirmationModal?.exam) return;

    const { type, exam } = confirmationModal;
    setModalBusy(true);
    setConfirmationModal(null);

    try {
      if (type === 'delete') {
        await confirmDelete(exam);
      } else if (type === 'archive') {
        await confirmArchive(exam);
      } else if (type === 'publish') {
        await confirmPublish(exam);
      } else if (type === 'copy') {
        await confirmCopy(exam);
      } else if (type === 'endEarly') {
        await confirmEndEarly(exam);
      }
    } finally {
      setModalBusy(false);
    }
  }

  async function handleView(examId) {
    if (selectedExam?._id === examId) {
      closeExamDetails();
      return;
    }

    try {
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
      setFullscreenImage(null);
      setSelectedExam(data.exam || null);
    } catch (err) {
      setFeedbackModal({
        title: 'Unable to Load Exam Details',
        tone: 'danger',
        message: err.message || 'Failed to load exam details.',
      });
    }
  }

  function getMenuItems(exam) {
    const isAlumni = (exam.targetAudience || 'student') === 'alumni';
    const normal = [];
    const danger = [];

    if (exam.status === 'draft') {
      normal.push({
        key: 'view',
        label: selectedExam?._id === exam._id ? 'Hide details' : 'View details',
        onClick: () => handleView(exam._id),
      });
    }

    if (exam.status === 'draft' || exam.status === 'published') {
      normal.push({ key: 'edit', label: 'Edit', onClick: () => handleEdit(exam) });
    }

    if (exam.status !== 'ongoing' && exam.status !== 'finished' && exam.status !== 'archived') {
      normal.push({ key: 'testRun', label: 'Test run', onClick: () => onEditExam(exam._id, 'testRun') });
    }

    if (canScheduleResultsRelease(exam)) {
      normal.push({
        key: 'schedule',
        label: exam.resultsReleaseDate ? 'Reschedule results' : 'Schedule results',
        onClick: () => setSchedulingExamId(exam._id),
      });
    }

    normal.push({ key: 'copy', label: 'Create copy', onClick: () => handleCopy(exam) });

    if (exam.status === 'finished' || (isAlumni && exam.status === 'published')) {
      normal.push({ key: 'archive', label: 'Archive', onClick: () => handleArchive(exam) });
    }

    if (exam.status === 'ongoing') {
      danger.push({ key: 'endEarly', label: 'End exam early', danger: true, onClick: () => handleEndEarly(exam) });
    }

    if (exam.status === 'archived' || exam.status === 'draft') {
      danger.push({ key: 'delete', label: 'Delete exam', danger: true, onClick: () => handleDelete(exam) });
    }

    if (normal.length > 0 && danger.length > 0) {
      return [...normal, { key: 'divider', divider: true }, ...danger];
    }
    return [...normal, ...danger];
  }



  const selectedExamQuestions = selectedExam?.questions || [];
  const selectedExamSubjects = selectedExam?.subjectTags || [];

  // Single questions and question sets in exam order, numbered as in the exam
  const selectedExamItems = useMemo(() => (
    groupQuestionsForDisplay((selectedExam?.questions || []).map((question) => organizeQuestionAnswers(question)))
  ), [selectedExam?.questions]);

  const questionTypeCounts = useMemo(() => {
    const questions = selectedExam?.questions || [];
    const group = questions.filter((question) => question.groupId).length;
    return { all: questions.length, single: questions.length - group, group };
  }, [selectedExam?.questions]);

  const visibleQuestionItems = questionTypeFilter === 'all'
    ? selectedExamItems
    : selectedExamItems.filter((item) => (item.type === 'group') === (questionTypeFilter === 'group'));

  const programExams = useMemo(() => {
    if (
      (me?.role === 'dean' || me?.role === 'program_chair') &&
      selectedProgramId &&
      selectedProgramId !== 'all'
    ) {
      return exams.filter((exam) =>
        String(exam.program?._id || exam.program) === String(selectedProgramId)
      );
    }
    return exams;
  }, [exams, me?.role, selectedProgramId]);

  const subjectOptions = useMemo(() => {
    const byKey = new Map();
    programExams.forEach((exam) => {
      (exam.subjectTags || []).forEach((tag) => {
        const key = subjectKey(tag);
        if (key && !byKey.has(key)) byKey.set(key, tag.name);
      });
    });
    return Array.from(byKey, ([id, name]) => ({ id, name }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
  }, [programExams]);

  useEffect(() => {
    if (selectedSubject && !subjectOptions.some((option) => option.id === selectedSubject)) {
      setSelectedSubject('');
    }
  }, [subjectOptions, selectedSubject]);

  const filteredExceptStatus = useMemo(() => {
    let filtered = programExams;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((exam) => exam.name?.toLowerCase().includes(q));
    }
    if (selectedAudience) {
      filtered = filtered.filter((exam) => (exam.targetAudience || 'student') === selectedAudience);
    }
    if (selectedSubject) {
      filtered = filtered.filter((exam) =>
        (exam.subjectTags || []).some((tag) => subjectKey(tag) === selectedSubject)
      );
    }
    return filtered;
  }, [programExams, searchQuery, selectedAudience, selectedSubject]);

  const statusCounts = useMemo(() => {
    const counts = { all: filteredExceptStatus.length };
    filteredExceptStatus.forEach((exam) => {
      counts[exam.status] = (counts[exam.status] || 0) + 1;
    });
    return counts;
  }, [filteredExceptStatus]);

  // The calendar loads its own exams per month, so search/audience/subject reach it as the matching ids
  const calendarExamIds = useMemo(() => (
    searchQuery.trim() || selectedAudience || selectedSubject
      ? filteredExceptStatus.map((exam) => exam._id)
      : null
  ), [filteredExceptStatus, searchQuery, selectedAudience, selectedSubject]);

  const visibleExams = useMemo(() => (
    selectedStatus
      ? filteredExceptStatus.filter((exam) => exam.status === selectedStatus)
      : filteredExceptStatus
  ), [filteredExceptStatus, selectedStatus]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedStatus || selectedAudience || selectedSubject
  );

  const paginatedExams = useMemo(() => {
    const start = (currentPage - 1) * 10;
    return visibleExams.slice(start, start + 10);
  }, [visibleExams, currentPage]);

  const selectedExamStats = selectedExam ? [
    { label: 'Exam Start', value: formatDateTime(selectedExam.startDateTime) },
    { label: 'Exam End', value: formatDateTime(selectedExam.endDateTime) },
    { label: 'Duration', value: formatExamDuration(selectedExam) },
    { label: 'Passing Threshold', value: `${selectedExam.passingThreshold || 0}%` },
    { label: 'Audience', value: selectedExam.targetAudience === 'alumni' ? 'Alumni' : 'Students' },
    { label: 'Total Items', value: formatCount(selectedExamQuestions.length, 'item') },
    { label: 'Subjects', value: formatCount(selectedExamSubjects.length, 'subject') },
  ] : [];

  function renderExamQuestion({ question, questionNumber }) {
    const dropdownKey = `question:${question._id}`;
    const isExpanded = openDropdownKeys.has(dropdownKey);

    return (
      <article key={question._id} className={`ambe-question-card${isExpanded ? ' is-expanded' : ''}`}>
        <button
          type="button"
          className="ambe-question-toggle"
          onClick={() => toggleQuestionDropdown(dropdownKey)}
          aria-expanded={isExpanded}
        >
          <QuestionMeta question={question} questionNumber={questionNumber}>
            <span className={`ambe-expand-icon${isExpanded ? ' is-open' : ''}`} aria-hidden="true">▾</span>
          </QuestionMeta>
          {!isExpanded && (
            <span className="ambe-question-headline">
              {toOneLine(question.description) || 'No description provided.'}
            </span>
          )}
        </button>

        {isExpanded && <QuestionDetailPanels question={question} onZoom={setFullscreenImage} />}
      </article>
    );
  }

  function renderExamQuestionSet({ groupId, setNumber, questions: members }) {
    const dropdownKey = `group:${groupId}`;
    const isOpen = openDropdownKeys.has(dropdownKey);
    const activeIdx = Math.min(activeGroupIdx[groupId] || 0, members.length - 1);
    const { question: activeQuestion, questionNumber: activeNumber } = members[activeIdx];
    const firstQuestion = members[0].question;
    const firstNumber = members[0].questionNumber;
    const lastNumber = members[members.length - 1].questionNumber;
    // The set's shared passage, repeated above whichever question is shown
    const passage = (activeQuestion.groupContext || firstQuestion.groupContext || '').trim();
    const passageImages = activeQuestion.groupContextImages || firstQuestion.groupContextImages || [];

    return (
      <section key={`question-set-${groupId}`} className={`ambe-question-set${isOpen ? ' is-open' : ''}`}>
        <button
          type="button"
          className="ambe-question-set-header"
          onClick={() => toggleQuestionDropdown(dropdownKey)}
          aria-expanded={isOpen}
        >
          <span className="ambe-question-set-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="4" y="5" width="16" height="5" rx="1.5" />
              <rect x="4" y="14" width="16" height="5" rx="1.5" />
              <path d="M8 7.5h8M8 16.5h8" />
            </svg>
          </span>
          <span className="ambe-question-number">
            {members.length > 1 ? `Questions ${firstNumber}–${lastNumber}` : `Question ${firstNumber}`}
          </span>
          <span className="ambe-question-set-title">
            {toOneLine(firstQuestion.groupContext) || `Question Set ${setNumber}`}
          </span>
          <span className="ambe-question-set-badge">{formatCount(members.length, 'question')}</span>
          <span className={`ambe-expand-icon${isOpen ? ' is-open' : ''}`} aria-hidden="true">▾</span>
        </button>

        {isOpen && (
          <div className="ambe-question-set-body">
            {/* One numbered bubble per question in the set, as in Create Exams */}
            {members.length > 1 && (
              <ImportReviewBubbles
                questions={members.map((member) => member.question)}
                currentIdx={activeIdx}
                onSelectQuestion={(idx) => setActiveGroupIdx((prev) => ({ ...prev, [groupId]: idx }))}
                readOnly
              />
            )}

            <article key={activeQuestion._id} className="ambe-question-card is-grouped">
              <QuestionMeta question={activeQuestion} questionNumber={activeNumber} />
              <QuestionDetailPanels
                question={activeQuestion}
                passage={passage}
                passageImages={passageImages}
                onZoom={setFullscreenImage}
              />
            </article>
          </div>
        )}
      </section>
    );
  }

  const examColumns = useMemo(
    () => [
      {
        key: 'name',
        label: 'Exam',
        width: EXAM_TABLE_COLUMN_WIDTHS[0],
        className: 'ambe-td-name',
        render: (exam) => {
          const isViewing = selectedExam?._id === exam._id;
          const isAlumni = (exam.targetAudience || 'student') === 'alumni';
          return (
            <div className="ambe-stack">
              <button
                type="button"
                className="ambe-name-link"
                onClick={() => handleView(exam._id)}
                title={isViewing ? 'Hide exam details' : 'View exam details'}
              >
                {exam.name}
              </button>
              <span className="ambe-audience">
                <AudienceIcon audience={exam.targetAudience} className="ambe-audience-icon" />
                {isAlumni ? 'Alumni' : 'Students'}
              </span>
            </div>
          );
        },
      },
      {
        key: 'program',
        label: 'Program',
        width: EXAM_TABLE_COLUMN_WIDTHS[1],
        render: (exam) => exam.program?.name || exam.program?.code || '-',
      },
      {
        key: 'created',
        label: 'Created',
        width: EXAM_TABLE_COLUMN_WIDTHS[2],
        render: (exam) => (
          <div className="ambe-stack">
            <span className="ambe-stack-main">{exam.createdBy?.name || '-'}</span>
            <span className="ambe-stack-sub ambe-nowrap">{formatDate(exam.createdAt)}</span>
          </div>
        ),
      },
      {
        key: 'subjects',
        label: 'Subjects',
        width: EXAM_TABLE_COLUMN_WIDTHS[3],
        render: (exam) => {
          const subjects = exam.subjectTags || [];
          if (subjects.length === 0) return <span className="ambe-muted">-</span>;
          const hidden = subjects.slice(TABLE_SUBJECT_LIMIT);
          return (
            <ul className="ambe-subject-list">
              {subjects.slice(0, TABLE_SUBJECT_LIMIT).map((tag) => (
                <li key={tag._id || tag.name}>{tag.name}</li>
              ))}
              {hidden.length > 0 && (
                <li className="ambe-subject-more" title={hidden.map((tag) => tag.name).join(', ')}>
                  +{hidden.length} more
                </li>
              )}
            </ul>
          );
        },
      },
      {
        key: 'schedule',
        label: 'Schedule',
        width: EXAM_TABLE_COLUMN_WIDTHS[4],
        render: renderScheduleCell,
      },
      {
        key: 'activity',
        label: 'Activity',
        width: EXAM_TABLE_COLUMN_WIDTHS[5],
        render: (exam) => (
          <div className="ambe-stack">
            <span className="ambe-stack-main ambe-nowrap">{formatCount(exam.questions?.length, 'question')}</span>
            <span className="ambe-stack-sub ambe-nowrap">
              {(exam.targetAudience || 'student') === 'alumni'
                ? formatCount(exam.alumniSubmissionCount, 'attempt')
                : `${exam.submissionCount || 0}/${exam.totalStudents || 0} submitted`}
            </span>
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        width: EXAM_TABLE_COLUMN_WIDTHS[6],
        render: (exam) => (
          <>
            <span className={`ui-table-status ui-table-status--${EXAM_STATUS_TONES[exam.status] || 'default'}`}>{exam.status}</span>
            {exam.resultsReleaseDate && exam.status !== 'archived' && (
              <div className="ambe-release-date">
                Release: {formatDateTime(exam.resultsReleaseDate)}
              </div>
            )}
          </>
        ),
      },
      {
        key: 'actions',
        label: 'Actions',
        width: EXAM_TABLE_COLUMN_WIDTHS[7],
        render: (exam) => {
          const isViewing = selectedExam?._id === exam._id;
          return (
            <div className="ambe-actions">
              {exam.status === 'draft' ? (
                <button
                  type="button"
                  className="ambe-btn publish"
                  onClick={() => handlePublish(exam)}
                >
                  Publish
                </button>
              ) : (
                <button
                  type="button"
                  className="ambe-btn view"
                  onClick={() => handleView(exam._id)}
                >
                  {isViewing ? 'Hide Details' : 'View Details'}
                </button>
              )}

              <ActionMenu items={getMenuItems(exam)} ariaLabel={`More actions for ${exam.name}`} />
            </div>
          );
        },
      },
    ],
    [selectedExam?._id, formatDateTime, handleView, handlePublish, getMenuItems]
  );

  return (
    <main className="ambe-page page-shell">
      <PageHeader
        title="Available Mock Board Exams"
        subtitle="This page lists the mock board exams created by the dean for department programs."
      />

      {(me?.role === 'dean' || me?.role === 'program_chair') && (
        <CapsuleFilters
          className="ambe-status-tabs"
          ariaLabel="Filter exams by status"
          options={STATUS_TABS.map((tab) => ({
            value: tab.value,
            label: tab.label,
            count: tab.value ? (statusCounts[tab.value] || 0) : statusCounts.all,
          }))}
          value={selectedStatus}
          onChange={setSelectedStatus}
        />
      )}

      {(me?.role === 'dean' || me?.role === 'program_chair') && (
        <section className="ambe-view-controls" aria-label="Board exam view controls">
          <div className="ambe-controls-left">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search exams by name..."
              className="ambe-search-bar"
            />

            <DropdownSelect
              className="ambe-filter-select"
              value={selectedProgramId}
              onChange={(event) => setSelectedProgramId(event.target.value)}
              ariaLabel="Filter exams by program"
              disabled={me?.role === 'program_chair'}
              options={[
                ...(me?.role === 'dean' ? [{ value: 'all', label: 'All Programs' }] : []),
                ...programs.map((program) => ({
                  value: program._id,
                  label: `${program.name}${program.code ? ` (${program.code})` : ''}`,
                })),
              ]}
            />

            <DropdownSelect
              className="ambe-filter-select"
              value={selectedAudience}
              onChange={(event) => setSelectedAudience(event.target.value)}
              ariaLabel="Filter exams by audience"
              placeholder="All Audiences"
              options={[
                { value: 'student', label: 'Student Exams' },
                { value: 'alumni', label: 'Alumni Exams' },
              ]}
            />

            <DropdownSelect
              className="ambe-filter-select"
              value={selectedSubject}
              onChange={(event) => setSelectedSubject(event.target.value)}
              ariaLabel="Filter exams by subject"
              placeholder="All Subjects"
              options={subjectOptions.map((option) => ({ value: option.id, label: option.name }))}
            />
          </div>

          <div className="ambe-view-toggle">
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              Table
            </button>
            <button
              type="button"
              className={viewMode === 'cards' ? 'is-active' : ''}
              onClick={() => setViewMode('cards')}
              aria-pressed={viewMode === 'cards'}
            >
              Cards
            </button>
            <button
              type="button"
              className={viewMode === 'calendar' ? 'is-active' : ''}
              onClick={() => setViewMode('calendar')}
              aria-pressed={viewMode === 'calendar'}
            >
              Calendar
            </button>
          </div>
        </section>
      )}

      <div style={{ display: viewMode === 'calendar' ? 'block' : 'none' }}>
        <ExamCalendar
          role={me?.role}
          programId={selectedProgramId}
          programs={programs}
          onProgramChange={setSelectedProgramId}
          refreshKey={calendarRefreshKey}
          statusFilter={selectedStatus}
          examIds={calendarExamIds}
        />
      </div>

      <div className="ambe-list-view" style={{ display: viewMode === 'list' || viewMode === 'cards' ? 'block' : 'none' }}>
        {loading && (
          <div className="ui-table-card ambe-table-card ambe-skeleton" aria-busy="true" aria-label="Loading mock board exams">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="ambe-skeleton-row">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((cell) => (
                  <span key={cell} />
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && visibleExams.length === 0 && (
          <div className="ambe-empty">
            <p className="ambe-empty-title">
              {exams.length === 0 ? 'No mock board exams yet' : 'No exams match your filters'}
            </p>
            <p className="ambe-empty-text">
              {exams.length === 0
                ? 'Exams created for your programs will appear here.'
                : 'Try a different search, or clear the filters to see everything.'}
            </p>
            {exams.length > 0 && hasActiveFilters && (
              <button type="button" className="ambe-btn view" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>
        )}

        {!loading && visibleExams.length > 0 && (
          <>
            {viewMode === 'cards' ? (
              <div className="ambe-card-view-grid" aria-label="Board exams cards">
                {paginatedExams.map((exam) => {
                  const subjects = exam.subjectTags || [];
                  const isViewing = selectedExam?._id === exam._id;
                  const isAlumni = (exam.targetAudience || 'student') === 'alumni';
                  const start = exam.startDateTime ? new Date(exam.startDateTime) : null;
                  const end = exam.endDateTime ? new Date(exam.endDateTime) : null;
                  const status = exam.status || 'draft';
                  const submissions = isAlumni
                    ? `${exam.alumniSubmissionCount || 0} attempt${Number(exam.alumniSubmissionCount || 0) === 1 ? '' : 's'}`
                    : `${exam.submissionCount || 0}/${exam.totalStudents || 0}`;

                  return (
                    <article key={exam._id} className="ambe-card-view-item">
                      <div className="ambe-card-view-banner">
                        <div className="ambe-card-view-banner-topline">
                          <span className="ambe-card-view-program-code">{exam.program?.code || 'Board exam'}</span>
                          <span className={`ambe-card-view-status ambe-card-view-status--${status}`}>{status}</span>
                        </div>
                        <h3 className="ambe-card-view-title" title={exam.name}>{exam.name}</h3>
                        <p className="ambe-card-view-program">{exam.program?.name || exam.program?.code || 'No program assigned'}</p>
                      </div>

                      <div className="ambe-card-view-body">
                        <div className="ambe-card-view-subjects" aria-label="Subjects">
                          <span className="ambe-card-view-section-label">Subjects</span>
                          {subjects.length > 0 ? subjects.slice(0, 3).map((tag) => (
                            <span key={tag._id || tag.name} className="ambe-card-view-subject">{tag.name}</span>
                          )) : <span className="ambe-card-view-no-subject">No subjects added</span>}
                          {subjects.length > 3 && <span className="ambe-card-view-subject ambe-card-view-subject--more">+{subjects.length - 3} more</span>}
                        </div>

                        <div className="ambe-card-view-record-meta">
                          <div><span>Creator</span><strong>{exam.createdBy?.name || '-'}</strong></div>
                          <div><span>Created Date</span><strong>{formatDateTime(exam.createdAt)}</strong></div>
                        </div>

                        <div className="ambe-card-view-schedule">
                          <div className="ambe-card-view-date-block">
                            <span className="ambe-card-view-date-label">Exam Start</span>
                            <strong>{start ? start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'}</strong>
                            {start && <span>{start.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>}
                          </div>
                          <div className="ambe-card-view-date-block">
                            <span className="ambe-card-view-date-label">Exam End</span>
                            <strong>{end ? end.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled'}</strong>
                            {end && <span>{end.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })}</span>}
                          </div>
                        </div>

                        <div className="ambe-card-view-stats">
                          <div><strong>{formatExamDuration(exam)}</strong><span>Duration</span></div>
                          <div><strong>{exam.questions?.length || 0}</strong><span>Questions</span></div>
                          <div><strong>{submissions}</strong><span>Submissions</span></div>
                          <div><strong>{isAlumni ? 'Alumni' : 'Students'}</strong><span>Audience</span></div>
                        </div>

                        {exam.resultsReleaseDate && exam.status !== 'archived' && (
                          <p className="ambe-card-view-release">Results release: {formatDateTime(exam.resultsReleaseDate)}</p>
                        )}

                        <div className="ambe-card-view-actions">
                          {exam.status === 'draft' ? (
                            <button type="button" className="ambe-btn publish" onClick={() => handlePublish(exam)}>Publish exam</button>
                          ) : (
                            <button type="button" className="ambe-btn view" onClick={() => handleView(exam._id)}>
                              {isViewing ? 'Hide details' : 'View details'}
                            </button>
                          )}
                          <ActionMenu
                            items={getMenuItems(exam)}
                            ariaLabel={`More actions for ${exam.name}`}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
            <Table
              wrapperClassName="ambe-table-card"
              className="ambe-table"
              columns={examColumns}
              data={paginatedExams}
              keyField="_id"
            />
            )}
            {(viewMode !== 'cards' || visibleExams.length > 10) && (
              <div className={`ui-table-footer ambe-pagination-footer${viewMode === 'cards' ? ' ambe-card-pagination' : ''}`}>
                <Pagination
                  currentPage={currentPage}
                  totalItems={visibleExams.length}
                  pageSize={10}
                  onPageChange={setCurrentPage}
                  itemLabel="exams"
                />
              </div>
            )}
          </>
        )}
      </div>



      <Modal
        open={!!selectedExam}
        onClose={closeExamDetails}
        title="Exam Details"
        size="wide"
        bodyClassName="ambe-details-modal-body"
      >
        {selectedExam && (
          <section className="ambe-details">
          <div className="ambe-details-header-new">
            <div className="ambe-details-header-copy">
              <span className="ambe-details-audience">
                {selectedExam.targetAudience === 'alumni' ? 'Alumni exam' : 'Student exam'}
              </span>
              <h2 className="ambe-details-name">{selectedExam.name}</h2>
              <p className="ambe-details-program">
                {selectedExam.program?.name || selectedExam.program?.code || 'No program assigned'}
              </p>
              {selectedExamSubjects.length > 0 && (
                <div className="ambe-details-subjects">
                  {selectedExamSubjects.map((tag) => (
                    <span key={tag._id || tag.name} className="ambe-pill subject">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="ambe-details-header-side">
              <div className="ambe-status-pill">
                <span className={`ambe-status ${selectedExam.status}`}>
                  {selectedExam.status?.toUpperCase()}
                </span>
              </div>
              {selectedExam.resultsReleaseDate && (
                <p className="ambe-details-release-note">
                  Results release: <strong>{formatDateTime(selectedExam.resultsReleaseDate)}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="ambe-detail-panels">
            <article className="ambe-info-card">
              <span className="ambe-info-label">Description</span>
              <p>{selectedExam.description || 'No description provided for this exam yet.'}</p>
            </article>
            <article className="ambe-info-card">
              <span className="ambe-info-label">Instructions</span>
              <p>{selectedExam.instructions || 'No special instructions were added for this exam.'}</p>
            </article>
          </div>

          <div className="ambe-stat-grid">
            {selectedExamStats.map((stat) => (
              <article key={stat.label} className="ambe-stat-card">
                <span className="ambe-stat-label">{stat.label}</span>
                <strong className="ambe-stat-value">{stat.value}</strong>
              </article>
            ))}
          </div>

          <div className="ambe-questions-container">
            <div className="ambe-questions-header">
              <div>
                <h3>Questions</h3>
                <p>Review the complete list of exam questions, answer choices, and attached figures.</p>
              </div>
              <span className="ambe-questions-hint">Click an image to expand it</span>
            </div>

            {selectedExamQuestions.length === 0 && (
              <p className="ambe-muted">No questions found.</p>
            )}

            {selectedExamQuestions.length > 0 && (
              <>
                <CapsuleFilters
                  className="ambe-type-pills"
                  ariaLabel="Filter questions by type"
                  options={[
                    { value: 'all', label: 'All', count: questionTypeCounts.all },
                    { value: 'single', label: 'Single', count: questionTypeCounts.single },
                    { value: 'group', label: 'Group', count: questionTypeCounts.group },
                  ]}
                  value={questionTypeFilter}
                  onChange={setQuestionTypeFilter}
                />

                {visibleQuestionItems.length === 0 ? (
                  <p className="ambe-muted">
                    {questionTypeFilter === 'group' ? 'This exam has no grouped questions.' : 'This exam has no single questions.'}
                  </p>
                ) : (
                  <div className="ambe-question-list">
                    {visibleQuestionItems.map((item) => (
                      item.type === 'group' ? renderExamQuestionSet(item) : renderExamQuestion(item)
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          </section>
        )}
      </Modal>

      {fullscreenImage && createPortal(
        <div
          className="ambe-image-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="ambe-image-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="ambe-image-close"
              onClick={() => setFullscreenImage(null)}
              aria-label="Close image preview"
            >
              Close
            </button>
            <AuthImage src={fullscreenImage} alt="Preview" className="ambe-image-full" />
          </div>
        </div>,
        document.body
      )}

      {schedulingExamId && (() => {
        const schedulingExam = exams.find((exam) => exam._id === schedulingExamId);
        if (!schedulingExam) return null;

        return (
          <DateTimePicker
            key={schedulingExamId}
            value={schedulingExam.resultsReleaseDate}
            autoOpen
            title={schedulingExam.resultsReleaseDate ? 'Reschedule Results Release' : 'Schedule Results Release'}
            description={<>Choose when students can see the results of <strong>{schedulingExam.name}</strong>.</>}
            role={me?.role}
            programId={schedulingExam.program?._id || schedulingExam.program}
            onCancel={() => setSchedulingExamId(null)}
            onChange={(date) => handleScheduleResults(schedulingExamId, date)}
          />
        );
      })()}

      <ConfirmationModal
        open={!!confirmationModal}
        onClose={closeConfirmationModal}
        onConfirm={handleConfirmAction}
        title={confirmationModal?.title || 'Confirm Action'}
        message={confirmationModal?.message}
        confirmLabel={confirmationModal?.confirmLabel || 'Confirm'}
        confirmVariant={confirmationModal?.confirmVariant || 'primary'}
        busy={modalBusy}
      />

      <FeedbackModal
        open={!!feedbackModal}
        onClose={closeFeedbackModal}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
        dismissLabel={feedbackModal?.dismissLabel || 'Okay'}
      />
    </main>
  );
}
