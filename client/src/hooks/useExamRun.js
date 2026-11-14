import { useEffect, useRef, useState } from 'react';
import useExamClock from './useExamClock.js';
import { nextOpenQuestion } from '../lib/examRules.js';

// The introduction's place before question 1; the summary's is questions.length
export const INTRO_INDEX = -1;
const NOTICE_MS = 6000;
const idOf = (question) => String(question?._id ?? question);

// An exam being taken: the stop the taker is on, their answers, the clocks, and the exam's
// rules about moving between questions. The test run and the student and alumni runners share
// it, and hand what it returns to ExamTakingView.
//
// - rules: readQuestionRules(exam, questions)
// - examSeconds: the exam's time from now, or none
// - initial: where a returning taker left off: { answers, currentIdx, furthestIdx,
//   timeLeftMs, spentMs } (the last two by question id, in milliseconds)
// - startOnOpen: the clocks wait until a question is first opened (the test run); otherwise
//   they run from the start (a real attempt, whose time is already going)
// - finished: the attempt is over (marked, or being handed in); clocks and rules stop.
//   showFirstWhenFinished opens question 1 then, for an attempt that is marked on the spot.
// - onTimeFinish(message): the exam's time, or every question's, has run out
//
// Rules it keeps:
// - Free navigation with question timers: a time bank. Only the open question's time runs,
//   and at 0:00 it locks with its answer and the next one with time opens.
// - One-way navigation: the taker moves on only by submitting the question reached, which
//   needs an answer. furthestIdx is the last stop reached. With rules.allowBack they can look
//   at the stops before it, read-only; without it there is no way back.
export default function useExamRun({
  questions,
  rules,
  examSeconds = null,
  initial = null,
  startOnOpen = false,
  finished = false,
  showFirstWhenFinished = false,
  onTimeFinish,
}) {
  const lastStop = questions.length;
  const [furthestIdx, setFurthestIdx] = useState(() => (
    Math.min(Math.max(Number(initial?.furthestIdx) || 0, 0), lastStop)
  ));
  const [currentIdx, setCurrentIdx] = useState(() => {
    const saved = Number.isFinite(Number(initial?.currentIdx)) ? Number(initial.currentIdx) : INTRO_INDEX;
    const stop = Math.min(Math.max(saved, INTRO_INDEX), lastStop);
    return rules.oneWay ? Math.min(stop, Math.max(Number(initial?.furthestIdx) || 0, 0)) : stop;
  });
  const [started, setStarted] = useState(!startOnOpen);
  const [answers, setAnswers] = useState(() => ({ ...(initial?.answers || {}) }));
  const [notice, setNotice] = useState(null);

  const currentQuestion = currentIdx >= 0 ? questions[currentIdx] || null : null;
  // One way, a question gone back to is only there to be looked at
  const lookingBack = rules.oneWay && currentIdx < furthestIdx;
  const clockRef = useRef(null);
  const clock = useExamClock({
    questions,
    // No question's time runs on the introduction, on the summary, or on a question gone back to
    openQuestionId: finished || !currentQuestion || lookingBack ? null : idOf(currentQuestion),
    examSeconds,
    secondsFor: (question) => rules.of(question).seconds,
    initial: { banksMs: initial?.timeLeftMs, spentMs: initial?.spentMs },
    running: started && !finished,
    onQuestionTimeUp: handleQuestionTimeUp,
    onExamTimeUp: () => finishOnTime("The exam's time has ended, so your answers were submitted."),
  });
  clockRef.current = clock;

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  // Over: nothing more to announce, and a marked attempt opens on question 1
  useEffect(() => {
    if (!finished) return;
    setNotice(null);
    if (showFirstWhenFinished) setCurrentIdx(0);
  }, [finished, showFirstWhenFinished]);

  function finishOnTime(message) {
    if (finished) return;
    onTimeFinish?.(message);
  }

  // The open question's time is up
  function handleQuestionTimeUp(questionId) {
    if (finished) return;
    const index = questions.findIndex((question) => idOf(question) === questionId);
    const kept = answers[questionId] ? 'Its answer was submitted' : 'It was left blank';
    // One way: only the question reached has time running; it is submitted and the next opens
    if (rules.oneWay) {
      if (index !== currentIdx) return;
      if (index >= questions.length - 1) {
        finishOnTime("The last question's time is up, so your answers were submitted.");
        return;
      }
      setCurrentIdx(index + 1);
      setFurthestIdx((furthest) => Math.max(furthest, index + 1));
      setNotice(`Time's up for question ${index + 1}. ${kept}, and question ${index + 2} is open.`);
      return;
    }
    // Free navigation: it locks with its answer, and the next one with time opens
    const next = nextOpenQuestion(questions, index, clockRef.current.isLocked);
    if (next === -1) {
      finishOnTime("Every question's time is up, so your answers were submitted.");
      return;
    }
    if (index !== currentIdx) return;
    setCurrentIdx(next);
    setNotice(`Time's up for question ${index + 1}. ${answers[questionId] ? 'Its answer is kept' : 'It was left blank'}, and question ${next + 1} is open.`);
  }

  // index: a question, INTRO_INDEX, or questions.length for the summary
  function openQuestion(index) {
    // One way: the introduction's button starts question 1. After that the only jumps are back
    // and forth through the stops already reached, when the exam allows going back.
    if (rules.oneWay && !finished) {
      const starting = currentIdx === INTRO_INDEX && index === 0;
      const returning = rules.allowBack && currentIdx >= 0 && index >= 0 && index <= furthestIdx;
      if (!starting && !returning) return;
    }
    setCurrentIdx(Math.min(Math.max(index, INTRO_INDEX), finished ? lastStop - 1 : lastStop));
    if (index >= 0) setStarted(true);
  }

  // One way: the next stop opens once the question reached is answered (or out of time);
  // after the last question that is the summary, where the exam is submitted
  function submitQuestion() {
    if (finished || !currentQuestion || currentIdx < furthestIdx) return;
    const questionId = idOf(currentQuestion);
    if (!answers[questionId] && !clockRef.current.isLocked(questionId)) return;
    setCurrentIdx(currentIdx + 1);
    setFurthestIdx(currentIdx + 1);
    window.scrollTo(0, 0);
  }

  function answer(questionId, answerId) {
    if (finished || clockRef.current.isLocked(questionId)) return;
    // One way: an answer is final once its question is submitted
    if (rules.oneWay && currentIdx < furthestIdx) return;
    setAnswers((prev) => ({ ...prev, [questionId]: answerId }));
  }

  return {
    currentIdx,
    furthestIdx,
    started,
    answers,
    notice,
    clock,
    openQuestion,
    submitQuestion,
    answer,
    // What a save keeps so a refresh can't reset it
    snapshot: () => ({ currentIdx, furthestIdx, ...clockRef.current.snapshot() }),
  };
}
