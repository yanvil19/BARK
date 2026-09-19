import AuthImage from '../../components/AuthImage.jsx';
import { useEffect, useRef, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import '../../styles/shared/MockBoardExamPreview.css';
import PageHeader from '../../components/PageHeader.jsx';
import {
  getOfflineExam,
  savePendingAttempt,
  getPendingAttempts,
  removePendingAttempt,
} from '../../lib/offlineDb.js';

const BASE = import.meta.env.VITE_API_URL || '';

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
  const saveTimeoutRef = useRef(null);

  const clientAttemptIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const answersRef = useRef({});
  const isOfflineExamRef = useRef(false);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    async function startOrResumeExam() {
      try {
        // 1. Check if exam is stored locally in IndexedDB first
        const offlineExam = await getOfflineExam(examId);

        if (offlineExam) {
          isOfflineExamRef.current = true;
          setExamInfo(offlineExam);
          setQuestions(offlineExam.questions || []);

          // Check if there is an in-progress offline attempt for this exam
          const pending = await getPendingAttempts();
          const inProgress = pending.find(
            (p) => String(p.examId) === String(examId) && p.status === 'in_progress'
          );

          if (inProgress) {
            clientAttemptIdRef.current = inProgress.clientAttemptId;
            startTimeRef.current = inProgress.startTime;
            setAnswers(inProgress.answers || {});
            answersRef.current = inProgress.answers || {};
            setTimeRemaining(inProgress.remainingTimeSeconds ?? null);
          } else {
            const newAttemptId = `offline_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            clientAttemptIdRef.current = newAttemptId;
            const startIso = new Date().toISOString();
            startTimeRef.current = startIso;
            const initTime =
              offlineExam.isTimed && offlineExam.timeLimitMinutes
                ? Number(offlineExam.timeLimitMinutes) * 60
                : null;
            setTimeRemaining(initTime);
            await savePendingAttempt({
              clientAttemptId: newAttemptId,
              examId,
              answers: {},
              startTime: startIso,
              remainingTimeSeconds: initTime,
              status: 'in_progress',
            });
          }
          setLoading(false);
          return;
        }

        // 2. If not stored locally and online, call server API
        if (navigator.onLine) {
          const data = await apiAuth(`${BASE}/api/alumni-exams/${encodeURIComponent(examId)}/start`, { method: 'POST' });
          setExamInfo(data.exam);
          setQuestions(data.questions);
          setAttemptId(data.attemptId);
          setAttemptNumber(data.attemptNumber);
          setTimeRemaining(data.remainingTimeSeconds ?? null);
          setAnswers(data.answers || {});
          answersRef.current = data.answers || {};
          clientAttemptIdRef.current = `online_${data.attemptId}`;
          startTimeRef.current = new Date().toISOString();
        } else {
          setError(
            'This exam has not been downloaded for offline use. Please connect to the internet and click "Download All for Offline" in Available Exams.'
          );
        }
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
    const newAnswers = { ...answers, [questionId]: answerId };
    setAnswers(newAnswers);
    answersRef.current = newAnswers;

    // Immediately persist in local IndexedDB
    if (clientAttemptIdRef.current) {
      savePendingAttempt({
        clientAttemptId: clientAttemptIdRef.current,
        examId,
        answers: newAnswers,
        startTime: startTimeRef.current,
        remainingTimeSeconds: timeRemaining,
        status: 'in_progress',
      }).catch(() => {});
    }

    // If online and have attemptId, also debounce save progress to server
    if (attemptId && navigator.onLine) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          await apiAuth(`${BASE}/api/alumni-exams/attempt/${attemptId}/progress`, {
            method: 'PATCH',
            body: { answers: newAnswers },
          });
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 2000);
    }
  };

  const submitFinal = async () => {
    isSubmittingRef.current = true;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setSubmitting(true);

    const endTime = new Date().toISOString();
    const elapsedDurationSeconds = startTimeRef.current
      ? Math.max(1, Math.round((new Date(endTime).getTime() - new Date(startTimeRef.current).getTime()) / 1000))
      : null;

    const offlineAttemptPayload = {
      clientAttemptId: clientAttemptIdRef.current || `offline_${Date.now()}`,
      examId,
      answers: answersRef.current,
      startTime: startTimeRef.current || endTime,
      endTime,
      elapsedDurationSeconds,
      status: 'completed',
    };

    // Always persist to local IndexedDB pending queue first
    await savePendingAttempt(offlineAttemptPayload);
    window.dispatchEvent(new CustomEvent('offline-attempt-queued'));

    // If online, attempt instant sync
    if (navigator.onLine) {
      try {
        if (attemptId && !isOfflineExamRef.current) {
          await apiAuth(`${BASE}/api/alumni-exams/attempt/${attemptId}/submit`, {
            method: 'POST',
            body: { answers: answersRef.current },
          });
          await removePendingAttempt(offlineAttemptPayload.clientAttemptId);
        } else {
          await apiAuth(`${BASE}/api/alumni-exams/offline-sync`, {
            method: 'POST',
            body: offlineAttemptPayload,
          });
          await removePendingAttempt(offlineAttemptPayload.clientAttemptId);
        }
        onFinish();
        return;
      } catch (err) {
        console.warn('Online sync failed during submit, keeping saved in offline queue:', err);
        // Do not throw; answers remain safely stored in IndexedDB!
        onFinish();
        return;
      }
    }

    // Fully offline: Answers are safely in IndexedDB
    onFinish();
  };

  // Monotonic local timer with active delta tracking (resistant to iOS tab suspension)
  useEffect(() => {
    if (timeRemaining === null || loading || submitting || error || isSubmittingRef.current) return;

    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const deltaSeconds = Math.max(1, Math.round((now - lastTick) / 1000));
      lastTick = now;

      setTimeRemaining((prev) => {
        if (prev === null) return null;
        const next = prev > deltaSeconds ? prev - deltaSeconds : 0;

        if (clientAttemptIdRef.current) {
          savePendingAttempt({
            clientAttemptId: clientAttemptIdRef.current,
            examId,
            answers: answersRef.current,
            startTime: startTimeRef.current,
            remainingTimeSeconds: next,
            status: 'in_progress',
          }).catch(() => {});
        }

        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [error, loading, submitting, timeRemaining, examId]);

  useEffect(() => {
    if (timeRemaining !== 0 || submitting || isSubmittingRef.current) return;
    submitFinal();
  }, [submitting, timeRemaining]);

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
        />

        <div className={`mbep-stats mbep-stats-grid${timeRemaining === null ? ' mbep-stats-single' : ''}`}>
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
            <div className="mbep-progress-card mbep-timer-card">
              <span className="mbep-timer-value">
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
                  {currentQuestion.description || currentQuestion.title || `Question ${currentIdx + 1}`}
                </div>

                {currentQuestion.images?.length > 0 && (
                  <div style={{ marginBottom: '24px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {currentQuestion.images.map((img, i) => (
                      <AuthImage
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
              <button
                className={`mbep-btn-nav ${currentIdx === questions.length - 1 ? 'mbep-btn-submit' : ''}`}
                onClick={() => {
                  if (currentIdx === questions.length - 1) {
                    setShowSubmitConfirm(true);
                  } else {
                    setCurrentIdx((p) => Math.min(questions.length - 1, p + 1));
                  }
                }}
                disabled={submitting || isSubmittingRef.current}
              >
                {currentIdx === questions.length - 1 ? (submitting ? 'Submitting...' : 'Submit Exam') : 'Next'}
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

          <AuthImage
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
