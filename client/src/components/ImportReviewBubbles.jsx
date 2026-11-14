import QuestionNavBubbles from './QuestionNavBubbles.jsx';
import '../styles/components/ImportReviewBubbles.css';

// [IMPORT REVIEW - BUBBLE NAVIGATION]
// The question navigator (QuestionNavBubbles, the exam runner's bubbles) in a
// bordered section with the progress text in a header bar, like the sections of
// QuestionDetailPanels. Used by the question form and the read-only question set
// views.
//
// Questions of one set (an imported set, a saved question group, or every
// question when allInOneSet is on) share one capsule. While editing, a question
// with no flags counts as ready, and a set's capsule fills as its questions
// become ready.

export default function ImportReviewBubbles({
  questions,
  currentIdx,
  onSelectQuestion,
  getQuestionFlags,
  readOnly = false,
  allInOneSet = false,
  // Shown at the right of the header bar, such as the current question's subject
  aside = null,
  // Read-only results: getResult(question) says 'correct' or 'wrong', which colors its bubble
  getResult = null,
}) {
  // Read-only views show no flags or progress
  const flagCounts = questions.map((q) => (
    !readOnly && typeof getQuestionFlags === 'function' ? getQuestionFlags(q).length : 0
  ));
  const readyCount = flagCounts.filter((count) => count === 0).length;

  const getSetKey = (q) => {
    if (allInOneSet) return 'all';
    if (q?.setKey) return q.setKey;
    return q?.groupId ? `group-${q.groupId}` : null;
  };

  return (
    <div className="import-review-bubble-wrapper">
      <div className="import-review-progress">
        <span className="import-review-progress-text">
          {readOnly
            ? `Question ${currentIdx + 1} of ${questions.length}`
            : `${readyCount} of ${questions.length} questions ready`}
        </span>
        {aside}
      </div>

      <QuestionNavBubbles
        className="import-review-nav-bar"
        questions={questions}
        currentIdx={currentIdx}
        onSelect={onSelectQuestion}
        getStatus={readOnly
          ? (getResult ? (question) => ({ result: getResult(question) }) : undefined)
          : (_, index) => ({ done: flagCounts[index] === 0, flags: flagCounts[index] })}
        doneLabel="ready"
        getSetKey={getSetKey}
      />
    </div>
  );
}
