import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { organizeQuestionAnswers } from '../../lib/DeanTestRunOrganizer.js';
import DateTimePicker from '../../components/DateTimePicker.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import '../../styles/AvailableMockBoardExam.css';

// [FIX 1 - REMOVE HARDCODED URL]
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

function canScheduleResultsRelease(exam) {
  if (exam.status !== 'finished') return false;
  if (exam.resultsUploaded === true || exam.computationStatus === 'computed') return false;
  if (exam.resultsReleased === true) return false;
  return true;
}

function sameExamId(a, b) {
  return String(a) === String(b);
}

export default function AvailableMockBoardExams({ refreshKey, onEditExam }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState(null);
  const [schedulingExamId, setSchedulingExamId] = useState(null);
  const [confirmationModal, setConfirmationModal] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);

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
      setExams((prev) => prev.filter((e) => e._id !== exam._id));
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
    setConfirmationModal({
      type: 'publish',
      exam,
      title: 'Publish Draft Exam',
      message: (
        <p style={{ margin: 0 }}>
          Publish <strong>{exam.name}</strong>? This will make it available to students.
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
        body: { status: 'published' }
      });
      updateExamStatus(exam._id, 'published');
      setFeedbackModal({
        title: 'Exam Published',
        tone: 'success',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> is now live for students.
          </p>
        ),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Publish Failed',
        tone: 'danger',
        message: err.message || 'Failed to publish exam.',
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
      setExams((prev) => prev.map((e) => (
        sameExamId(e._id, examId)
          ? {
            ...e,
            resultsReleaseDate: savedReleaseDate,
            resultsReleased: false,
            resultsUploaded: e.resultsUploaded,
          }
          : e
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
    if (exam.status === 'published') {
      setConfirmationModal({
        type: 'editPublished',
        exam,
        title: 'Edit Published Exam',
        message: (
          <p style={{ margin: 0 }}>
            Editing <strong>{exam.name}</strong> will turn it back into a draft and take it offline first.
          </p>
        ),
        confirmLabel: 'Turn to Draft',
        confirmVariant: 'primary',
      });
      return;
    }

    onEditExam(exam._id);
  }

  async function confirmEditPublished(exam) {
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}`, {
        method: 'PATCH',
        body: { status: 'draft' }
      });
      updateExamStatus(exam._id, 'draft');
      setFeedbackModal({
        title: 'Published Exam Reverted to Draft',
        tone: 'warning',
        dismissLabel: 'Continue to Edit',
        message: (
          <p style={{ margin: 0 }}>
            <strong>{exam.name}</strong> was taken offline and moved back to draft so it can be edited safely.
          </p>
        ),
        onClose: () => onEditExam(exam._id),
      });
    } catch (err) {
      setFeedbackModal({
        title: 'Unable to Edit Published Exam',
        tone: 'danger',
        message: err.message || 'Failed to revert the exam to draft.',
      });
    }
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
      } else if (type === 'editPublished') {
        await confirmEditPublished(exam);
      }
    } finally {
      setModalBusy(false);
    }
  }

  async function handleView(examId) {
    // If the same exam is clicked again → close details
    if (selectedExam?._id === examId) {
      setSelectedExam(null);
      return;
    }

    // Otherwise fetch full exam details
    try {
      const data = await apiAuth(
        `${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`
      );
      setSelectedExam(data.exam || null);
    } catch (err) {
      setFeedbackModal({
        title: 'Unable to Load Exam Details',
        tone: 'danger',
        message: err.message || 'Failed to load exam details.',
      });
    }
  }

  return (
    <main className="ambe-page">
      <header className="page-header">
        <h1 className="page-header-title">Available Mock Board Exams</h1>
        <p className="page-header-subtitle">
          This page lists the mock board exams created by the dean for
          department programs.
        </p>
      </header>

      {/* ── CONTENT ─────────────────────── */}
      {loading && <p className="ambe-loading">Loading mock board exams…</p>}

      {!loading && exams.length === 0 && (
        <p className="ambe-empty">No mock board exams found.</p>
      )}

      {!loading && exams.length > 0 && (
        <div className="ambe-table-card">
          <div className="ambe-scroll-x">
            <table className="ambe-table">
              <thead>
                <tr>
                  <th>Exam Name</th>
                  <th>Program</th>
                  <th>Subjects</th>
                  <th>Exam Start</th>
                  <th>Duration</th>
                  <th>Questions</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((exam) => (
                  <tr key={exam._id}>
                    <td>{exam.name}</td>

                    <td>
                      <span className="ambe-pill program">
                        {exam.program?.name ||
                          exam.program?.code ||
                          '-'}
                      </span>
                    </td>

                    <td>
                      {(exam.subjectTags || []).length > 0 ? (
                        exam.subjectTags.map((tag) => (
                          <span
                            key={tag._id || tag.name}
                            className="ambe-pill subject"
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="ambe-muted">–</span>
                      )}
                    </td>

                    <td className="ambe-muted">
                      {formatDateTime(exam.startDateTime)}
                    </td>
                    <td className="ambe-muted">
                      {exam.durationMinutes || 0} mins
                    </td>

                    <td>{exam.questions?.length || 0}</td>

                    <td>
                      <span className={`ambe-status ${exam.status}`}>
                        {exam.status}
                      </span>
                      {exam.resultsReleaseDate && (
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
                          Details
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

                        {exam.status !== 'finished' && exam.status !== 'archived' && (
                          <button
                            type="button"
                            className="ambe-btn primary"
                            onClick={() => onEditExam(exam._id, 'testRun')}
                          >
                            Test Run
                          </button>
                        )}

                        {exam.status !== 'finished' && exam.status !== 'archived' && (
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

                        {exam.status === 'finished' && (
                          <button
                            type="button"
                            className="ambe-btn archive"
                            onClick={() => handleArchive(exam)}
                          >
                            Archive
                          </button>
                        )}

                        {exam.status === 'archived' && (
                          <button
                            type="button"
                            className="ambe-btn delete"
                            onClick={() => handleDelete(exam)}
                          >
                            Delete
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
      )}

      {/* ── DETAILS ─────────────────────── */}
      {selectedExam && (
        <section className="ambe-details">
          {/* ── Header Row ───────────────── */}
          <div className="ambe-details-header-new">
            <div className="header-left">
              <h2 className="ambe-details-name">{selectedExam.name}</h2>
              <div className="ambe-details-program">
                {selectedExam.program?.name || '-'}
              </div>
            </div>

            <div className="header-right">
              <div className="ambe-status-pill">
                <span className={`ambe-status ${selectedExam.status}`}>
                  {selectedExam.status?.toUpperCase()}
                </span>
              </div>
            </div>
          </div>


          {/* ── Instructions ─────────────── */}
          <div className="ambe-details-instructions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <h4>Description</h4>
              <p>{selectedExam.description || 'No description'}</p>
            </div>
            <div>
              <h4>Instructions</h4>
              <p>{selectedExam.instructions || 'None'}</p>
            </div>
          </div>

          <div className="ambe-details-instructions" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', borderTop: 'none', paddingTop: 0 }}>
            <div>
              <h4>Exam Start</h4>
              <p>{formatDateTime(selectedExam.startDateTime)}</p>
            </div>
            <div>
              <h4>Exam End</h4>
              <p>{formatDateTime(selectedExam.endDateTime)}</p>
            </div>
            <div>
              <h4>Duration</h4>
              <p>{selectedExam.durationMinutes || 0} minutes</p>
            </div>
            <div>
              <h4>Passing Threshold</h4>
              <p>{selectedExam.passingThreshold || 0}%</p>
            </div>
            <div>
              <h4>Total Items</h4>
              <p>{(selectedExam.questions || []).length} items</p>
            </div>
            <div>
              <h4>Subjects</h4>
              <p>{(selectedExam.subjectTags || []).length} subjects</p>
            </div>
          </div>

          {/* ── Questions ────────────────── */}
          <div className="ambe-questions-container">
            <h3>Questions</h3>

            {(selectedExam.questions || []).length === 0 && (
              <p className="ambe-muted">No questions found.</p>
            )}

            {(selectedExam.questions || []).length > 0 && (
              <table className="ambe-subtable">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Description</th>
                    <th>Subject</th>
                    <th>Answers</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedExam.questions.map((question) => (
                    <tr key={question._id}>
                      <td>{question.title}</td>
                      <td>{question.description}</td>
                      <td>
                        {question.tag && question.tag.name ? (
                          <span className="ambe-pill subject">
                            {question.tag.name}
                          </span>
                        ) : (
                          <span className="ambe-muted">–</span>
                        )}
                      </td>
                      <td>
                        <ul className="ambe-answers">
                          {(organizeQuestionAnswers(question).answers || []).map(
                            (answer) => (
                              <li
                                key={
                                  answer._id ||
                                  `${answer.optionLabel}-${answer.text}`
                                }
                              >
                                {answer.optionLabel} {answer.text}{' '}
                                {answer.isCorrect && (
                                  <span className="ambe-correct">
                                    (Correct)
                                  </span>
                                )}
                              </li>
                            )
                          )}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {schedulingExamId && (() => {
        const schedulingExam = exams.find((e) => e._id === schedulingExamId);
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
