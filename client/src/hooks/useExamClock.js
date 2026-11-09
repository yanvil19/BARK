import { useEffect, useRef, useState } from 'react';

// The clocks of an exam being taken:
// - the exam's own time left (examSeconds; none when the exam has no limit)
// - with question timers on, each question's time bank: only the open question's runs, and
//   leaving a question keeps what it has left. At 0:00 the question locks, its answer kept.
// - the time spent on each question while it was open and still had time
//
// Time is measured from the system clock, not counted in ticks, so a slow or hidden tab loses
// nothing. Mount it once the questions are loaded; a new run is a new mount (change its key).
//
// onQuestionTimeUp(questionId) runs once when a question's time runs out, onExamTimeUp() once
// when the exam's does.

const TICK_MS = 250;
const keyOf = (question) => String(question?._id ?? question);

function startingClock(questions, examSeconds, secondsFor) {
  const banks = {};
  for (const question of questions) {
    const seconds = secondsFor(question);
    if (seconds > 0) banks[keyOf(question)] = seconds * 1000;
  }
  return { examLeft: examSeconds > 0 ? examSeconds * 1000 : null, banks, spent: {} };
}

function advance(clock, openId, elapsed) {
  if (clock.examLeft !== null && clock.examLeft <= 0) return clock;
  const delta = clock.examLeft === null ? elapsed : Math.min(elapsed, clock.examLeft);
  const next = { ...clock };
  if (clock.examLeft !== null) next.examLeft = clock.examLeft - delta;

  if (openId) {
    let used = delta;
    if (openId in clock.banks) {
      used = Math.min(delta, clock.banks[openId]);
      if (used > 0) next.banks = { ...clock.banks, [openId]: clock.banks[openId] - used };
    }
    if (used > 0) next.spent = { ...clock.spent, [openId]: (clock.spent[openId] || 0) + used };
  }
  return next;
}

export default function useExamClock({
  questions,
  openQuestionId,
  examSeconds = null,
  secondsFor = () => null,
  running = true,
  onQuestionTimeUp,
  onExamTimeUp,
}) {
  const [clock, setClock] = useState(() => startingClock(questions, examSeconds, secondsFor));
  const openRef = useRef(openQuestionId);
  const lastTickRef = useRef(null);
  const lockedRef = useRef(new Set());
  const examEndedRef = useRef(false);
  const callbacksRef = useRef({ onQuestionTimeUp, onExamTimeUp });
  callbacksRef.current = { onQuestionTimeUp, onExamTimeUp };

  // Books the time since the last tick to the question that was open through it
  const flushRef = useRef(null);
  flushRef.current = () => {
    const now = Date.now();
    const elapsed = lastTickRef.current === null ? 0 : now - lastTickRef.current;
    lastTickRef.current = now;
    const openId = openRef.current;
    if (elapsed > 0) setClock((prev) => advance(prev, openId, elapsed));
  };

  useEffect(() => {
    if (!running) return undefined;
    lastTickRef.current = Date.now();
    const timer = setInterval(() => flushRef.current(), TICK_MS);
    return () => {
      clearInterval(timer);
      flushRef.current();
      lastTickRef.current = null;
    };
  }, [running]);

  // Leaving a question closes its time before the next one's starts
  useEffect(() => {
    if (openRef.current === openQuestionId) return;
    if (lastTickRef.current !== null) flushRef.current();
    openRef.current = openQuestionId;
  }, [openQuestionId]);

  useEffect(() => {
    for (const [id, left] of Object.entries(clock.banks)) {
      if (left <= 0 && !lockedRef.current.has(id)) {
        lockedRef.current.add(id);
        callbacksRef.current.onQuestionTimeUp?.(id);
      }
    }
    if (clock.examLeft !== null && clock.examLeft <= 0 && !examEndedRef.current) {
      examEndedRef.current = true;
      callbacksRef.current.onExamTimeUp?.();
    }
  }, [clock]);

  const spentMs = Object.values(clock.spent).reduce((sum, ms) => sum + ms, 0);
  return {
    examLeft: clock.examLeft === null ? null : Math.ceil(clock.examLeft / 1000),
    questionLeft: (question) => {
      const left = clock.banks[keyOf(question)];
      return left === undefined ? null : Math.ceil(left / 1000);
    },
    isLocked: (question) => {
      const left = clock.banks[keyOf(question)];
      return left !== undefined && left <= 0;
    },
    spent: (question) => Math.round((clock.spent[keyOf(question)] || 0) / 1000),
    totalSpent: Math.round(spentMs / 1000),
  };
}
