import { useMemo } from 'react';
import AuthImage from './AuthImage.jsx';
import AnswerImage from './AnswerImage.jsx';
import PassageImages from './PassageImages.jsx';
import SafeHtml, { truncateHtml } from './SafeHtml.jsx';
import QuestionNavBubbles from './QuestionNavBubbles.jsx';
import { CHECK_ICON, CROSS_ICON, LOCK_ICON, ONE_WAY_RULE_ICON, POINTS_RULE_ICON, QUESTIONS_ICON, TIMER_RULE_ICON } from './ExamRuleIcons.jsx';
import { examTimeIsLow, formatClock, questionTimeIsLow } from '../lib/examRules.js';
import '../styles/shared/MockBoardExamPreview.css';

const BASE = import.meta.env.VITE_API_URL;
const imageSrc = (image) => (image.startsWith('/') ? `${BASE}${image}` : image);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const idOf = (question) => String(question._id);
// The intro's place in the bubbles, before question 1
export const INTRO_INDEX = -1;

// "25 minutes", "1 hour 30 minutes"
function formatDuration(totalSeconds) {
  const minutes = Math.round(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return plural(minutes, 'minute');
  return rest === 0 ? plural(hours, 'hour') : `${plural(hours, 'hour')} ${plural(rest, 'minute')}`;
}

// The screen a taker answers an exam on: how far they are and the exam's clock, the open
// question with its points and its own clock, and the question bubbles. Once the attempt is
// marked (result) it shows the score and, on each question, the right answer, the points it
// earned and the time spent on it. The page around it keeps the header, the modals and the
// state; the test run uses it, and the student and alumni runners are meant to.
//
// - rules: readQuestionRules(exam); clock: useExamClock(...); result: scoreAttempt(...)
// - examSeconds: the exam's whole time, for when its clock turns to its warning colour
// - notice: a line read out when something changes on its own (a question's time running out)
// - intro: { description, instructions, passingThreshold } adds an introduction before
//   question 1, as bubble 0; currentIdx INTRO_INDEX opens it. clockStarted says whether the
//   taker's time is running yet, which the introduction tells them.
// - After the last question comes the summary, the bubble with a tick: currentIdx
//   questions.length opens it. It lists every question's answer and has the Submit Exam
//   button (onSubmitExam). A marked attempt has no summary.
// - onSubmitQuestion: with one-way navigation (rules.oneWay), the taker's only way on. It
//   opens the next stop once the open question is answered. furthestIdx is the last stop
//   reached: with rules.allowBack the taker can look at any question up to it, read-only,
//   and without it at none. This holds until the attempt is marked.
export default function ExamTakingView({
  questions,
  currentIdx,
  onSelectQuestion,
  answers,
  onAnswer,
  rules,
  clock,
  examSeconds = 0,
  result = null,
  notice = null,
  onZoomImage,
  intro = null,
  clockStarted = true,
  onSubmitQuestion,
  onSubmitExam,
  furthestIdx = 0,
}) {
  // The exam numbers each set covers ("Questions 4–6"); a set's parts sit together in an attempt
  const setRanges = useMemo(() => {
    const ranges = new Map();
    questions.forEach((item, index) => {
      if (!item.groupId) return;
      const key = String(item.groupId);
      const range = ranges.get(key);
      if (range) range.last = index + 1;
      else ranges.set(key, { first: index + 1, last: index + 1 });
    });
    return ranges;
  }, [questions]);

  const onIntro = Boolean(intro) && currentIdx === INTRO_INDEX;
  const firstIdx = intro ? INTRO_INDEX : 0;
  // The summary is the last stop while the exam is being taken
  const onSummary = !result && currentIdx === questions.length;
  const lastIdx = result ? questions.length - 1 : questions.length;
  const question = onIntro || onSummary ? null : questions[currentIdx];
  const answeredCount = questions.filter((item) => answers[idOf(item)]).length;
  const timedOutCount = rules.usesQuestionTimer ? questions.filter((item) => clock.isLocked(item)).length : 0;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;
  const examLeft = clock.examLeft;
  const examLow = !result && examLeft !== null && examTimeIsLow(examLeft, examSeconds);

  // One-way navigation holds while the exam is being taken; a marked attempt is free to look through
  const oneWay = rules.oneWay && !result;
  const hasAnswer = question ? Boolean(answers[idOf(question)]) : false;
  // The question the taker has got to; any before it are ones they have come back to look at
  const atFurthest = currentIdx >= furthestIdx;
  const canGoBack = oneWay && rules.allowBack;
  const lookingBack = oneWay && Boolean(question) && !atFurthest;
  // Whether a question can be opened from the summary: any of them, or with one-way navigation
  // only when going back is allowed
  const canOpenFromSummary = !oneWay || canGoBack;
  // A question needs an answer before the next opens, unless its time ran out first
  const mustAnswer = oneWay && atFurthest && !hasAnswer && !(question && clock.isLocked(question));

  function navStatus(item, index) {
    if (result) return { result: result.of(item)?.isCorrect ? 'correct' : 'wrong' };
    return {
      done: Boolean(answers[idOf(item)]),
      // Without going back, a question the taker has moved past is closed
      locked: clock.isLocked(item) || (oneWay && !canGoBack && index < currentIdx),
    };
  }

  return (
    <>
      <section className="mbep-status" aria-label="Exam progress">
        <div className="mbep-status-card mbep-status-progress">
          <div className="mbep-status-row">
            <span className="mbep-status-figure">
              <span className="mbep-status-icon">{QUESTIONS_ICON}</span>
              <span><strong>{answeredCount}</strong> of {questions.length} answered</span>
            </span>
            <span className="mbep-status-extras">
              {rules.usesCustomPoints && (
                <span className="mbep-status-extra">{POINTS_RULE_ICON} {plural(rules.totalPoints, 'point')} in all</span>
              )}
              {timedOutCount > 0 && !result && (
                <span className="mbep-status-extra">{LOCK_ICON} {timedOutCount} timed out</span>
              )}
            </span>
          </div>
          <div className="mbep-progress-bar">
            <div className="mbep-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={`mbep-status-card mbep-status-clock${examLow ? ' is-low' : ''}`}>
          <span className="mbep-status-label">
            {TIMER_RULE_ICON} {result ? 'Time spent' : 'Exam time left'}
          </span>
          {result ? (
            <span className="mbep-clock-value">{formatClock(clock.totalSpent)}</span>
          ) : examLeft === null ? (
            <span className="mbep-clock-value is-none">No limit</span>
          ) : (
            <span className="mbep-clock-value" role="timer" aria-label={`Exam time left: ${formatClock(examLeft)}`}>
              {formatClock(examLeft)}
            </span>
          )}
        </div>
      </section>

      {result && <ResultSummary result={result} rules={rules} totalSpent={clock.totalSpent} />}

      <div className="mbep-notice-slot" role="status" aria-live="polite">
        {notice && <p className="mbep-time-notice">{LOCK_ICON}<span>{notice}</span></p>}
      </div>

      <main className="mbep-content">
        {onIntro && (
          <IntroSheet
            intro={intro}
            questionCount={questions.length}
            rules={rules}
            examSeconds={examSeconds}
            clockStarted={clockStarted}
            marked={Boolean(result)}
            onStart={() => onSelectQuestion(0)}
          />
        )}
        {question && (
          <QuestionSheet
            key={idOf(question)}
            question={question}
            number={currentIdx + 1}
            count={questions.length}
            setRange={question.groupId ? setRanges.get(String(question.groupId)) : null}
            selectedId={answers[idOf(question)]}
            onAnswer={onAnswer}
            rules={rules}
            clock={clock}
            mark={result ? result.of(question) : null}
            submitted={lookingBack}
            onZoomImage={onZoomImage}
          />
        )}
        {onSummary && (
          <SummarySheet
            questions={questions}
            answers={answers}
            clock={clock}
            onOpen={canOpenFromSummary ? onSelectQuestion : null}
            canChange={!oneWay}
          />
        )}

        <nav className="mbep-navigator-wrap" aria-label="Questions">
          {/* The way on, a whole block above the bubbles; two buttons share it half and half.
              One way, a question's only way on is to submit its answer, and Previous is there
              only when going back is allowed. The summary's button submits the exam. */}
          {!(oneWay && onIntro) && (
            <div className="mbep-step-actions">
              <div className="mbep-step-buttons">
                {(!oneWay || canGoBack) && (
                  <button
                    type="button"
                    className="mbep-btn-nav"
                    onClick={() => onSelectQuestion(currentIdx - 1)}
                    disabled={currentIdx <= (oneWay ? 0 : firstIdx)}
                  >
                    ← Previous
                  </button>
                )}
                {onSummary ? (
                  <button type="button" className="mbep-btn-nav is-forward" onClick={() => onSubmitExam?.()}>
                    Submit Exam
                  </button>
                ) : oneWay && atFurthest ? (
                  <button type="button" className="mbep-btn-nav is-forward" onClick={() => onSubmitQuestion?.()} disabled={mustAnswer}>
                    Submit Answer →
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`mbep-btn-nav${oneWay ? ' is-forward' : ''}`}
                    onClick={() => onSelectQuestion(currentIdx + 1)}
                    disabled={currentIdx >= lastIdx}
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mbep-nav-bar">
            <QuestionNavBubbles
              questions={questions}
              currentIdx={currentIdx}
              onSelect={onSelectQuestion}
              getStatus={navStatus}
              canSelect={oneWay ? (index) => canGoBack && index >= 0 && index <= furthestIdx : null}
              lockedLabel={oneWay && !canGoBack ? 'closed' : 'time is up'}
              intro={intro ? {
                active: onIntro,
                onSelect: () => onSelectQuestion(INTRO_INDEX),
                ariaLabel: 'Introduction: the exam\'s description and instructions',
              } : null}
              outro={result ? null : {
                active: onSummary,
                onSelect: () => onSelectQuestion(questions.length),
                label: CHECK_ICON,
                ariaLabel: 'Summary: your answers, and the Submit Exam button',
              }}
            />
            <NavLegend marked={Boolean(result)} timed={rules.usesQuestionTimer} oneWay={oneWay} closes={oneWay && !canGoBack} />
          </div>
        </nav>
      </main>
    </>
  );
}

function ResultSummary({ result, rules, totalSpent }) {
  return (
    <section className={`mbep-result ${result.passed ? 'is-passed' : 'is-failed'}`} aria-label="Your score">
      <div className="mbep-result-main">
        <span className="mbep-result-badge">{result.passed ? CHECK_ICON : CROSS_ICON} {result.passed ? 'Passed' : 'Failed'}</span>
        <h2 className="mbep-result-score">
          <strong>{result.earnedPoints}</strong> / {plural(result.totalPoints, 'point')}
        </h2>
        <span className="mbep-result-percent">{result.percent.toFixed(1)}%</span>
      </div>
      <ul className="mbep-facts">
        <li>{CHECK_ICON} {result.correctCount} correct</li>
        <li>{CROSS_ICON} {result.wrongCount} wrong</li>
        <li>{QUESTIONS_ICON} {result.blankCount} blank</li>
        <li>{TIMER_RULE_ICON} {formatClock(totalSpent)} spent</li>
      </ul>
      <p className="mbep-result-note">
        Passing is {result.passingThreshold}%{rules.usesCustomPoints ? ' of the points' : ''}. Right answers are in green;
        open any question to see it, the points it earned and the time spent on it.
      </p>
    </section>
  );
}

// Before question 1: what the exam is, its description and instructions, and how its clocks work
function IntroSheet({ intro, questionCount, rules, examSeconds, clockStarted, marked, onStart }) {
  const description = intro.description?.trim();
  const instructions = intro.instructions?.trim();
  const threshold = Number(intro.passingThreshold);

  return (
    <article className="mbep-card mbep-sheet mbep-intro" aria-labelledby="mbep-sheet-heading">
      <header className="mbep-sheet-top">
        <div className="mbep-sheet-title">
          <h2 id="mbep-sheet-heading" className="mbep-sheet-number">Introduction</h2>
        </div>
      </header>

      <div className="mbep-card-body">
        <ul className="mbep-facts" aria-label="About this exam">
          <li>{QUESTIONS_ICON} {plural(questionCount, 'question')}</li>
          {rules.usesCustomPoints && <li>{POINTS_RULE_ICON} {plural(rules.totalPoints, 'point')}</li>}
          <li>{TIMER_RULE_ICON} {examSeconds > 0 ? `${formatDuration(examSeconds)} in all` : 'No time limit'}</li>
          {rules.usesQuestionTimer && <li>{TIMER_RULE_ICON} Each question has its own time</li>}
          {rules.oneWay && <li>{ONE_WAY_RULE_ICON} One question at a time, {rules.allowBack ? 'no skipping ahead' : 'no going back'}</li>}
          {Number.isFinite(threshold) && <li>{CHECK_ICON} Passing is {threshold}%</li>}
        </ul>

        {description && (
          <section className="mbep-intro-section">
            <h3>Description</h3>
            <p>{description}</p>
          </section>
        )}
        {instructions && (
          <section className="mbep-intro-section">
            <h3>Instructions</h3>
            <p>{instructions}</p>
          </section>
        )}
        {!description && !instructions && (
          <p className="mbep-intro-empty">This exam has no description or instructions.</p>
        )}
        {rules.oneWay && (
          <section className="mbep-intro-section">
            <h3>One question at a time</h3>
            <p>
              The questions come in order, one at a time. Submit your answer to get the next question;
              every question needs an answer before you can go on.
              {' '}
              {rules.allowBack
                ? "You can go back to look at the questions you have already answered, but you can't change them, and you can't skip ahead."
                : "You can't go back to a question after you submit it."}
              {' '}
              So check your answer before you submit it.
              {rules.usesQuestionTimer
                ? ' Each question has its own time, shown beside it. At 0:00 it is submitted with the answer you picked, and the next question opens.'
                : ''}
              {' '}
              After the last question you get a summary of your answers, with the Submit Exam button.
            </p>
          </section>
        )}
        {rules.usesQuestionTimer && !rules.oneWay && (
          <section className="mbep-intro-section">
            <h3>Question timers</h3>
            <p>
              Each question's time shows beside it, and runs only while that question is open. What is
              left stays with the question when you move to another. At 0:00 the question locks with the
              answer you picked, and the next question opens.
            </p>
          </section>
        )}

        <div className="mbep-intro-start">
          {!marked && (
            <p>{clockStarted ? "Your time is running." : 'Your time starts when you open question 1.'}</p>
          )}
          <button type="button" className="mbep-action" onClick={onStart}>
            {clockStarted || marked ? 'Go to Question 1' : 'Start with Question 1'} →
          </button>
        </div>
      </div>
    </article>
  );
}

// submitted: a question gone back to with one-way navigation, which can be read but not changed
function QuestionSheet({ question, number, count, setRange, selectedId, onAnswer, rules, clock, mark, submitted = false, onZoomImage }) {
  const { points, seconds } = rules.of(question);
  const left = clock.questionLeft(question);
  const locked = clock.isLocked(question);
  const timed = seconds !== null && !mark && !submitted;
  const low = timed && !locked && questionTimeIsLow(left, seconds);
  const canAnswer = !mark && !locked && !submitted;

  let markClass = '';
  let markText = '';
  if (mark) {
    markClass = mark.isCorrect ? 'is-correct' : mark.answered ? 'is-wrong' : 'is-blank';
    markText = mark.isCorrect ? 'Correct' : mark.answered ? 'Wrong' : 'Blank';
  }

  return (
    <article className={`mbep-card mbep-sheet${locked && !mark ? ' is-locked' : ''}`} aria-labelledby="mbep-sheet-heading">
      <header className="mbep-sheet-top">
        <div className="mbep-sheet-title">
          <h2 id="mbep-sheet-heading" className="mbep-sheet-number">
            Question {number} <span>of {count}</span>
          </h2>
          {setRange && (
            <span className="mbep-set-badge">
              {setRange.first === setRange.last
                ? 'Question set'
                : `Question set · Questions ${setRange.first}–${setRange.last}`}
            </span>
          )}
        </div>

        <div className="mbep-sheet-rules">
          {mark && (
            <span className={`mbep-mark ${markClass}`}>
              {mark.isCorrect ? CHECK_ICON : CROSS_ICON} {markText}
              {rules.usesCustomPoints && <span className="mbep-mark-points"> · {mark.earned} of {plural(points, 'point')}</span>}
            </span>
          )}
          {!mark && rules.usesCustomPoints && (
            <span className="mbep-rule-chip" title="What a right answer earns">
              {POINTS_RULE_ICON} {plural(points, 'point')}
            </span>
          )}
          {mark && (
            <span className="mbep-rule-chip" title="Time spent on this question">
              {TIMER_RULE_ICON} {formatClock(clock.spent(question))}{seconds !== null ? ` of ${formatClock(seconds)}` : ''} spent
            </span>
          )}
          {timed && (
            <span
              className={`mbep-qclock${low ? ' is-low' : ''}${locked ? ' is-out' : ''}`}
              role="timer"
              aria-label={locked ? 'Time is up for this question' : `Time left on this question: ${formatClock(left)}`}
            >
              {locked ? LOCK_ICON : TIMER_RULE_ICON}
              <strong>{locked ? "Time's up" : formatClock(left)}</strong>
              {!locked && <span className="mbep-qclock-label">left</span>}
            </span>
          )}
        </div>
      </header>

      {timed && (
        <div className={`mbep-qclock-bar${low ? ' is-low' : ''}`} aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, (left / seconds) * 100))}%` }} />
        </div>
      )}

      <div className="mbep-card-body">
        {submitted && !mark && !locked && (
          <p className="mbep-locked-note">
            {LOCK_ICON}
            <span>You submitted this answer. You can look at it, but it can't be changed.</span>
          </p>
        )}
        {locked && !mark && (
          <p className="mbep-locked-note">
            {LOCK_ICON}
            <span>
              Time's up for this question. {selectedId ? 'Your answer is kept' : 'It was left blank'} and can't be changed.
            </span>
          </p>
        )}

        {(question.groupContext || question.groupContextImages?.length > 0) && (
          <div className="mbep-group-context-box">
            <div className="mbep-group-context-header">
              <span>Shared Passage</span>
            </div>
            {question.groupContext && (
              <SafeHtml tag="div" className="mbep-group-context-text" html={question.groupContext} />
            )}
            <PassageImages images={question.groupContextImages} onZoom={onZoomImage} />
          </div>
        )}

        {question.description && (
          <SafeHtml tag="div" className="mbep-question-text" html={question.description} />
        )}

        {question.images?.length > 0 && (
          <div className="mbep-question-images">
            {question.images.map((image, index) => (
              <AuthImage
                key={index}
                src={imageSrc(image)}
                alt={`Question ${number} image ${index + 1}`}
                className="mbep-question-image"
                onClick={() => onZoomImage?.(imageSrc(image))}
              />
            ))}
          </div>
        )}

        <div className="mbep-options" role="radiogroup" aria-label={`Answers to question ${number}`}>
          {(question.answers || []).map((answer) => {
            const isSelected = String(selectedId) === String(answer._id);
            let className = 'mbep-option';
            if (!mark && isSelected) className += ' is-selected-preview';
            if (mark && answer.isCorrect) className += ' is-correct';
            if (mark && isSelected && !answer.isCorrect) className += ' is-wrong-preview';
            if (canAnswer) className += ' is-pickable';
            else if (!mark) className += ' is-locked';

            const pick = () => { if (canAnswer) onAnswer(idOf(question), answer._id); };
            return (
              <div
                key={answer._id}
                className={className}
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!canAnswer}
                tabIndex={canAnswer ? 0 : -1}
                onClick={pick}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pick();
                  }
                }}
              >
                <div className="mbep-option-circle">{answer.optionLabel}</div>
                <div className="mbep-option-text">
                  <SafeHtml html={answer.text} />
                  <AnswerImage src={answer.image} alt={`Answer ${answer.optionLabel} image`} onZoom={onZoomImage} className="answer-image--block" />
                </div>
                {mark && answer.isCorrect && <span className="mbep-option-tag is-correct">{isSelected ? 'Your answer' : 'Right answer'}</span>}
                {mark && isSelected && !answer.isCorrect && <span className="mbep-option-tag is-wrong">Your answer</span>}
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}

// The last stop: every question's number and the answer picked for it, before the exam is
// submitted. onOpen(index) opens a question from its row; canChange says whether it can still
// be answered there.
function SummarySheet({ questions, answers, clock, onOpen, canChange }) {
  const rows = questions.map((item, index) => {
    const picked = (item.answers || []).find((answer) => String(answer._id) === String(answers[idOf(item)]));
    return { item, index, picked, locked: clock.isLocked(item) };
  });
  const answeredCount = rows.filter((row) => row.picked).length;
  const blankCount = rows.length - answeredCount;

  return (
    <article className="mbep-card mbep-sheet mbep-summary" aria-labelledby="mbep-sheet-heading">
      <header className="mbep-sheet-top">
        <div className="mbep-sheet-title">
          <h2 id="mbep-sheet-heading" className="mbep-sheet-number">Your Answers</h2>
        </div>
      </header>

      <div className="mbep-card-body">
        <ul className="mbep-facts" aria-label="How many are answered">
          <li>{CHECK_ICON} {answeredCount} of {rows.length} answered</li>
          {blankCount > 0 && <li>{QUESTIONS_ICON} {blankCount} not answered</li>}
        </ul>
        <p className="mbep-summary-note">
          {blankCount > 0
            ? `${plural(blankCount, 'question')} ${blankCount === 1 ? 'has' : 'have'} no answer.`
            : 'Every question has an answer.'}
          {' '}
          {onOpen
            ? (canChange ? 'Pick a number to go back and change its answer.' : "Pick a number to look at that question; its answer can't be changed.")
            : "Answers can't be changed now."}
          {' '}
          Submit Exam is below, and nothing can be changed after it.
        </p>

        <ol className="mbep-summary-list">
          {rows.map(({ item, index, picked, locked }) => {
            const body = (
              <>
                <span className="mbep-summary-number">{index + 1}</span>
                {picked ? (
                  <span className="mbep-summary-answer">
                    <strong>{picked.optionLabel}</strong>
                    <SafeHtml html={truncateHtml(picked.text || '', 70)} fallback="Picture answer" />
                  </span>
                ) : (
                  <span className="mbep-summary-answer is-blank">No answer</span>
                )}
                {locked && <span className="mbep-summary-lock" title="Time's up">{LOCK_ICON}</span>}
              </>
            );
            const className = `mbep-summary-row${picked ? '' : ' is-blank'}`;
            return (
              <li key={idOf(item)}>
                {onOpen ? (
                  <button
                    type="button"
                    className={`${className} is-link`}
                    onClick={() => onOpen(index)}
                    aria-label={`Question ${index + 1}: ${picked ? `answer ${picked.optionLabel}` : 'no answer'}. Open it.`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={className}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </article>
  );
}

// What the bubbles' looks mean, shown once there is more to them than answered or not
function NavLegend({ marked, timed, oneWay, closes }) {
  if (!marked && !timed && !oneWay) return null;
  let items = [['is-correct', 'Correct'], ['is-wrong', 'Wrong or blank']];
  if (!marked) {
    items = [['is-done', 'Answered'], ['', 'Not answered']];
    // The lock: a question left behind for good, or one whose time ran out
    if (closes) items.push(['is-locked', 'Closed']);
    else if (timed) items.push(['is-locked', "Time's up"]);
  }
  return (
    <ul className="mbep-nav-legend" aria-hidden="true">
      {items.map(([tone, label]) => (
        <li key={label}>
          <span className={`mbep-legend-dot ${tone}`}>{tone === 'is-locked' ? LOCK_ICON : null}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}
