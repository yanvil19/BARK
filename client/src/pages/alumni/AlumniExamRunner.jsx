import { useEffect, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import '../../styles/shared/MockBoardExamPreview.css';
import PageHeader from '../../components/PageHeader.jsx';

const BASE = import.meta.env.VITE_API_URL;

export default function AlumniExamRunner({ examId, onFinish, me }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [examInfo, setExamInfo] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [attemptId, setAttemptId] = useState(null);
  const [attemptNumber, setAttemptNumber] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const isSubmittingRef = useRef(false);

  useEffect(() => {
    async function startOrResumeExam() {
      try {
        const data = await apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(examId)}/start`, { method: 'POST' });
        setExamInfo(data.exam);
        setQuestions(data.questions);
        setAttemptId(data.attemptId);
        setAttemptNumber(data.attemptNumber);
        setTimeRemaining(data.remainingTimeSeconds ?? null);
        setAnswers(data.answers || {});
      } catch (err) {
        setError(err.message || 'Failed to start exam.');
      } finally {
        setLoading(false);
      }
    }
    startOrResumeExam();
  }, [examId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setZoomedImage(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = (questionId, answerId) => {
    if (submitting) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answerId }));
  };

  const submitFinal = async () => {
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      await apiAuth(`${BASE}/api/alumni-exams/attempt/${attemptId}/submit`, {
        method: 'POST',
        body: { answers },
      });
      onFinish();
    } catch (err) {
      isSubmittingRef.current = false;
      setFeedbackModal({
        title: 'Submission Failed',
        tone: 'danger',
        message: err.message || 'Failed to submit exam.',
      });
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (timeRemaining === null || loading || submitting || error || isSubmittingRef.current) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null) return null;
        return prev > 0 ? prev - 1 : 0;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [error, loading, submitting, timeRemaining]);

  useEffect(() => {
    if (timeRemaining !== 0 || submitting || isSubmittingRef.current || !attemptId) return;
    submitFinal();
  }, [attemptId, submitting, timeRemaining]);

  const formatTimer = (seconds) => {
    const total = Math.max(0, Number(seconds) || 0);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Exam...</h3></div></div>;
  if (error) return <div className="mbep-page"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error}</div></div>;

  const currentQuestion = questions[currentIdx];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const progressPercent = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const alumniName = me?.name || `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || 'Alumni';
  const identifier = `ALUMNI: ${alumniName.toUpperCase()}`;
  const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text transform="rotate(-15 100,50)" fill="black" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle"><tspan x="100" y="55">${identifier}</tspan></text></svg>`;
  const watermarkSvg = `data:image/svg+xml;base64,${btoa(svgString)}`;

  return (
    <>
      <div className="exam-watermark" style={{ backgroundImage: `url("${watermarkSvg}")` }} />

      <ConfirmationModal
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          submitFinal();
        }}
        title="Submit Exam"
        message="Are you sure you want to submit this attempt?"
        confirmLabel="Submit Exam"
        confirmVariant="primary"
        busy={submitting}
      />

      <FeedbackModal
        open={!!feedbackModal}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      <div className="mbep-page mbep-page-secure">
        <PageHeader
          className="shared-page-header--bleed-lr"
          title={examInfo?.name}
          subtitle={attemptNumber ? `Attempt ${attemptNumber}` : examInfo?.description || 'Alumni Exam'}
        >
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              className="mbep-exit-btn"
              onClick={() => setShowSubmitConfirm(true)}
              style={{ background: 'var(--primary-bg)', color: 'var(--accent-yellow)' }}
              disabled={submitting || isSubmittingRef.current}
            >
              {submitting ? 'Submitting...' : '+ Submit Exam'}
            </button>
          </div>
        </PageHeader>

        <div className="mbep-stats" style={{ display: 'grid', gridTemplateColumns: timeRemaining === null ? '1fr' : '1fr auto', gap: '20px' }}>
          <div className="mbep-progress-card">
            <div className="mbep-progress-info">
              <span>Progress ({answeredCount} answered)</span>
              <span>{currentIdx + 1} / {questions.length}</span>
            </div>
            <div className="mbep-progress-bar">
              <div className="mbep-progress-fill" style={{ width: `${progressPercent}%` }}></div>
            </div>
          </div>
          {timeRemaining !== null ? (
            <div className="mbep-progress-card" style={{ minWidth: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--primary-bg)' }}>
                {formatTimer(timeRemaining)}
              </span>
            </div>
          ) : null}
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
                      <img
                        key={i}
                        src={img.startsWith('/') ? `${BASE}${img}` : img}
                        alt="Ref"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '300px',
                          borderRadius: '8px',
                          cursor: 'zoom-in',
                        }}
                        onClick={() => {
                          const finalImage = img.startsWith('/') ? `${BASE}${img}` : img;
                          setZoomedImage(finalImage);
                          setZoomLevel(1);
                          setPosition({ x: 0, y: 0 });
                        }}
                      />
                    ))}
                  </div>
                )}

                <div className="mbep-options">
                  {(currentQuestion.answers || []).map((answer, i) => {
                    const isSelected = String(answers[currentQuestion._id]) === String(answer._id);
                    let optionClass = 'mbep-option';
                    if (isSelected) optionClass += ' is-selected-preview';

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
                let dotClass = 'mbep-nav-circle';
                if (currentIdx === i) dotClass += ' active';
                else if (isAnswered) dotClass += ' is-answered-preview';

                return (
                  <button key={q._id || i} className={dotClass} onClick={() => setCurrentIdx(i)}>
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <div className="mbep-nav-actions">
              <button className="mbep-btn-nav" onClick={() => setCurrentIdx((p) => Math.max(0, p - 1))} disabled={currentIdx === 0}>
                Previous
              </button>
              <button className="mbep-btn-nav" onClick={() => setCurrentIdx((p) => Math.min(questions.length - 1, p + 1))} disabled={currentIdx === questions.length - 1}>
                Next
              </button>
            </div>
          </div>
        </main>
      </div>

      {zoomedImage && (
        <div
          onClick={() => setZoomedImage(null)}
          onWheel={(e) => {
            e.preventDefault();
            setZoomLevel((prev) => {
              const next = e.deltaY < 0 ? prev + 0.2 : prev - 0.2;
              return Math.min(Math.max(next, 1), 4);
            });
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setZoomedImage(null);
            }}
            style={{
              position: 'absolute',
              top: '20px',
              left: '20px',
              zIndex: 4000,
              background: 'var(--primary-bg)',
              color: 'var(--accent-yellow)',
              border: 'none',
              fontSize: '28px',
              fontWeight: 'bold',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              cursor: 'pointer',
              transition: '0.2s',
            }}
          >
            X
          </button>

          <img
            src={zoomedImage}
            alt="Zoomed"
            draggable={false}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
              transition: dragging ? 'none' : 'transform 0.2s ease',
              borderRadius: '10px',
              boxShadow: '0 0 25px rgba(255,255,255,0.2)',
              cursor: zoomLevel > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
            }}
            onMouseDown={(e) => {
              if (zoomLevel > 1) {
                setDragging(true);
                setStartPos({
                  x: e.clientX - position.x,
                  y: e.clientY - position.y,
                });
              }
            }}
            onMouseMove={(e) => {
              if (!dragging) return;
              setPosition({
                x: e.clientX - startPos.x,
                y: e.clientY - startPos.y,
              });
            }}
            onMouseUp={() => setDragging(false)}
            onMouseLeave={() => setDragging(false)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
