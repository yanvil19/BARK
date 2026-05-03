import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { organizeQuestionAnswers } from '../lib/DeanTestRunOrganizer.js';
import '../styles/AvailableMockBoardExam.css';

const BASE = 'http://localhost:5000';

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

export default function AvailableMockBoardExams({ refreshKey, onEditExam }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedExam, setSelectedExam] = useState(null);

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

  async function handleDelete(exam) {
    if (!window.confirm(`Delete mock board exam "${exam.name}"?`)) return;
    try {
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}`, {
        method: 'DELETE',
      });
      setExams((prev) => prev.filter((e) => e._id !== exam._id));
      if (selectedExam?._id === exam._id) setSelectedExam(null);
    } catch (err) {
      alert(err.message || 'Failed to delete mock board exam.');
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
      alert(err.message || 'Failed to load exam details.');
    }
  }

  return (
    <main className="ambe-page">
      {/* ── HEADER ───────────────────────── */}
      <header className="ambe-page-header">
        <div className="ambe-header">
          <div className="ambe-header-left">
            <h1 className="ambe-title">Available Mock Board Exams</h1>
            <p className="ambe-subtitle">
              This page lists the mock board exams created by the dean for
              department programs.
            </p>
          </div>
        </div>
      </header>

      {/* ── CONTENT ─────────────────────── */}
      {loading && <p className="ambe-loading">Loading mock board exams…</p>}

      {!loading && exams.length === 0 && (
        <p className="ambe-empty">No mock board exams found.</p>
      )}

      {!loading && exams.length > 0 && (
        <div className="ambe-table-card">
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

                      <button
                        type="button"
                        className="ambe-btn primary"
                        onClick={() =>
                          onEditExam(exam._id, 'preview')
                        }
                      >
                        Preview
                      </button>

                      <button
                        type="button"
                        className="ambe-btn primary"
                        onClick={() =>
                          onEditExam(exam._id, 'testRun')
                        }
                      >
                        Test Run
                      </button>

                      <button
                        type="button"
                        className="ambe-btn primary"
                        onClick={() => onEditExam(exam._id)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="ambe-btn delete"
                        onClick={() => handleDelete(exam)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <div className="duration-block">
                <span className="label">DURATION</span>
                <span className="value">
                  {selectedExam.durationMinutes || 0} minutes
                </span>
              </div>

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

          <div className="ambe-details-instructions" style={{ borderTop: 'none', paddingTop: 0 }}>
             <h4>Duration</h4>
             <p>{selectedExam.durationMinutes || 0} minutes</p>
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
    </main>
  );
}