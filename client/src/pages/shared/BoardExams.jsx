import { useEffect, useMemo, useRef, useState } from 'react';
import AuthImage from '../../components/AuthImage.jsx';
import CapsuleFilters from '../../components/CapsuleFilters.jsx';
import PanelHeader from '../../components/PanelHeader.jsx';
import QuestionStepper from '../../components/QuestionStepper.jsx';
import { EXAM_STATUSES, Marker, MarkerIcon, MarkerLegend } from '../../components/QuestionMarkers.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { apiAuth } from '../../lib/api.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import ExamCalendar from '../../components/ExamCalendar.jsx';
import Pagination from '../../components/Pagination.jsx';
import QuestionFilters from '../../components/QuestionFilters.jsx';
import DropdownSelect from '../../components/DropdownSelect.jsx';
import TrashButton from '../../components/TrashButton.jsx';
import { useToast } from '../../components/Toast.jsx';
import { AudienceIcon } from '../../components/CalendarIcons.jsx';
import { formatDate, formatDateTime, formatTime } from '../../utils/dateFormat.js';
// The list, panel and motion are the same as Approve Questions, so they share its styles
import '../../styles/shared/QuestionApprovals.css';
import '../../styles/shared/BoardExams.css';

const BASE = import.meta.env.VITE_API_URL;

const ITEMS_PER_PAGE = 10;

const STATUS_TABS = [
  { value: '', label: 'All' },
  ...Object.entries(EXAM_STATUSES).map(([value, { label }]) => ({ value, label })),
];

const AUDIENCE_LABELS = { student: 'Student exam', alumni: 'Alumni exam' };

const PANEL_VIEWS = [
  { value: 'questions', label: 'Questions' },
  { value: 'details', label: 'Details' },
];

function AudienceMarkerIcon({ audience }) {
  return <AudienceIcon audience={audience} width="13" height="13" strokeWidth="2.4" />;
}

const LEGEND_ITEMS = [
  { text: 'Questions', className: 'ca-marker--count', content: '#' },
  ...Object.entries(EXAM_STATUSES).map(([status, { label, icon }]) => ({
    text: label,
    className: `ca-exam-state--${status}`,
    content: <MarkerIcon>{icon}</MarkerIcon>,
  })),
  ...Object.entries(AUDIENCE_LABELS).map(([audience, label]) => ({
    text: label,
    className: 'ambe-marker--audience',
    content: <AudienceMarkerIcon audience={audience} />,
  })),
];

function getAudience(exam) {
  return exam?.targetAudience || 'student';
}

function formatProgramLabel(program) {
  return program?.name || program?.code || '-';
}

function formatStatusLabel(status) {
  return EXAM_STATUSES[status]?.label || status;
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
  if (getAudience(exam) === 'alumni') {
    return exam.isTimed ? `${formatShortDuration(exam.durationMinutes)} per attempt` : 'Untimed attempts';
  }
  return exam.durationMinutes ? formatShortDuration(exam.durationMinutes) : '';
}

function formatCount(value, singular, plural = `${singular}s`) {
  const total = Number(value) || 0;
  return `${total} ${total === 1 ? singular : plural}`;
}

// The labelled values at the bottom of the panel
function getExamFacts(exam) {
  const isAlumni = getAudience(exam) === 'alumni';
  return [
    { label: 'Program', value: formatProgramLabel(exam.program) },
    { label: 'Audience', value: isAlumni ? 'Alumni' : 'Students' },
    { label: 'Created By', value: exam.createdBy?.name || '-' },
    { label: 'Created', value: formatDateTime(exam.createdAt) },
    { label: 'Exam Start', value: exam.startDateTime ? formatDateTime(exam.startDateTime) : 'Not scheduled' },
    { label: 'Exam End', value: exam.endDateTime ? formatDateTime(exam.endDateTime) : 'Not scheduled' },
    { label: 'Duration', value: formatScheduleLength(exam) || '-' },
    { label: 'Passing Threshold', value: `${exam.passingThreshold || 0}%` },
    { label: 'Questions', value: formatCount(exam.questions?.length, 'question') },
    isAlumni
      ? { label: 'Attempts', value: formatCount(exam.alumniSubmissionCount, 'attempt') }
      : { label: 'Submissions', value: `${exam.submissionCount || 0}/${exam.totalStudents || 0} submitted` },
    { label: 'Status', value: formatStatusLabel(exam.status) },
    // Alumni see their results straight away, so only student exams have a release date
    ...(isAlumni ? [] : [{
      label: 'Results Release',
      value: exam.resultsReleaseDate ? formatDateTime(exam.resultsReleaseDate) : 'Not scheduled',
    }]),
  ];
}

function canScheduleResultsRelease(exam) {
  if (getAudience(exam) === 'alumni') return false;
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
  const { notify } = useToast();
  const [exams, setExams] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [loading, setLoading] = useState(true);
  // The panel: the open exam, Questions or Details, its questions once loaded, the question shown,
  // and the image opened full size. The view stays as it is when another exam opens.
  const [selectedExamId, setSelectedExamId] = useState(null);
  const [panelView, setPanelView] = useState('questions');
  const [loadedQuestions, setLoadedQuestions] = useState({ examId: null, questions: [], error: '' });
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
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
  const [sortBy, setSortBy] = useState('newest');
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);

  const isDean = me?.role === 'dean';
  const isManager = isDean || me?.role === 'program_chair';

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
  }, [searchQuery, selectedProgramId, selectedStatus, selectedAudience, selectedSubject, sortBy]);

  // The list scrolls on its own: each page or filter starts at the top...
  const listScrollRef = useRef(null);
  useEffect(() => {
    if (listScrollRef.current) listScrollRef.current.scrollTop = 0;
  }, [currentPage, searchQuery, selectedProgramId, selectedStatus, selectedAudience, selectedSubject, sortBy]);

  // ...and the open exam's card stays in view when the columns change
  useEffect(() => {
    listScrollRef.current?.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }, [selectedExamId, currentPage, isSidebarExpanded]);

  // Windows too short to fit the page scroll it, which can leave the panel partly off screen
  const panelRef = useRef(null);
  useEffect(() => {
    if (!selectedExamId) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panelRef.current?.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [selectedExamId]);

  useEffect(() => {
    if (!fullscreenImage) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFullscreenImage(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [fullscreenImage]);

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
        notify(err.message || 'The exams could not be loaded. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchExams();
  }, [notify, refreshKey, me?.role]);

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

  // The list has everything about an exam except its questions. A slow answer for an exam that
  // is no longer open is ignored.
  useEffect(() => {
    if (!selectedExamId) return undefined;
    let ignore = false;

    apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(selectedExamId)}`)
      .then((data) => {
        if (!ignore) setLoadedQuestions({ examId: selectedExamId, questions: data.exam?.questions || [], error: '' });
      })
      .catch((err) => {
        if (!ignore) {
          setLoadedQuestions({
            examId: selectedExamId,
            questions: [],
            error: err.message || 'The questions of this exam could not be loaded.',
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, [selectedExamId]);

  function handleSelectExam(exam) {
    if (exam._id === selectedExamId) return;
    setSelectedExamId(exam._id);
    setActiveQuestionIdx(0);
  }

  function closeConfirmationModal() {
    if (modalBusy) return;
    setConfirmationModal(null);
  }

  function closeFeedbackModal() {
    const nextAction = feedbackModal?.onClose;
    setFeedbackModal(null);
    nextAction?.();
  }

  function updateExamStatus(examId, status, changes = {}) {
    setExams((prev) => prev.map((exam) => (
      exam._id === examId ? { ...exam, ...changes, status } : exam
    )));

    // Stays open unless the exam has just left the list being viewed
    if (selectedExamId === examId && selectedStatus && selectedStatus !== status) {
      setSelectedExamId(null);
    }

    triggerCalendarRefresh();
  }

  function handleDelete(exam) {
    setConfirmationModal({
      type: 'delete',
      exam,
      title: exam.status === 'archived' ? 'Delete Archived Exam' : 'Delete Draft Exam',
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
      if (selectedExamId === exam._id) setSelectedExamId(null);
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
      // A copy is for the same program, so it has the same number of students
      if (data.exam) setExams((prev) => [{ ...data.exam, totalStudents: exam.totalStudents }, ...prev]);
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
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}/end-early`, { method: 'POST' });
      // Ending it early also moves the exam's end time, which the panel shows
      updateExamStatus(exam._id, 'finished', {
        endDateTime: data.exam?.endDateTime ?? exam.endDateTime,
        durationMinutes: data.exam?.durationMinutes ?? exam.durationMinutes,
      });
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

  // The panel reads from the list, so a publish, archive or schedule shows there straight away
  const selectedExam = useMemo(() => (
    selectedExamId ? exams.find((exam) => exam._id === selectedExamId) || null : null
  ), [exams, selectedExamId]);

  const isLoadingQuestions = Boolean(selectedExamId) && loadedQuestions.examId !== selectedExamId;
  const questionsError = isLoadingQuestions ? '' : loadedQuestions.error;

  const programExams = useMemo(() => {
    if (isManager && selectedProgramId && selectedProgramId !== 'all') {
      return exams.filter((exam) =>
        String(exam.program?._id || exam.program) === String(selectedProgramId)
      );
    }
    return exams;
  }, [exams, isManager, selectedProgramId]);

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
      filtered = filtered.filter((exam) => getAudience(exam) === selectedAudience);
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

  const visibleExams = useMemo(() => {
    const listed = selectedStatus
      ? filteredExceptStatus.filter((exam) => exam.status === selectedStatus)
      : filteredExceptStatus;
    const updatedTime = (exam) => new Date(exam.updatedAt || exam.createdAt || 0).getTime();
    return [...listed].sort((a, b) => (
      sortBy === 'oldest' ? updatedTime(a) - updatedTime(b) : updatedTime(b) - updatedTime(a)
    ));
  }, [filteredExceptStatus, selectedStatus, sortBy]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedStatus || selectedAudience || selectedSubject
  );

  const totalPages = Math.ceil(visibleExams.length / ITEMS_PER_PAGE) || 1;
  const paginatedExams = visibleExams.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Deleted or archived exams can leave the list, which can empty the last page
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  function renderExamCard(exam, cardIndex) {
    const subjects = exam.subjectTags || [];
    const audience = getAudience(exam);
    const questionCount = exam.questions?.length || 0;

    return (
      <div
        key={exam._id}
        className={`ca-question-card ${exam._id === selectedExamId ? 'is-active' : ''}`}
        style={{ '--card-index': cardIndex }}
        onClick={() => handleSelectExam(exam)}
      >
        <div className="ca-card-top">
          {/* Its click bubbles up to the card, so keyboard users can open the card too */}
          <button type="button" className="ca-card-open">
            <span className="ca-card-title">{exam.name}</span>
          </button>
          <div className="ca-card-markers">
            <Marker className="ca-marker--count" label={formatCount(questionCount, 'question')}>{questionCount}</Marker>
            <Marker className="ambe-marker--audience" label={AUDIENCE_LABELS[audience]}>
              <AudienceMarkerIcon audience={audience} />
            </Marker>
            <Marker className={`ca-exam-state--${exam.status}`} label={formatStatusLabel(exam.status)}>
              <MarkerIcon>{EXAM_STATUSES[exam.status]?.icon}</MarkerIcon>
            </Marker>
          </div>
        </div>
        <div className="ca-card-meta">
          {isDean && <span className="ca-program-pill">{formatProgramLabel(exam.program)}</span>}
          {subjects.length > 0 && <span className="ca-tag-pill">{subjects[0].name}</span>}
          {subjects.length > 1 && (
            <span className="ca-tag-pill" title={subjects.slice(1).map((tag) => tag.name).join(', ')}>
              +{subjects.length - 1}
            </span>
          )}
          <span className="ca-card-meta-datetime">
            {exam.startDateTime ? (
              <>
                <span className="ca-date">{formatDate(exam.startDateTime)}</span>
                <span className="ca-time">{formatTime(exam.startDateTime)}</span>
              </>
            ) : (
              <span className="ca-date">Not scheduled</span>
            )}
          </span>
        </div>
      </div>
    );
  }

  function renderPanelActions(exam) {
    const { status } = exam;
    const canEdit = status === 'draft' || status === 'published';
    const canArchive = status === 'finished' || (getAudience(exam) === 'alumni' && status === 'published');
    const canDelete = status === 'archived' || status === 'draft';

    return (
      <div className="ca-sidebar-actions">
        {status === 'draft' && (
          <button type="button" className="ca-btn ca-btn--approve" onClick={() => handlePublish(exam)}>Publish</button>
        )}
        {status === 'ongoing' && (
          <button type="button" className="ca-btn ca-btn--reject" onClick={() => handleEndEarly(exam)}>End Exam Early</button>
        )}
        {canScheduleResultsRelease(exam) && (
          <button type="button" className="ca-btn ca-btn--restore" onClick={() => setSchedulingExamId(exam._id)}>
            {exam.resultsReleaseDate ? 'Reschedule Results' : 'Schedule Results'}
          </button>
        )}
        {canEdit && (
          <>
            <button type="button" className="ca-btn ca-btn--edit" onClick={() => handleEdit(exam)}>Edit</button>
            <button type="button" className="ca-btn ca-btn--edit" onClick={() => onEditExam(exam._id, 'testRun')}>Test Run</button>
          </>
        )}
        <button type="button" className="ca-btn ca-btn--edit" onClick={() => handleCopy(exam)}>Create Copy</button>
        {canArchive && (
          <button type="button" className="ca-btn ca-btn--edit" onClick={() => handleArchive(exam)}>Archive</button>
        )}
        {canDelete && <TrashButton label="Delete exam" onClick={() => handleDelete(exam)} />}
      </div>
    );
  }

  return (
    /* Only the list fits the screen; the calendar keeps the normal page scroll */
    <main className={`ambe-page page-shell${viewMode === 'list' ? ' ca-page ca-page--stepper' : ''}`}>
      <PageHeader
        title="Available Mock Board Exams"
        subtitle="This page lists the mock board exams created by the dean for department programs."
      >
        {me?.role === 'program_chair' && (
          <span className="ca-program-chip">{me?.program?.name || 'Your Program'}</span>
        )}
      </PageHeader>

      {isManager && (
        <CapsuleFilters
          className="ca-state-pills"
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

      {isManager && (
        <QuestionFilters
          className="ca-filters-wrapper"
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          searchPlaceholder="Search exams by name..."
          role={me?.role}
          subjectFilter={selectedSubject}
          onSubjectChange={setSelectedSubject}
          subjectOptions={subjectOptions}
          programFilter={selectedProgramId === 'all' ? '' : selectedProgramId}
          onProgramChange={(value) => setSelectedProgramId(value || 'all')}
          programOptions={programs}
          sortBy={sortBy}
          onSortChange={viewMode === 'list' ? setSortBy : undefined}
          extraFilters={(
            <DropdownSelect
              className="ambe-filter-audience"
              value={selectedAudience}
              onChange={(event) => setSelectedAudience(event.target.value)}
              ariaLabel="Filter exams by audience"
              placeholder="Filter: All Audiences"
              options={[
                { value: 'student', label: 'Student Exams' },
                { value: 'alumni', label: 'Alumni Exams' },
              ]}
            />
          )}
        >
          <div className="ca-view-toggle ambe-view-toggle">
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
            >
              List
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
        </QuestionFilters>
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

      {viewMode === 'list' && (
        <div className={`ca-layout ${selectedExam && isSidebarExpanded ? 'is-sidebar-expanded' : ''}`}>
          <section className="ca-list-panel" aria-label="Exams">
            <MarkerLegend items={LEGEND_ITEMS} ariaLabel="What the exam markers mean" />

            <div className="ca-list-scroll" ref={listScrollRef}>
              {loading ? (
                <div className="ca-empty">Loading exams...</div>
              ) : visibleExams.length === 0 ? (
                <div className="ca-empty">
                  <p className="ambe-empty-text">
                    {exams.length === 0
                      ? 'No mock board exams yet. Exams created for your programs will appear here.'
                      : 'No exams match your filters.'}
                  </p>
                  {exams.length > 0 && hasActiveFilters && (
                    <button type="button" className="ca-btn ambe-clear-filters" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                /* Keyed so the cards animate in for each new view, but not while typing a search */
                <div
                  className="ca-questions-list"
                  key={[selectedStatus, selectedSubject, selectedAudience, selectedProgramId, sortBy, currentPage].join('|')}
                >
                  {paginatedExams.map(renderExamCard)}
                </div>
              )}
            </div>

            {!loading && (
              <Pagination
                currentPage={currentPage}
                totalItems={visibleExams.length}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={setCurrentPage}
                itemLabel={visibleExams.length === 1 ? 'exam' : 'exams'}
                classPrefix="ca"
                maxPageButtons={5}
              />
            )}
          </section>

          {selectedExam ? (
            <div className="ca-sidebar" ref={panelRef}>
              <PanelHeader
                title={selectedExam.name}
                views={PANEL_VIEWS}
                view={panelView}
                onViewChange={setPanelView}
                isExpanded={isSidebarExpanded}
                onToggleExpanded={() => setIsSidebarExpanded(!isSidebarExpanded)}
                onClose={() => setSelectedExamId(null)}
                closeLabel="Close exam panel"
              />

              {/* Keyed so each exam and each view starts scrolled to the top */}
              <div className="ca-sidebar-content" key={`${selectedExam._id}-${panelView}`}>
                {panelView === 'questions' ? (
                  <>
                    {isLoadingQuestions && <p className="ca-panel-note">Loading questions...</p>}
                    {questionsError && <p className="ca-panel-note ca-panel-note--error" role="alert">{questionsError}</p>}
                    {!isLoadingQuestions && !questionsError && loadedQuestions.questions.length === 0 && (
                      <p className="ca-panel-note">This exam has no questions yet.</p>
                    )}

                    {!isLoadingQuestions && (
                      <QuestionStepper
                        questions={loadedQuestions.questions}
                        activeIdx={activeQuestionIdx}
                        onSelectQuestion={setActiveQuestionIdx}
                        onZoom={setFullscreenImage}
                        renderAside={(question) => <span className="ca-tag-pill">{question.tag?.name || 'No subject'}</span>}
                      />
                    )}
                  </>
                ) : (
                  <section className="ca-section ca-review-metadata">
                    <div className="ca-meta-grid">
                      {getExamFacts(selectedExam).map(({ label, value }) => (
                        <div key={label}>
                          <span className="ca-meta-label">{label}</span>
                          <div className="ca-meta-value">{value}</div>
                        </div>
                      ))}
                      <div className="ambe-meta-wide">
                        <span className="ca-meta-label">Subjects</span>
                        <div className="ca-meta-value ambe-subject-pills">
                          {(selectedExam.subjectTags || []).length > 0
                            ? selectedExam.subjectTags.map((tag) => (
                              <span key={tag._id || tag.name} className="ca-tag-pill">{tag.name}</span>
                            ))
                            : 'No subjects added'}
                        </div>
                      </div>
                      <div className="ambe-meta-wide">
                        <span className="ca-meta-label">Description</span>
                        <div className="ca-meta-value ambe-meta-text">
                          {selectedExam.description || 'No description provided for this exam yet.'}
                        </div>
                      </div>
                      <div className="ambe-meta-wide">
                        <span className="ca-meta-label">Instructions</span>
                        <div className="ca-meta-value ambe-meta-text">
                          {selectedExam.instructions || 'No special instructions were added for this exam.'}
                        </div>
                      </div>
                    </div>
                  </section>
                )}
              </div>

              {renderPanelActions(selectedExam)}
            </div>
          ) : (
            <div className="ca-sidebar ca-sidebar--empty">
              <p>Select an exam to view details</p>
            </div>
          )}
        </div>
      )}

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
