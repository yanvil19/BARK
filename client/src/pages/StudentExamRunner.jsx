import { useEffect, useState, useRef } from 'react';
import { apiAuth } from '../lib/api.js';
import '../styles/MockBoardExamPreview.css'; 

const BASE = 'http://localhost:5000';

export default function StudentExamRunner({ examId, onFinish }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); 
  
  const [examEndDateTime, setExamEndDateTime] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    async function startOrResumeExam() {
      try {
        const data = await apiAuth(`${BASE}/api/student-exams/${encodeURIComponent(examId)}/start`, { method: 'POST' });
        
        setExamInfo(data.exam);
        setQuestions(data.questions);
        setAttemptId(data.attemptId);
        setAnswers(data.answers || {});
        
        setExamEndDateTime(new Date(data.endDateTime));
        setTimeRemaining(data.remainingTimeSeconds);
        
      } catch (err) {
        setError(err.message || 'Failed to start exam. The window may be closed.');
      } finally {
        setLoading(false);
      }
    }
    startOrResumeExam();
  }, [examId]);

  // Timer logic strictly based on endDateTime - now()
  useEffect(() => {
    if (!examEndDateTime || loading || submitting || error) return;

    const interval = setInterval(() => {
      const now = new Date();
      const remaining = Math.floor((examEndDateTime - now) / 1000);

      if (remaining <= 0) {
        clearInterval(interval);
        handleAutoSubmit();
        return;
      }

      setTimeRemaining(remaining);
    }, 1000);

    return () => clearInterval(interval);
  }, [examEndDateTime, loading, submitting, error]);

  const formatTimer = (seconds) => {
    if (seconds <= 0) return '0:00:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSelect = (questionId, answerId) => {
    if (submitting) return;

    const newAnswers = { ...answers, [questionId]: answerId };
    setAnswers(newAnswers);

    // Debounced Auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await apiAuth(`${BASE}/api/student-exams/attempt/${attemptId}/progress`, {
          method: 'PATCH',
          body: { answers: newAnswers }
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 2000);
  };

  const submitFinal = async (finalAnswers) => {
    setSubmitting(true);
    try {
      await apiAuth(`${BASE}/api/student-exams/attempt/${attemptId}/submit`, {
        method: 'POST',
        body: { answers: finalAnswers }
      });
      onFinish();
    } catch (err) {
      alert(err.message || 'Failed to submit exam.');
      setSubmitting(false);
    }
  };

  const handleManualSubmit = () => {
    if (window.confirm('Are you sure you want to submit your exam? You cannot change your answers after this.')) {
      submitFinal(answers);
    }
  };

  const handleAutoSubmit = () => {
    alert('Time is up! Your exam will now be automatically submitted.');
    submitFinal(answers);
  };

  if (loading) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Exam...</h3></div></div>;
  if (error) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error}</div></div>;

  const currentQuestion = questions[currentIdx];
  const progressPercent = questions.length > 0 ? ((currentIdx + 1) / questions.length) * 100 : 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="mbep-page">
      <header className="mbep-header">
        <div className="mbep-header-info">
          <h1 className="mbep-title">{examInfo?.name}</h1>
          <p className="mbep-subtitle">{examInfo?.description || 'Mock Board Exam'}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="mbep-exit-btn" onClick={handleManualSubmit} style={{ background: 'var(--primary-bg)', color: 'var(--accent-yellow)' }} disabled={submitting}>
            {submitting ? 'Submitting...' : '+ Submit Exam'}
          </button>
        </div>
      </header>

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
          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: timeRemaining < 300 ? 'red' : 'var(--primary-bg)' }}>
            {formatTimer(timeRemaining)}
          </span>
        </div>
      </div>

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
                {(currentQuestion.answers || []).map((answer, i) => {
                  const isSelected = String(answers[currentQuestion._id]) === String(answer._id);
                  let optionClass = "mbep-option";
                  if (isSelected) optionClass += " is-selected-preview"; 

                  return (
                    <div 
                      key={answer._id} 
                      className={optionClass}
                      onClick={() => handleSelect(currentQuestion._id, answer._id)}
                    >
                      <div className="mbep-option-circle">{String.fromCharCode(97 + i)}.</div>
                      <div className="mbep-option-text">{answer.text}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        ) : null}

        <div className="mbep-navigator-wrap">
          <div className="mbep-nav-bar">
            {questions.map((q, i) => {
               const isAnswered = !!answers[q._id];
               let dotClass = "mbep-nav-circle";
               if (currentIdx === i) dotClass += " active";
               else if (isAnswered) dotClass += " is-answered-preview";

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
