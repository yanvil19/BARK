import { useEffect, useMemo, useRef, useState } from 'react';
import ExamTakingView from './ExamTakingView.jsx';
import ImageZoom from './ImageZoom.jsx';
import PageHeader from './PageHeader.jsx';
import { ConfirmationModal } from './ConfirmationModal.jsx';
import { FeedbackModal } from './FeedbackModal.jsx';
import useExamRun from '../hooks/useExamRun.js';
import { apiAuth } from '../lib/api.js';
import { addAnswerOptionLabels } from '../lib/DeanTestRunOrganizer.js';
import { readQuestionRules } from '../lib/examRules.js';
import '../styles/shared/MockBoardExamPreview.css';

const BASE = import.meta.env.VITE_API_URL;
// An answer or a move is saved this long after it; with question timers the clocks are saved
// this often too, so a refresh costs a few seconds at most
const SAVE_DELAY_MS = 800;
const CLOCK_SAVE_MS = 5000;
const FOCUS_COOLDOWN_MS = 500;

const AUDIENCES = {
  student: { api: 'student-exams', label: 'Student', watchFocus: true },
  alumni: { api: 'alumni-exams', label: 'Alumni', watchFocus: false },
};

// A real attempt at an exam, for a student or an alumnus, on the screen the test run uses
// (ExamTakingView): the introduction, the exam's points, clocks and one-way navigation, and
// the summary with Submit Exam. The server keeps the answers and where the taker is, so a
// refresh returns to the same question with the same time left.
//
// audience: 'student' (the exam closes at its end time, and leaving the window is warned
// about and recorded) or 'alumni' (an attempt, timed or not, that can be taken again)
export default function ExamAttemptRunner({ audience, examId, onFinish, me }) {
  const config = AUDIENCES[audience] || AUDIENCES.student;
  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiAuth(`${BASE}/api/${config.api}/${encodeURIComponent(examId)}/start`, { method: 'POST' })
      .then((data) => { if (!cancelled) setAttempt(data); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to start exam. The window may be closed.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [config.api, examId]);

  if (loading) return <div className="mbep-page page-shell"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Exam...</h3></div></div>;
  if (error || !attempt) return <div className="mbep-page page-shell"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error || 'Exam not found'}</div></div>;

  return <AttemptSession attempt={attempt} config={config} onFinish={onFinish} me={me} />;
}

function AttemptSession({ attempt, config, onFinish, me }) {
  const attemptUrl = `${BASE}/api/${config.api}/attempt/${attempt.attemptId}`;
  const [questions] = useState(() => (attempt.questions || []).map((question) => ({
    ...question,
    answers: addAnswerOptionLabels(question.answers || []),
  })));
  const rules = useMemo(
    () => readQuestionRules({ ...attempt.exam, ...(attempt.rules || {}) }, questions),
    [attempt, questions]
  );
  // The exam's time from now: to a student exam's end, or what is left of a timed attempt
  const [examSeconds] = useState(() => {
    const seconds = Number(attempt.remainingTimeSeconds);
    return Number.isFinite(seconds) && attempt.remainingTimeSeconds !== null ? Math.max(1, seconds) : null;
  });

  const [submitting, setSubmitting] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [timeUpModal, setTimeUpModal] = useState(null);
  const [feedbackModal, setFeedbackModal] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);
  const submittingRef = useRef(false);
  const finishTimeoutRef = useRef(null);

  const run = useExamRun({
    questions,
    rules,
    examSeconds,
    initial: { ...(attempt.state || {}), answers: attempt.answers || {} },
    finished: submitting,
    onTimeFinish: (message) => submitFinal({ timeUpMessage: message }),
  });
  const { answers, currentIdx, furthestIdx } = run;

  // ── Saving: the answers and where the taker is ──
  const latestRef = useRef(null);
  latestRef.current = () => ({ answers, state: run.snapshot() });
  const saveTimeoutRef = useRef(null);
  const firstRenderRef = useRef(true);

  function saveNow() {
    if (submittingRef.current) return;
    apiAuth(`${attemptUrl}/progress`, { method: 'PATCH', body: latestRef.current() })
      .catch((err) => console.error('Auto-save failed:', err));
  }
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return undefined;
    }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveNowRef.current(), SAVE_DELAY_MS);
    return undefined;
  }, [answers, currentIdx, furthestIdx]);

  useEffect(() => {
    if (!rules.usesQuestionTimer) return undefined;
    const timer = setInterval(() => saveNowRef.current(), CLOCK_SAVE_MS);
    return () => clearInterval(timer);
  }, [rules.usesQuestionTimer]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (finishTimeoutRef.current) clearTimeout(finishTimeoutRef.current);
  }, []);

  // ── Leaving the exam window (students): warned about, and recorded from the third time ──
  const [isBlurred, setIsBlurred] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const violationCountRef = useRef(0);
  const lastViolationRef = useRef(0);
  const stopWatchingRef = useRef(null);

  useEffect(() => {
    if (!config.watchFocus) return undefined;
    const handleContextMenu = (event) => event.preventDefault();
    const handleCopyKeys = (event) => {
      if ((event.ctrlKey || event.metaKey) && ['c', 'v', 's'].includes(event.key.toLowerCase())) event.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleCopyKeys);

    let stopFocusWatch = () => {};
    if (config.watchFocus) {
      const flag = (reason) => {
        if (submittingRef.current) return;
        const now = Date.now();
        if (now - lastViolationRef.current < FOCUS_COOLDOWN_MS) return;
        lastViolationRef.current = now;
        violationCountRef.current += 1;
        setViolationCount(violationCountRef.current);
        if (violationCountRef.current > 2) {
          apiAuth(`${attemptUrl}/violation`, { method: 'POST', body: { type: 'focus_lost', reason } })
            .catch((err) => console.error('Failed to log activity:', err));
        }
        setIsBlurred(true);
        setShowWarningModal(true);
      };
      const handleKeys = (event) => {
        if (event.key === 'F12') {
          event.preventDefault();
          flag('F12 (Developer Tools)');
        }
        if (event.key === 'PrintScreen') flag('PrintScreen (Screenshot)');
        if ((event.metaKey || event.key === 'Meta') && event.shiftKey) flag('Meta+Shift (Shortcut)');
      };
      const handleVisibility = () => { if (document.hidden) flag('Switched Tabs / Hidden Window'); };
      const handleBlur = () => flag('Lost Window Focus');
      document.addEventListener('keydown', handleKeys);
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('blur', handleBlur);
      stopFocusWatch = () => {
        document.removeEventListener('keydown', handleKeys);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('blur', handleBlur);
      };
    }

    stopWatchingRef.current = () => {
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleCopyKeys);
      stopFocusWatch();
    };
    return () => stopWatchingRef.current?.();
  }, [attemptUrl, config.watchFocus]);

  // ── Handing it in ──
  async function submitFinal({ timeUpMessage = null } = {}) {
    if (submittingRef.current) return;
    const body = latestRef.current();
    submittingRef.current = true;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSubmitting(true);
    setShowSubmitConfirm(false);
    if (timeUpMessage) {
      // Time ran out: no warning should sit on top of what happens next
      stopWatchingRef.current?.();
      setShowWarningModal(false);
      setIsBlurred(false);
      setFeedbackModal(null);
      setTimeUpModal(timeUpMessage);
    }

    try {
      await apiAuth(`${attemptUrl}/submit`, { method: 'POST', body });
      if (timeUpMessage) finishTimeoutRef.current = setTimeout(() => onFinish(), 1500);
      else onFinish();
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      setTimeUpModal(null);
      setFeedbackModal({
        title: 'Submission Failed',
        tone: 'danger',
        message: err.message || 'Failed to submit exam.',
      });
    }
  }

  const blankCount = questions.filter((question) => !answers[String(question._id)]).length;
  const takerName = me?.name || `${me?.firstName || ''} ${me?.lastName || ''}`.trim() || config.label;
  const identifier = `${config.label.toUpperCase()}: ${takerName.toUpperCase()}`;
  const watermark = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text transform="rotate(-15 100,50)" fill="black" font-size="9" font-family="monospace" font-weight="bold" text-anchor="middle"><tspan x="100" y="55">${identifier}</tspan></text></svg>`;
  const subtitle = attempt.attemptNumber ? `Attempt ${attempt.attemptNumber}` : 'Mock Board Exam';

  return (
    <>
      <div className="exam-watermark" style={{ backgroundImage: `url("data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(watermark)))}")` }} />

      {showWarningModal && (
        <div className="exam-security-modal-overlay">
          <div className="exam-security-modal-content">
            <h2 className="exam-security-modal-title">Security Warning</h2>
            <p className="exam-security-modal-text">
              {violationCount === 1
                ? 'First Warning: You have navigated away from the exam window, switched tabs, or used a restricted shortcut. Please remain focused on the exam. Each focus change is recorded.'
                : violationCount === 2
                  ? 'Final Warning: You have navigated away from the exam window or used a restricted shortcut again. Please return to the exam.'
                  : 'You have navigated away from the exam window or used a restricted shortcut again. This action has been recorded.'}
            </p>
            <button type="button" className="exam-security-modal-btn" onClick={() => { setIsBlurred(false); setShowWarningModal(false); }}>
              Return to Exam
            </button>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => submitFinal()}
        title="Submit Exam"
        message={blankCount > 0
          ? `${blankCount} of ${questions.length} questions ${blankCount === 1 ? 'has' : 'have'} no answer yet. You can't change your answers after this.`
          : "Every question has an answer. You can't change your answers after this."}
        confirmLabel="Submit Exam"
        cancelLabel="Keep Answering"
        confirmVariant="primary"
        busy={submitting}
      />

      <FeedbackModal
        open={Boolean(timeUpModal)}
        onClose={() => {}}
        title="Time Is Up"
        tone="warning"
        message={timeUpModal}
        showDismissButton={false}
      />

      <FeedbackModal
        open={Boolean(feedbackModal)}
        onClose={() => setFeedbackModal(null)}
        title={feedbackModal?.title || 'Notification'}
        tone={feedbackModal?.tone || 'info'}
        message={feedbackModal?.message}
      />

      <div className={`mbep-page page-shell ${isBlurred ? 'mbep-page-blurred' : 'mbep-page-secure'}`}>
        <PageHeader title={attempt.exam?.name} subtitle={subtitle}>
          <button type="button" className="mbep-action" onClick={() => setShowSubmitConfirm(true)} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        </PageHeader>

        <ExamTakingView
          questions={questions}
          currentIdx={currentIdx}
          onSelectQuestion={run.openQuestion}
          answers={answers}
          onAnswer={run.answer}
          rules={rules}
          clock={run.clock}
          examSeconds={examSeconds || 0}
          notice={run.notice}
          onZoomImage={setZoomedImage}
          intro={{
            description: attempt.exam?.description,
            instructions: attempt.exam?.instructions,
            passingThreshold: attempt.exam?.passingThreshold,
          }}
          clockStarted={examSeconds !== null ? true : null}
          onSubmitQuestion={run.submitQuestion}
          onSubmitExam={() => setShowSubmitConfirm(true)}
          furthestIdx={furthestIdx}
        />
      </div>

      {zoomedImage && <ImageZoom src={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </>
  );
}
