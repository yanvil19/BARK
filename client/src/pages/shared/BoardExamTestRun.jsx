import { useEffect, useMemo, useState } from 'react';
import ExamTakingView from '../../components/ExamTakingView.jsx';
import ImageZoom from '../../components/ImageZoom.jsx';
import { ConfirmationModal } from '../../components/ConfirmationModal.jsx';
import { FeedbackModal } from '../../components/FeedbackModal.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import useExamRun from '../../hooks/useExamRun.js';
import { apiAuth } from '../../lib/api.js';
import { organizeExamQuestionsAndAnswers } from '../../lib/DeanTestRunOrganizer.js';
import { readQuestionRules, scoreAttempt } from '../../lib/examRules.js';
import '../../styles/shared/MockBoardExamPreview.css';

const BASE = import.meta.env.VITE_API_URL;

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

  const [submitted, setSubmitted] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [timeUpMessage, setTimeUpMessage] = useState(null);
  const [zoomedImage, setZoomedImage] = useState(null);

  // It opens on the introduction; the clocks start when the taker first opens a question
  const run = useExamRun({
    questions,
    rules,
    examSeconds,
    startOnOpen: true,
    finished: submitted,
    showFirstWhenFinished: true,
    onTimeFinish: (message) => {
      setShowSubmitConfirm(false);
      submit();
      setTimeUpMessage(message);
    },
  });
  const { answers } = run;

  const result = useMemo(
    () => (submitted ? scoreAttempt(questions, answers, rules, exam.passingThreshold) : null),
    [answers, exam.passingThreshold, questions, rules, submitted]
  );

  function submit() {
    setSubmitted(true);
    window.scrollTo(0, 0);
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
        currentIdx={run.currentIdx}
        onSelectQuestion={run.openQuestion}
        answers={answers}
        onAnswer={run.answer}
        rules={rules}
        clock={run.clock}
        examSeconds={examSeconds}
        result={result}
        notice={run.notice}
        onZoomImage={setZoomedImage}
        intro={{
          description: exam.description,
          instructions: exam.instructions,
          passingThreshold: exam.passingThreshold,
        }}
        clockStarted={run.started}
        onSubmitQuestion={run.submitQuestion}
        onSubmitExam={() => setShowSubmitConfirm(true)}
        furthestIdx={run.furthestIdx}
      />

      {zoomedImage && <ImageZoom src={zoomedImage} onClose={() => setZoomedImage(null)} />}
    </div>
  );
}
