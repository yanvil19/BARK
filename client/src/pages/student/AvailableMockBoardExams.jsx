import { useEffect, useMemo, useState } from 'react';
import PageHeader from '../../components/PageHeader.jsx';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import ExamCalendar from '../../components/examCalendar/ExamCalendar.jsx';
import Pagination from '../../components/Pagination.jsx';
import SearchBar from '../../components/SearchBar.jsx';
import '../../styles/AvailableMockBoardExam.css';

const BASE = import.meta.env.VITE_API_URL;

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

function resolveImageSrc(image) {
  if (!image) return '';
  return image.startsWith('/') ? `${BASE}${image}` : image;
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
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [schedulingExamId, setSchedulingExamId] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedAudience, setSelectedAudience] = useState('');

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedProgramId, selectedStatus, selectedAudience]);

  useEffect(() => {
    async function fetchExams() {
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams`);
        setExams(data.exams || []);
      } catch (err) {
        console.error('Failed to load mock board exams:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchExams();
  }, [refreshKey]);

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
            return deptPrograms[0]?._id || '';
          });
        }
      } catch (err) {
        console.error('Failed to load programs:', err);
      }
    }

    fetchPrograms();
  }, [me]);

  useEffect(() => {
    setExpandedQuestionId(null);
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
        body: { status: 'published' },
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
      setSelectedExam(null);
      return;
    }

    try {
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
      setSelectedExam(data.exam || null);
    } catch (err) {
      setFeedbackModal({
        title: 'Unable to Load Exam Details',
        tone: 'danger',
        message: err.message || 'Failed to load exam details.',
      });
    }
  }

  const selectedExamQuestions = selectedExam?.questions || [];
  const selectedExamSubjects = selectedExam?.subjectTags || [];
  const visibleExams = useMemo(() => {
    let filtered = exams;
    if ((me?.role === 'dean' || me?.role === 'program_chair') && selectedProgramId) {
      filtered = filtered.filter((exam) => String(exam.program?._id || exam.program) === String(selectedProgramId));
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((exam) => exam.name?.toLowerCase().includes(q));
    }
    if (selectedStatus) {
      filtered = filtered.filter((exam) => exam.status === selectedStatus);
    }
    if (selectedAudience) {
      filtered = filtered.filter((exam) => (exam.targetAudience || 'student') === selectedAudience);
    }
    return filtered;
  }, [exams, me?.role, selectedProgramId, searchQuery, selectedStatus, selectedAudience]);

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

  return (
    <main className="ambe-page">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Available Mock Board Exams"
        subtitle="This page lists the mock board exams created by the dean for department programs."
      />

      {(me?.role === 'dean' || me?.role === 'program_chair') && (
        <section className="ambe-view-controls" aria-label="Board exam view controls">
          <div className="ambe-controls-left">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search exams by name..."
              className="ambe-search-bar"
            />

            <select
              className="ambe-filter-select"
              value={selectedProgramId}
              onChange={(event) => setSelectedProgramId(event.target.value)}
              aria-label="Filter exams by program"
              disabled={me?.role === 'program_chair'}
            >
              {programs.length === 0 ? <option value="">No programs found</option> : null}
              {programs.map((program) => (
                <option key={program._id} value={program._id}>
                  {program.name} {program.code ? `(${program.code})` : ''}
                </option>
              ))}
            </select>

            <select
              className="ambe-filter-select"
              value={selectedStatus}
              onChange={(event) => setSelectedStatus(event.target.value)}
              aria-label="Filter exams by status"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="ongoing">Ongoing</option>
              <option value="finished">Finished</option>
              <option value="archived">Archived</option>
            </select>

            <select
              className="ambe-filter-select"
              value={selectedAudience}
              onChange={(event) => setSelectedAudience(event.target.value)}
              aria-label="Filter exams by audience"
            >
              <option value="">All Audiences</option>
              <option value="student">Student Exams</option>
              <option value="alumni">Alumni Exams</option>
            </select>
          </div>

          <div className="ambe-view-toggle">
            <button
              type="button"
              className={viewMode === 'list' ? 'is-active' : ''}
              onClick={() => setViewMode('list')}
            >
              List View
            </button>
            <button
              type="button"
              className={viewMode === 'calendar' ? 'is-active' : ''}
              onClick={() => setViewMode('calendar')}
            >
              Calendar View
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
        />
      </div>

      <div style={{ display: viewMode === 'list' ? 'block' : 'none' }}>

      {loading && <p className="ambe-loading">Loading mock board exams...</p>}

      {!loading && visibleExams.length === 0 && (
        <p className="ambe-empty">No mock board exams found matching your criteria.</p>
      )}

      {!loading && visibleExams.length > 0 && (
        <>
        <div className="ambe-table-card">
          <div className="ambe-scroll-x">
            <table className="ambe-table">
              <thead>
                <tr>
                  <th>Exam Name</th>
                  <th>Program</th>
                  <th>Subjects</th>
                  <th>Exam Start</th>
                  <th>Exam End</th>
                  <th>Duration</th>
                  <th>Questions</th>
                  <th>Submissions</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedExams.map((exam) => (
                  <tr key={exam._id}>
                    <td>{exam.name}</td>
                    <td>
                      <span className="ambe-pill program">
                        {exam.program?.name || exam.program?.code || '-'}
                      </span>
                    </td>
                    <td>
                      {(exam.subjectTags || []).length > 0 ? (
                        <div className="ambe-table-subjects">
                          {exam.subjectTags.map((tag) => (
                            <span key={tag._id || tag.name} className="ambe-pill subject">
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="ambe-muted">-</span>
                      )}
                    </td>
                    <td className="ambe-muted">{formatDateTime(exam.startDateTime)}</td>
                    <td className="ambe-muted">{formatDateTime(exam.endDateTime)}</td>
                    <td className="ambe-muted">{formatExamDuration(exam)}</td>
                    <td>{exam.questions?.length || 0}</td>
                    <td>
                      {(exam.targetAudience || 'student') === 'alumni'
                        ? `${exam.alumniSubmissionCount || 0} attempt${Number(exam.alumniSubmissionCount || 0) === 1 ? '' : 's'}`
                        : `${exam.submissionCount || 0}/${exam.totalStudents || 0}`}
                    </td>
                    <td>
                      <span className="ambe-pill program">
                        {(exam.targetAudience || 'student') === 'alumni' ? 'Alumni' : 'Students'}
                      </span>
                    </td>
                    <td>
                      <span className={`ambe-status ${exam.status}`}>
                        {exam.status}
                      </span>
                      {exam.resultsReleaseDate && exam.status !== 'archived' && (
                        <div className="ambe-release-date">
                          Release: {formatDateTime(exam.resultsReleaseDate)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="ambe-actions">
                        <button
                          type="button"
                          className="ambe-btn view"
                          onClick={() => handleView(exam._id)}
                        >
                          {selectedExam?._id === exam._id ? 'Hide Details' : 'View Details'}
                        </button>

                        {exam.status === 'draft' && (
                          <button
                            type="button"
                            className="ambe-btn publish"
                            onClick={() => handlePublish(exam)}
                          >
                            Publish
                          </button>
                        )}

                        {exam.status !== 'ongoing' && exam.status !== 'finished' && exam.status !== 'archived' && (
                          <button
                            type="button"
                            className="ambe-btn primary"
                            onClick={() => onEditExam(exam._id, 'testRun')}
                          >
                            Test Run
                          </button>
                        )}

                        {(exam.status === 'draft' || exam.status === 'published') && (
                          <button
                            type="button"
                            className="ambe-btn primary"
                            onClick={() => handleEdit(exam)}
                          >
                            Edit
                          </button>
                        )}

                        {canScheduleResultsRelease(exam) && (
                          <button
                            type="button"
                            className="ambe-btn primary"
                            onClick={() => setSchedulingExamId(exam._id)}
                            disabled={schedulingExamId === exam._id}
                          >
                            {exam.resultsReleaseDate ? 'Reschedule Results' : 'Schedule Results'}
                          </button>
                        )}

                        {(exam.status === 'finished' || ((exam.targetAudience || 'student') === 'alumni' && exam.status === 'published')) && (
                          <button
                            type="button"
                            className="ambe-btn archive"
                            onClick={() => handleArchive(exam)}
                          >
                            Archive
                          </button>
                        )}

                        {exam.status === 'ongoing' && (
                          <button
                            type="button"
                            className="ambe-btn delete"
                            onClick={() => handleEndEarly(exam)}
                          >
                            End Exam Early
                          </button>
                        )}

                        <button
                          type="button"
                          className="ambe-btn publish"
                          onClick={() => handleCopy(exam)}
                        >
                          Create Copy
                        </button>

                        {(exam.status === 'archived' || exam.status === 'draft') && (
                          <button
                            type="button"
                            className="ambe-btn delete ambe-btn-icon"
                            onClick={() => handleDelete(exam)}
                            title="Delete exam"
                            aria-label="Delete exam"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                              <path d="M10 11v6"></path>
                              <path d="M14 11v6"></path>
                              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="ambe-pagination-footer">
          <Pagination
            currentPage={currentPage}
            totalItems={visibleExams.length}
            pageSize={10}
            onPageChange={setCurrentPage}
            itemLabel="exams"
          />
        </div>
        </>
      )}
      </div>

      {selectedExam && (
        <section className="ambe-details">
          <div className="ambe-details-header-new">
            <div className="ambe-details-header-copy">
              <span className="ambe-details-eyebrow">Exam Details</span>
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
                <p>Each question now groups the prompt, subject, answer choices, and image previews together.</p>
              </div>
              <span className="ambe-questions-hint">Click an image to expand it</span>
            </div>

            {selectedExamQuestions.length === 0 && (
              <p className="ambe-muted">No questions found.</p>
            )}

            {selectedExamQuestions.length > 0 && (
              <div className="ambe-question-list">
                {selectedExamQuestions.map((question, index) => {
                  const answers = organizeQuestionAnswers(question).answers || [];
                  const questionImages = (question.images || []).map(resolveImageSrc).filter(Boolean);
                  const isExpanded = String(expandedQuestionId) === String(question._id);

                  return (
                    <article key={question._id} className={`ambe-question-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
                      <button
                        type="button"
                        className="ambe-question-toggle"
                        onClick={() => setExpandedQuestionId((prev) => (String(prev) === String(question._id) ? null : question._id))}
                        aria-expanded={isExpanded}
                      >
                        <div className="ambe-question-card-top">
                          <div className="ambe-question-title-block">
                            <span className="ambe-question-number">
                              Question {String(index + 1).padStart(2, '0')}
                            </span>
                            <h4 className="ambe-question-title">
                              {question.title || `Untitled Question ${index + 1}`}
                            </h4>
                          </div>

                          <div className="ambe-question-top-meta">
                            {question.tag?.name ? (
                              <span className="ambe-pill subject">{question.tag.name}</span>
                            ) : (
                              <span className="ambe-question-meta-fallback">No subject tag</span>
                            )}
                            {questionImages.length > 0 && (
                              <span className="ambe-question-image-count">
                                {formatCount(questionImages.length, 'image')}
                              </span>
                            )}
                            <span className="ambe-question-chevron" aria-hidden="true" />
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="ambe-question-content">
                          <div className="ambe-question-main">
                            <div className="ambe-question-copy">
                              <span className="ambe-section-label">Prompt</span>
                              <p className="ambe-question-text">
                                {question.description || 'No question prompt provided.'}
                              </p>
                            </div>

                            {questionImages.length > 0 && (
                              <div className="ambe-question-gallery">
                                <span className="ambe-section-label">Reference Images</span>
                                <div className="ambe-question-thumbs">
                                  {questionImages.map((image, imageIndex) => (
                                    <button
                                      key={`${question._id}-image-${imageIndex}`}
                                      type="button"
                                      className="ambe-question-image-button"
                                      onClick={() => setFullscreenImage(image)}
                                    >
                                      <img
                                        src={image}
                                        alt={`Question ${index + 1} image ${imageIndex + 1}`}
                                        className="ambe-question-thumb"
                                      />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="ambe-question-answers-panel">
                            <span className="ambe-section-label">Answer Choices</span>
                            <ul className="ambe-answers ambe-answers--styled">
                              {answers.map((answer) => (
                                <li
                                  key={answer._id || `${answer.optionLabel}-${answer.text}`}
                                  className={`ambe-answer-item ${answer.isCorrect ? 'is-correct' : ''}`}
                                >
                                  <div className="ambe-answer-left">
                                    <span className="ambe-answer-label">{answer.optionLabel}</span>
                                  </div>
                                  <div className="ambe-answer-body">
                                    <div className="ambe-answer-text">{answer.text}</div>
                                    {answer.isCorrect && (
                                      <span className="ambe-answer-badge">Correct Answer</span>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {fullscreenImage && (
        <div className="ambe-image-overlay" onClick={() => setFullscreenImage(null)}>
          <div className="ambe-image-modal" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="ambe-image-close"
              onClick={() => setFullscreenImage(null)}
            >
              Close
            </button>
            <img src={fullscreenImage} alt="Preview" className="ambe-image-full" />
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
