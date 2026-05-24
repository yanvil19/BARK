import '../styles/ImportReviewBubbles.css';

// [IMPORT REVIEW - BUBBLE NAVIGATION]
// Bubble navigation system for import review - matches StudentExamRunner styling
export default function ImportReviewBubbles({ questions, currentIdx, onSelectQuestion, getQuestionFlags }) {
  const readyCount = questions.filter(q => {
    const flags = getQuestionFlags(q);
    return flags.length === 0;
  }).length;
  const totalCount = questions.length;

  return (
    <div className="import-review-bubble-wrapper">
      <div className="import-review-progress">
        <span className="import-review-progress-text">
          {readyCount} of {totalCount} questions ready
        </span>
      </div>

      <div className="import-review-nav-bar">
        {questions.map((q, i) => {
          const flags = getQuestionFlags(q);
          const hasFlags = flags.length > 0;

          let bubbleClass = "import-review-nav-bubble";
          if (currentIdx === i) bubbleClass += " active";
          else if (!hasFlags) bubbleClass += " ready";
          else bubbleClass += " flagged";

          return (
            <button
              key={i}
              className={bubbleClass}
              onClick={() => onSelectQuestion(i)}
              title={`Question ${i + 1}${hasFlags ? ` (${flags.length} flags)` : ' (ready)'}`}
            >
              <span className="bubble-number">{i + 1}</span>
              {hasFlags && (
                <span className="bubble-flag-badge">{flags.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
