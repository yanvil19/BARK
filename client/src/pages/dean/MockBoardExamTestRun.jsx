import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { organizeExamQuestionsAndAnswers } from '../lib/DeanTestRunOrganizer.js';
import '../styles/MockBoardExamPreview.css'; // Reusing the established premium style

const BASE = 'http://localhost:5000';

export default function MockBoardExamTestRun({ examId, onBack }) {
  const [exam, setExam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { questionId: answerId }
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(2 * 60 * 60 + 30 * 60); // 2:30:00

  // Fetch and randomize questions for Test Run
  useEffect(() => {
    async function fetchExam() {
      if (!examId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(examId)}`);
        if (data.exam) {
          const questions = organizeExamQuestionsAndAnswers(data.exam.questions || [], { randomize: true });
          setExam({
            ...data.exam,
            questions
          });
          if (data.exam.duration) {
            setTimeLeft(data.exam.duration * 60);
          }
        } else {
          setError('Exam not found.');
        }
      } catch (err) {
        setError(err.message || 'Failed to load exam test run.');
      } finally {
        setLoading(false);
      }
    }
    fetchExam();
  }, [examId]);

  // Timer logic
  useEffect(() => {
    if (submitted || loading || error || !exam) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [submitted, loading, error, exam]);

  const formatTimer = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const score = useMemo(() => {
    if (!exam || !submitted) return { correct: 0, total: 0 };
    let correct = 0;
    const total = exam.questions?.length || 0;
    exam.questions.forEach(q => {
      const selectedId = answers[q._id];
      const correctOption = q.answers?.find(a => a.isCorrect);
      if (selectedId && String(selectedId) === String(correctOption?._id)) {
        correct++;
      }
    });
    return { correct, total };
  }, [answers, exam, submitted]);

  const handleSelect = (questionId, answerId) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionId]: answerId }));
  };

  const handleSubmit = () => {
    if (window.confirm('Are you sure you want to submit your exam?')) {
      setSubmitted(true);
      setCurrentIdx(0); // Go back to start to review results
    }
  };

  if (loading) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Test Run...</h3></div></div>;
  if (error || !exam) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error || 'Exam not found'}</div></div>;

  const questions = exam.questions || [];
  const currentQuestion = questions[currentIdx];
  const progressPercent = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="mbep-page">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="mbep-header">
        <div className="mbep-header-info">
          <h1 className="mbep-title">{exam.name} {submitted && <span style={{ color: '#22c55e' }}>(Result)</span>}</h1>
          <p className="mbep-subtitle">
            {exam.description || `Dean Test Run Mode • ${exam.program?.name}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!submitted && (
            <button className="mbep-exit-btn" onClick={handleSubmit} style={{ background: 'var(--primary-bg)', color: 'var(--accent-yellow)' }}>
              + Submit Exam
            </button>
          )}
          <button className="mbep-exit-btn" onClick={onBack}>
            Exit Test Run
          </button>
        </div>
      </header>

      {/* ── Stats Bar (Progress & Timer) ───────────────────────── */}
      <div className="mbep-stats" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px' }}>
        <div className="mbep-progress-card">
          <div className="mbep-progress-info">
            <span>Progress ({answeredCount} answered)</span>
            <span>{currentIdx + 1} / {questions.length}</span>
          </div>
          <div className="mbep-progress-bar">
            <div className="mbep-progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>
        <div className="mbep-progress-card" style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-bg)' }}>
            {formatTimer(timeLeft)}
          </span>
        </div>
      </div>

      {/* ── Result Banner ──────────────────────────────────────── */}
      {submitted && (
        <div className="mbep-stats" style={{ marginTop: '12px' }}>
          <div className="mbep-progress-card" style={{ background: '#f0fdf4', borderColor: '#22c55e', textAlign: 'center' }}>
             <h2 style={{ margin: 0, color: '#166534', fontFamily: 'var(--font-title)' }}>
                Your Score: {score.correct} / {score.total} ({( (score.correct / score.total) * 100 ).toFixed(1)}%)
             </h2>
             <p style={{ margin: '8px 0 0', color: '#15803d', fontSize: '14px' }}>Review your answers below. Correct answers are highlighted in green.</p>
          </div>
        </div>
      )}

      {/* ── Question Area ───────────────────────────────────────── */}
      <main className="mbep-content">
        {currentQuestion ? (
          <article className="mbep-card">
            <div className="mbep-card-top">
              <h4>Question {currentIdx + 1}</h4>
            </div>
            <div className="mbep-card-body">
              <div className="mbep-question-title">{currentQuestion.title}</div>

              {currentQuestion.images?.length > 0 && (
                <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {currentQuestion.images.map((img, i) => (
                    <img key={i} src={img.startsWith('/') ? `${BASE}${img}` : img} alt="Ref" style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '8px' }} />
                  ))}
                </div>
              )}

              <div className="mbep-options">
                {(currentQuestion.answers || []).map((answer) => {
                  const isSelected = String(answers[currentQuestion._id]) === String(answer._id);
                  const showCorrect = submitted && answer.isCorrect;
                  const showWrong = submitted && isSelected && !answer.isCorrect;

                  let optionClass = "mbep-option";
                  if (isSelected && !submitted) optionClass += " is-selected-preview"; // Custom class for selection
                  if (showCorrect) optionClass += " is-correct";
                  if (showWrong) optionClass += " is-wrong-preview"; // Custom class for wrong

                  return (
                    <div 
                      key={answer._id} 
                      className={optionClass}
                      onClick={() => handleSelect(currentQuestion._id, answer._id)}
                      style={{ cursor: submitted ? 'default' : 'pointer' }}
                    >
                      <div className="mbep-option-circle">{answer.optionLabel}</div>
                      <div className="mbep-option-text">{answer.text}</div>
                      {showCorrect && <span style={{ marginLeft: 'auto', color: '#22c55e', fontWeight: 700, fontSize: '12px' }}>CORRECT</span>}
                      {showWrong && <span style={{ marginLeft: 'auto', color: '#dc2626', fontWeight: 700, fontSize: '12px' }}>YOUR ANSWER</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ) : null}

        {/* ── Navigation ────────────────────────────────────────── */}
        <div className="mbep-navigator-wrap">
          <div className="mbep-nav-bar">
            {questions.map((q, i) => {
               const isAnswered = !!answers[q._id];
               let dotClass = "mbep-nav-circle";
               if (currentIdx === i) dotClass += " active";
               else if (isAnswered && !submitted) dotClass += " is-answered-preview";

               return (
                <button key={i} className={dotClass} onClick={() => setCurrentIdx(i)}>
                  {i + 1}
                </button>
               );
            })}
          </div>

          <div className="mbep-nav-actions">
            <button className="mbep-btn-nav" onClick={() => setCurrentIdx(p => Math.max(0, p - 1))} disabled={currentIdx === 0}>
              ← Previous
            </button>
            <button className="mbep-btn-nav" onClick={() => setCurrentIdx(p => Math.min(questions.length - 1, p + 1))} disabled={currentIdx === questions.length - 1}>
              Next →
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
