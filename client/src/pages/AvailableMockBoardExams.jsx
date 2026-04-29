import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { organizeQuestionAnswers } from '../lib/QuestionOrganizer.js';

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
      await apiAuth(`${BASE}/api/mock-board-exams/${exam._id}`, { method: 'DELETE' });
      setExams((prev) => prev.filter((item) => item._id !== exam._id));
      if (selectedExam?._id === exam._id) setSelectedExam(null);
    } catch (err) {
      alert(err.message || 'Failed to delete mock board exam.');
    }
  }

  async function handleView(examId) {
    try {
      const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
      setSelectedExam(data.exam || null);
    } catch (err) {
      alert(err.message || 'Failed to load exam details.');
    }
  }

  return (
    <main>
      <h1>Available Mock Board Exams</h1>
      <p>This page lists the mock board exams created by the dean for department programs.</p>

      {loading ? <p>Loading mock board exams...</p> : null}
      {!loading && exams.length === 0 ? <p>No mock board exams found.</p> : null}

      {!loading && exams.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Exam Name</th>
              <th>Program</th>
              <th>Subjects</th>
              <th>Availability</th>
              <th>Questions</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam._id}>
                <td>{exam.name}</td>
                <td>{exam.program?.name || exam.program?.code || '-'}</td>
                <td>{(exam.subjectTags || []).map((tag) => tag.name).join(', ') || '-'}</td>
                <td>
                  {formatDateTime(exam.availabilityStart)}
                  <br />
                  to
                  <br />
                  {formatDateTime(exam.availabilityEnd)}
                </td>
                <td>{exam.questions?.length || 0}</td>
                <td>{exam.status}</td>
                <td>
                  <button type="button" onClick={() => handleView(exam._id)}>
                    Details
                  </button>{' '}
                  <button type="button" onClick={() => onEditExam(exam._id, 'preview')}>
                    Preview
                  </button>{' '}
                  <button type="button" onClick={() => onEditExam(exam._id, 'testRun')}>
                    Test Run
                  </button>{' '}
                  <button type="button" onClick={() => onEditExam(exam._id)}>
                    Edit
                  </button>{' '}
                  <button type="button" onClick={() => handleDelete(exam)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {selectedExam ? (
        <section>
          <h2>Exam Details</h2>
          <p>
            <strong>Name:</strong> {selectedExam.name}
          </p>
          <p>
            <strong>Program:</strong> {selectedExam.program?.name || '-'}
          </p>
          <p>
            <strong>Subjects:</strong> {(selectedExam.subjectTags || []).map((tag) => tag.name).join(', ') || '-'}
          </p>
          <p>
            <strong>Availability Start:</strong> {formatDateTime(selectedExam.availabilityStart)}
          </p>
          <p>
            <strong>Availability End:</strong> {formatDateTime(selectedExam.availabilityEnd)}
          </p>
          <p>
            <strong>Status:</strong> {selectedExam.status}
          </p>
          <p>
            <strong>Instructions:</strong> {selectedExam.instructions || 'None'}
          </p>

          <h3>Questions</h3>
          {(selectedExam.questions || []).length === 0 ? <p>No questions found.</p> : null}
          {(selectedExam.questions || []).length > 0 ? (
            <table>
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
                    <td>{question.tag?.name || '-'}</td>
                    <td>
                      <ul>
                        {(organizeQuestionAnswers(question).answers || []).map((answer) => (
                          <li key={answer._id || answer.text}>
                            {answer.optionLabel} {answer.text} {answer.isCorrect ? '(Correct)' : ''}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
