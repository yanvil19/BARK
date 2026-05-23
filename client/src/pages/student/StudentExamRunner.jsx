import { useEffect, useState, useRef } from 'react';
import { apiAuth } from '../../lib/api.js';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import '../../styles/MockBoardExamPreview.css';

// [FIX 1 - REMOVE HARDCODED URL]
const BASE = import.meta.env.VITE_API_URL;

export default function StudentExamRunner({ examId, onFinish, me }) {
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

  const [isBlurred, setIsBlurred] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [autoSubmitModal, setAutoSubmitModal] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);

  const saveTimeoutRef = useRef(null);
  const finishTimeoutRef = useRef(null);

  const lastViolationTimeRef = useRef(0);
  const violationCountRef = useRef(0);
  const cleanupSecurityRef = useRef(null);
  const autoSubmitTriggeredRef = useRef(false);

  useEffect(() => {
    const triggerBlur = (reason = 'Unknown') => {
      const now = Date.now();
      if (now - lastViolationTimeRef.current < 500) return;
      lastViolationTimeRef.current = now;

      violationCountRef.current += 1;
      const newCount = violationCountRef.current;

      setViolationCount(newCount);

      if (newCount > 2 && attemptId) {
        apiAuth(`${BASE}/api/student-exams/attempt/${attemptId}/violation`, {
          method: 'POST',
          body: { type: 'window_blur_or_shortcut', reason }
        }).catch(err => console.error('Failed to log violation:', err));
      }

      setIsBlurred(true);
      setShowWarningModal(true);
    };

    const handleContextMenu = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      if (e.key === 'F12') {
        e.preventDefault();
        triggerBlur('F12 (Developer Tools)');
      }
      if ((e.ctrlKey || e.metaKey) && ['c', 'v', 's'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
      if (e.key === 'PrintScreen') {
        triggerBlur('PrintScreen (Screenshot)');
      }
      if ((e.metaKey || e.key === 'Meta') && e.shiftKey) {
        triggerBlur('Meta+Shift (Shortcut)');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) triggerBlur('Switched Tabs / Hidden Window');
    };

    const handleBlur = () => triggerBlur('Lost Window Focus');

    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    cleanupSecurityRef.current = () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };

    return () => cleanupSecurityRef.current?.();
  }, [attemptId]);

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

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
    };
  }, []);

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

  const submitFinal = async (finalAnswers, { autoSubmitted = false } = {}) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    setSubmitting(true);
    try {
      await apiAuth(`${BASE}/api/student-exams/attempt/${attemptId}/submit`, {
        method: 'POST',
        body: { answers: finalAnswers }
      });

      if (autoSubmitted) {
        setAutoSubmitModal({
          title: 'Time Is Up',
          tone: 'warning',
          message: 'Your exam time has ended. Your answers have been submitted automatically.',
        });

        finishTimeoutRef.current = setTimeout(() => {
          onFinish();
        }, 1200);
        return;
      }

      onFinish();
    } catch (err) {
      setFeedbackModal({
        title: 'Submission Failed',
        tone: 'danger',
        message: err.message || 'Failed to submit exam.',
      });
      setAutoSubmitModal(null);
      setSubmitting(false);
      autoSubmitTriggeredRef.current = false;
    }
  };

  const handleManualSubmit = () => {
    setShowSubmitConfirm(true);
  };

  const handleAutoSubmit = () => {
    if (submitting || autoSubmitTriggeredRef.current) return;

    autoSubmitTriggeredRef.current = true;
    cleanupSecurityRef.current?.();
    setAutoSubmitModal({
      title: 'Time Is Up',
      tone: 'warning',
      message: 'Your exam time has ended. Your answers are being submitted automatically.',
    });
    submitFinal(answers, { autoSubmitted: true });
  };

  if (loading) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Exam...</h3></div></div>;
  if (error) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error}</div></div>;

  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  const studentName = me?.name || `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Student';
  const identifier = `STUDENT: ${studentName.toUpperCase()}`;
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text transform="rotate(-15 100,50)" fill="black" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle"><tspan x="100" y="55">${identifier}</tspan></text></svg>`;
  const watermarkSvg = `data:image/svg+xml;base64,${btoa(svgString)}`;

  return (
    <>
      <div
        className="exam-watermark"
        style={{ backgroundImage: `url("${watermarkSvg}")` }}
      />

      {showWarningModal && (
        <div className="exam-security-modal-overlay">
          <div className="exam-security-modal-content">
            <h2 className="exam-security-modal-title">Security Warning</h2>
            <p className="exam-security-modal-text">
              {violationCount === 1
                ? "First Warning: You have navigated away from the exam window, switched tabs, or used a restricted shortcut. Please remain focused on the exam. Future violations will be recorded."
                : violationCount === 2
                  ? "Final Warning: You have navigated away from the exam window or used a restricted shortcut again. One more violation will be recorded."
                  : "You have navigated away from the exam window or used a restricted shortcut again. This action has been recorded."}
            </p>
            <button className="exam-security-modal-btn" onClick={() => { setIsBlurred(false); setShowWarningModal(false); }}>
              Return to Exam
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          submitFinal(answers);
        }}
        title="Submit Exam"
        message="Are you sure you want to submit your exam? You cannot change your answers after this."
        confirmLabel="Submit Exam"
        confirmVariant="primary"
        busy={submitting}
      />

      <FeedbackModal
        open={!!autoSubmitModal}
        onClose={() => {
          if (submitting) return;
          setAutoSubmitModal(null);
        }}
        title={autoSubmitModal?.title || 'Time Is Up'}
        tone={autoSubmitModal?.tone || 'warning'}
        message={autoSubmitModal?.message}
        showDismissButton={false}
      />

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      <div className={`mbep-page ${isBlurred ? 'mbep-page-blurred' : 'mbep-page-secure'}`}>
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
                <div className="mbep-question-title">
                  {currentQuestion.title}
                  {currentQuestion.description && (
                    <p style={{ marginTop: '12px', fontWeight: 400, color: '#6b7280', fontSize: '14px' }}>
                      {currentQuestion.description}
                    </p>
                  )}
                </div>

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
    </>
  );
}
