import '../styles/components/ImportReviewBubbles.css';

// [IMPORT REVIEW - BUBBLE NAVIGATION]
// Bubble navigation system for import review - matches StudentExamRunner styling.
// A bordered section with the progress text in a header bar, like the sections
// of QuestionDetailPanels.
export default function ImportReviewBubbles({ questions, currentIdx, onSelectQuestion, getQuestionFlags, readOnly = false }) {
  const readyCount = questions.filter(q => {
    const flags = typeof getQuestionFlags === 'function' ? getQuestionFlags(q) : [];
    return flags.length === 0;
  }).length;
  const totalCount = questions.length;

  return (
    <div className="import-review-bubble-wrapper">
      <div className="import-review-progress">
        <span className="import-review-progress-text">
          {readOnly
            ? `Question ${currentIdx + 1} of ${totalCount}`
            : `${readyCount} of ${totalCount} questions ready`}
        </span>
      </div>

      <div className="import-review-nav-bar">
        {questions.map((q, i) => {
          const flags = typeof getQuestionFlags === 'function' ? getQuestionFlags(q) : [];
          const hasFlags = flags.length > 0;

          let bubbleClass = "import-review-nav-bubble";
          if (currentIdx === i) bubbleClass += " active";
          else if (readOnly || !hasFlags) bubbleClass += " ready";
          else bubbleClass += " flagged";

          return (
            <button
              key={i}
              type="button"
              className={bubbleClass}
              onClick={() => onSelectQuestion(i)}
              title={`Question ${i + 1}${!readOnly && hasFlags ? ` (${flags.length} flags)` : ''}`}
            >
              <span className="bubble-number">{i + 1}</span>
              {!readOnly && hasFlags && (
                <span className="bubble-flag-badge">{flags.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
