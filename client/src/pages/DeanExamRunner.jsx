import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { organizeExamQuestionsAndAnswers } from '../lib/QuestionOrganizer.js';

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

function getModeTitle(mode) {
  if (mode === 'preview') return 'Preview Exam';
  if (mode === 'testRun') return 'Test Run Exam';
  return 'Exam Details';
}

export default function DeanExamRunner({ examId, mode = 'details', onBack }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    async function fetchExam() {
      if (!examId) {
        setExam(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
        const nextExam = data.exam
          ? {
              ...data.exam,
              questions:
                mode === 'details'
                  ? organizeExamQuestionsAndAnswers(data.exam.questions || [])
                  : organizeExamQuestionsAndAnswers(data.exam.questions || [], { randomize: true }),
            }
          : null;
        setExam(nextExam);
        setAnswers({});
        setSubmitted(false);
        setCurrentQuestionIndex(0);
      } catch (err) {
        alert(err.message || 'Failed to load exam.');
      } finally {
        setLoading(false);
      }
    }

    fetchExam();
  }, [examId, mode]);

  const score = useMemo(() => {
    if (!exam) return { correct: 0, total: 0 };

    let correct = 0;
    const total = (exam.questions || []).length;
    for (const question of exam.questions || []) {
      const selectedAnswerId = answers[question._id];
      if (!selectedAnswerId) continue;
      const matched = (question.answers || []).find((answer) => String(answer._id) === String(selectedAnswerId));
      if (matched?.isCorrect) correct += 1;
    }

    return { correct, total };
  }, [answers, exam]);

  function handleSelect(questionId, answerId) {
    if (mode !== 'testRun' || submitted) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answerId }));
  }

  const questions = exam?.questions || [];
  const currentQuestion = questions[currentQuestionIndex] || null;

  function restartTestRun() {
    if (!exam) return;
    setExam((prev) => (
      prev
        ? {
            ...prev,
            questions: organizeExamQuestionsAndAnswers(prev.questions || [], { randomize: true }),
          }
        : prev
    ));
    setAnswers({});
    setSubmitted(false);
    setCurrentQuestionIndex(0);
  }

  function renderAnswers(question) {
    return (
      <div>
        {(question.answers || []).map((answer, index) => {
          const checked = String(answers[question._id] || '') === String(answer._id);

          if (mode === 'testRun') {
            return (
              <label key={answer._id || `${question._id}-${index}`} style={{ display: 'block', marginBottom: '8px' }}>
                <input
                  type="radio"
                  name={`question-${question._id}`}
                  checked={checked}
                  disabled={submitted}
                  onChange={() => handleSelect(question._id, answer._id)}
                />{' '}
                {answer.optionLabel} {answer.text}
                {submitted ? ` ${answer.isCorrect ? '(Correct Answer)' : checked ? '(Your Answer)' : ''}` : ''}
              </label>
            );
          }

          return (
            <div key={answer._id || `${question._id}-${index}`} style={{ marginBottom: '8px' }}>
              {answer.optionLabel} {answer.text}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <main>
      <h1>{getModeTitle(mode)}</h1>
      <p>
        {mode === 'details'
          ? 'Review the stored mock board exam record and its included questions.'
          : mode === 'preview'
            ? 'Review how the exam content will appear before it is used.'
            : 'Take the exam in a dean-only test mode to verify the student-facing flow.'}
      </p>

      <div>
        <button type="button" onClick={onBack}>
          Back to Available Mock Board Exams
        </button>
      </div>

      {loading ? <p>Loading exam...</p> : null}
      {!loading && !exam ? <p>Exam not found.</p> : null}

      {exam ? (
        <>
          <section>
            <h2>{exam.name}</h2>
            <p>
              <strong>Program:</strong> {exam.program?.name || '-'}
            </p>
            <p>
              <strong>Subjects:</strong> {(exam.subjectTags || []).map((tag) => tag.name).join(', ') || '-'}
            </p>
            <p>
              <strong>Availability Start:</strong> {formatDateTime(exam.availabilityStart)}
            </p>
            <p>
              <strong>Availability End:</strong> {formatDateTime(exam.availabilityEnd)}
            </p>
            <p>
              <strong>Status:</strong> {exam.status}
            </p>
            <p>
              <strong>Instructions:</strong> {exam.instructions || 'None'}
            </p>
            <p>
              <strong>Total Questions:</strong> {exam.questions?.length || 0}
            </p>
          </section>

          {(mode === 'testRun' && !submitted) ? (
            <section>
              <button type="button" onClick={() => setSubmitted(true)}>
                Submit Test Run
              </button>
            </section>
          ) : null}

          {(mode === 'testRun' && submitted) ? (
            <section>
              <h3>Test Run Result</h3>
              <p>
                Score: {score.correct} / {score.total}
              </p>
              <button
                type="button"
                onClick={restartTestRun}
              >
                Restart Test Run
              </button>
            </section>
          ) : null}

          {mode === 'details' ? (
            <section>
              <h3>Questions</h3>
              {questions.length === 0 ? <p>No questions found.</p> : null}
              {questions.map((question, index) => (
                <article key={question._id} style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #ddd' }}>
                  <h4>
                    {index + 1}. {question.title}
                  </h4>
                  <p>{question.description}</p>
                  <p>
                    <strong>Subject:</strong> {question.tag?.name || '-'}
                  </p>

                  {question.images?.length ? (
                    <div>
                      <strong>Images:</strong>
                      <ul>
                        {question.images.map((image, imageIndex) => (
                          <li key={`${question._id}-image-${imageIndex}`}>
                            <a href={image.startsWith('/') ? `${BASE}${image}` : image} target="_blank" rel="noreferrer">
                              Image {imageIndex + 1}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <strong>Answers:</strong>
                    {renderAnswers(question)}
                  </div>
                </article>
              ))}
            </section>
          ) : (
            <section>
              <h3>Questions</h3>
              {questions.length === 0 ? <p>No questions found.</p> : null}

              {questions.length > 0 ? (
                <>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    {questions.map((question, index) => (
                      <button
                        key={question._id}
                        type="button"
                        onClick={() => setCurrentQuestionIndex(index)}
                        style={{
                          padding: '8px 12px',
                          fontWeight: currentQuestionIndex === index ? '700' : '500',
                        }}
                      >
                        Q{index + 1}
                      </button>
                    ))}
                  </div>

                  {currentQuestion ? (
                    <article style={{ marginBottom: '24px', paddingBottom: '24px', borderBottom: '1px solid #ddd' }}>
                      <h4>
                        Question {currentQuestionIndex + 1} of {questions.length}: {currentQuestion.title}
                      </h4>
                      <p>{currentQuestion.description}</p>
                      <p>
                        <strong>Subject:</strong> {currentQuestion.tag?.name || '-'}
                      </p>

                      {currentQuestion.images?.length ? (
                        <div>
                          <strong>Images:</strong>
                          <ul>
                            {currentQuestion.images.map((image, imageIndex) => (
                              <li key={`${currentQuestion._id}-image-${imageIndex}`}>
                                <a href={image.startsWith('/') ? `${BASE}${image}` : image} target="_blank" rel="noreferrer">
                                  Image {imageIndex + 1}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div>
                        <strong>{mode === 'testRun' ? 'Choose an answer:' : 'Answers:'}</strong>
                        {renderAnswers(currentQuestion)}
                      </div>

                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        <button
                          type="button"
                          disabled={currentQuestionIndex === 0}
                          onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          disabled={currentQuestionIndex === questions.length - 1}
                          onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                        >
                          Next
                        </button>
                      </div>
                    </article>
                  ) : null}
                </>
              ) : null}
            </section>
          )}
        </>
      ) : null}
    </main>
  );
}
