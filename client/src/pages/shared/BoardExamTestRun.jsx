import { useEffect, useMemo, useRef, useState } from 'react';
import AuthImage from '../../components/AuthImage.jsx';
import ExamTakingView, { INTRO_INDEX } from '../../components/ExamTakingView.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import useExamClock from '../../hooks/useExamClock.js';
import { apiAuth } from '../../lib/api.js';
import { organizeExamQuestionsAndAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { nextOpenQuestion, readQuestionRules, scoreAttempt } from '../../lib/examRules.js';
import '../../styles/shared/MockBoardExamPreview.css';

const BASE = import.meta.env.VITE_API_URL;
const NOTICE_MS = 6000;

// A test run: the exam taken on the screen a student or alumnus gets (ExamTakingView), with its
// points, its clock and each question's own time. Nothing is saved. Afterwards it shows the score
// and the right answers, and can be run again.
//
// It runs a saved exam (examId), or one not saved yet (draftExam), such as the Create Exam page's:
// its name, program, description, instructions, durationMinutes, passingThreshold, questions,
// and the points and time
// settings as the server keeps them (scoringMode, questionTimerEnabled, oneWayNavigation,
// itemSettings, ...).
export default function MockBoardExamTestRun({ examId, draftExam = null, onBack }) {
  // App clears its exam id as soon as this page opens (it keeps one only for its exam runner),
  // so hold on to the id the page was opened with
  const [openedExamId] = useState(examId);
  const [exam, setExam] = useState(draftExam);
  const [loading, setLoading] = useState(!draftExam);
  const [error, setError] = useState(null);
  const [runNumber, setRunNumber] = useState(1);

  useEffect(() => {
    if (draftExam) {
      setExam(draftExam);
      setLoading(false);
      return undefined;
    }
    if (!openedExamId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    apiAuth(`${BASE}/api/mock-board-exams/${encodeURIComponent(openedExamId)}`)
      .then((data) => {
        if (cancelled) return;
        if (data.exam) setExam(data.exam);
        else setError('Exam not found.');
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Failed to load exam test run.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [openedExamId, draftExam]);

  if (loading) return <div className="mbep-page page-shell"><div style={{ padding: '80px', textAlign: 'center' }}><h3>Starting Test Run...</h3></div></div>;
  if (error || !exam) return <div className="mbep-page page-shell"><div style={{ padding: '80px', textAlign: 'center', color: 'red' }}>{error || 'Exam not found'}</div></div>;

  // A run is its own mount, so running it again starts from scratch: new order, clocks, answers
  return (
    <TestRunSession
      key={runNumber}
      exam={exam}
      isDraft={Boolean(draftExam)}
      onRestart={() => { setRunNumber((run) => run + 1); window.scrollTo(0, 0); }}
      onBack={onBack}
    />
  );
}

function TestRunSession({ exam, isDraft, onRestart, onBack }) {
  // Shuffled like an attempt: the questions (a set's parts stay together) and their answers
  const [questions] = useState(() => organizeExamQuestionsAndAnswers(exam.questions || [], { randomize: true }));
  const rules = useMemo(() => readQuestionRules(exam, questions), [exam, questions]);
  const examSeconds = (Number(exam.durationMinutes) || 0) * 60;

  // It opens on the introduction; the clocks start when the taker first opens a question
  const [currentIdx, setCurrentIdx] = useState(INTRO_INDEX);
  // One-way navigation: the last stop reached (a question, or the summary after them all),
  // which nothing but answering moves on
  const [furthestIdx, setFurthestIdx] = useState(0);
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [timeUpMessage, setTimeUpMessage] = useState(null);
  const [notice, setNotice] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);

  const currentQuestion = currentIdx >= 0 ? questions[currentIdx] : null;
  const clockRef = useRef(null);
  const clock = useExamClock({
    questions,
    // No question's time runs on the introduction, on the summary, or (one way) on a question
    // gone back to, which is only there to be looked at
    openQuestionId: submitted || !currentQuestion || (rules.oneWay && currentIdx < furthestIdx)
      ? null
      : String(currentQuestion._id),
    examSeconds,
    secondsFor: (question) => rules.of(question).seconds,
    running: started && !submitted,
    onQuestionTimeUp: handleQuestionTimeUp,
    onExamTimeUp: () => finishOnTime("The exam's time has ended, so your answers were submitted."),
  });
  clockRef.current = clock;

  const result = useMemo(
    () => (submitted ? scoreAttempt(questions, answers, rules, exam.passingThreshold) : null),
    [answers, exam.passingThreshold, questions, rules, submitted]
  );

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // The open question's time is up: it locks with its answer, and the next one with time opens
  function handleQuestionTimeUp(questionId) {
    if (submitted) return;
    const index = questions.findIndex((question) => String(question._id) === questionId);
    // One way: only the question reached has time running; it is submitted and the next opens
    if (rules.oneWay) {
      if (index !== currentIdx) return;
      if (index >= questions.length - 1) {
        finishOnTime("The last question's time is up, so your answers were submitted.");
        return;
      }
      setCurrentIdx(index + 1);
      setFurthestIdx((furthest) => Math.max(furthest, index + 1));
      setNotice(`Time's up for question ${index + 1}. ${answers[questionId] ? 'Its answer was submitted' : 'It was left blank'}, and question ${index + 2} is open.`);
      return;
    }
    const next = nextOpenQuestion(questions, index, clockRef.current.isLocked);
    if (next === -1) {
      finishOnTime("Every question's time is up, so your answers were submitted.");
      return;
    }
    if (index !== currentIdx) return;
    setCurrentIdx(next);
    setNotice(`Time's up for question ${index + 1}. ${answers[questionId] ? 'Its answer is kept' : 'It was left blank'}, and question ${next + 1} is open.`);
  }

  function finishOnTime(message) {
    if (submitted) return;
    setShowSubmitConfirm(false);
    submit();
    setTimeUpMessage(message);
  }

  function submit() {
    setSubmitted(true);
    setNotice(null);
    setCurrentIdx(0);
    window.scrollTo(0, 0);
  }

  // index: a question, INTRO_INDEX, or questions.length for the summary
  function openQuestion(index) {
    // One way: the introduction's button starts question 1. After that the only jumps are back
    // and forth through the stops already reached, when the exam allows going back.
    if (rules.oneWay && !submitted) {
      const starting = currentIdx === INTRO_INDEX && index === 0;
      const returning = rules.allowBack && currentIdx >= 0 && index >= 0 && index <= furthestIdx;
      if (!starting && !returning) return;
    }
    setCurrentIdx(index);
    if (index >= 0) setStarted(true);
  }

  // One way: the next stop opens once the question reached is answered; after the last
  // question that is the summary, where the exam is submitted
  function submitQuestion() {
    if (submitted || !currentQuestion || currentIdx < furthestIdx) return;
    const questionId = String(currentQuestion._id);
    if (!answers[questionId] && !clockRef.current.isLocked(questionId)) return;
    setCurrentIdx(currentIdx + 1);
    setFurthestIdx(currentIdx + 1);
    window.scrollTo(0, 0);
  }

  function handleAnswer(questionId, answerId) {
    if (submitted || clockRef.current.isLocked(questionId)) return;
    // One way: an answer is final once its question is submitted
    if (rules.oneWay && currentIdx < furthestIdx) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answerId }));
  }

  const blankCount = questions.filter((question) => !answers[String(question._id)]).length;
  const subtitle = [isDraft ? 'Test run of an exam not saved yet' : 'Test run', exam.program?.name]
    .filter(Boolean)
    .join(' • ');

  return (
    <div className="mbep-page page-shell">
      <ConfirmationModal
        open={showSubmitConfirm}
        onClose={() => setShowSubmitConfirm(false)}
        onConfirm={() => {
          setShowSubmitConfirm(false);
          submit();
        }}
        title="Submit Exam"
        message={blankCount > 0
          ? `${blankCount} of ${questions.length} questions ${blankCount === 1 ? 'has' : 'have'} no answer yet. You can't change your answers after this.`
          : "Every question has an answer. You can't change your answers after this."}
        confirmLabel="Submit Exam"
        cancelLabel="Keep Answering"
        confirmVariant="primary"
      />

      <FeedbackModal
        open={Boolean(timeUpMessage)}
        onClose={() => setTimeUpMessage(null)}
        title="Time Is Up"
        tone="warning"
        message={timeUpMessage}
        dismissLabel="See My Score"
      />

      <PageHeader title={exam.name} subtitle={subtitle}>
        {submitted ? (
          <button type="button" className="mbep-action" onClick={onRestart}>Run It Again</button>
        ) : (
          <button type="button" className="mbep-action" onClick={() => setShowSubmitConfirm(true)}>Submit Exam</button>
        )}
        <button type="button" className="mbep-action is-secondary" onClick={onBack}>Exit Test Run</button>
      </PageHeader>

      <ExamTakingView
        questions={questions}
        currentIdx={currentIdx}
        onSelectQuestion={openQuestion}
        answers={answers}
        onAnswer={handleAnswer}
        rules={rules}
        clock={clock}
        examSeconds={examSeconds}
        result={result}
        notice={notice}
        onZoomImage={setZoomedImage}
        intro={{
          description: exam.description,
          instructions: exam.instructions,
          passingThreshold: exam.passingThreshold,
        }}
        clockStarted={started}
        onSubmitQuestion={submitQuestion}
        onSubmitExam={() => setShowSubmitConfirm(true)}
        furthestIdx={furthestIdx}
      />

      {zoomedImage && <ImageZoom src={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </div>
  );
}

// A picture opened full screen: the wheel zooms (1x to 4x), dragging moves it, Escape closes it
function ImageZoom({ src, onClose }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      onWheel={(event) => {
        setZoomLevel((prev) => Math.min(Math.max(event.deltaY < 0 ? prev + 0.2 : prev - 0.2, 1), 4));
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
    >
      <button
        type="button"
        aria-label="Close image"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
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
        }}
      >
        ×
      </button>

      <AuthImage
        src={src}
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
          cursor: zoomLevel > 1 ? 'grab' : 'zoom-in',
        }}
        onMouseDown={(event) => {
          if (zoomLevel > 1) {
            setDragging(true);
            setStartPos({ x: event.clientX - position.x, y: event.clientY - position.y });
          }
        }}
        onMouseMove={(event) => {
          if (dragging) setPosition({ x: event.clientX - startPos.x, y: event.clientY - startPos.y });
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
