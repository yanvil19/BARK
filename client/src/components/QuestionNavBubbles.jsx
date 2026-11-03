import '../styles/components/QuestionNavBubbles.css';

// Numbered question bubbles: the one navigator used wherever questions are
// stepped through one at a time (the exam runners, the exam preview and test
// run, the question form, and the read-only question set views). The look is
// the alumni exam runner's.
//
// - A standalone question is a circle.
// - Neighbouring questions of one set share a capsule. The capsule fills from
//   the left by the share of done questions (answered in an exam, ready in an
//   import review). A set too long for the row wraps inside its capsule.
// - The current question is navy with a yellow number. A question with flags
//   (import review) has a red number and a red badge with its flag count.
//
// Props:
// - questions, currentIdx, onSelect(index)
// - getStatus(question, index) → { done, flags }; leave it out when there is
//   nothing to track (previews and read-only views)
// - doneLabel: read out for a done question ("answered", "ready")
// - getSetKey(question) → the set a question belongs to, or null; defaults to
//   its groupId

const defaultSetKey = (question) => question?.groupId ?? null;

function hasSetKey(key) {
  return key !== null && key !== undefined && key !== '';
}

// Runs of neighbouring questions with the same set key become one capsule
function buildNavItems(questions, getSetKey) {
  const items = [];
  for (let i = 0; i < questions.length;) {
    const key = getSetKey(questions[i]);
    if (!hasSetKey(key)) {
      items.push({ type: 'question', index: i });
      i += 1;
      continue;
    }

    let end = i + 1;
    while (end < questions.length) {
      const nextKey = getSetKey(questions[end]);
      if (!hasSetKey(nextKey) || String(nextKey) !== String(key)) break;
      end += 1;
    }
    items.push({ type: 'set', start: i, end });
    i = end;
  }
  return items;
}

export default function QuestionNavBubbles({
  questions = [],
  currentIdx,
  onSelect,
  getStatus,
  doneLabel = 'answered',
  getSetKey = defaultSetKey,
  className = '',
}) {
  const statuses = questions.map((question, index) => {
    const status = typeof getStatus === 'function' ? getStatus(question, index) : null;
    return { done: Boolean(status?.done), flags: Number(status?.flags) || 0 };
  });

  function describe(index) {
    const { done, flags } = statuses[index];
    if (flags > 0) return `Question ${index + 1}, ${flags} flag${flags === 1 ? '' : 's'}`;
    return `Question ${index + 1}${done ? `, ${doneLabel}` : ''}`;
  }

  function renderBubble(index, baseClass) {
    const { done, flags } = statuses[index];
    const isActive = index === currentIdx;

    let className = baseClass;
    if (isActive) className += ' is-active';
    else if (flags > 0) className += ' is-flagged';
    else if (done) className += ' is-done';

    return (
      <button
        key={index}
        type="button"
        className={className}
        onClick={() => onSelect?.(index)}
        aria-label={describe(index)}
        aria-current={isActive ? 'step' : undefined}
      >
        {index + 1}
        {flags > 0 && <span className="qnb-flag-badge" aria-hidden="true">{flags}</span>}
      </button>
    );
  }

  return (
    <div className={`qnb-bar${className ? ` ${className}` : ''}`}>
      {buildNavItems(questions, getSetKey).map((item) => {
        if (item.type === 'question') return renderBubble(item.index, 'qnb-circle');

        const indexes = Array.from({ length: item.end - item.start }, (_, i) => item.start + i);
        const doneCount = indexes.filter((index) => statuses[index].done).length;
        const label = typeof getStatus === 'function'
          ? `Question set, ${doneCount} of ${indexes.length} ${doneLabel}`
          : `Question set, questions ${item.start + 1} to ${item.end}`;

        return (
          <div
            key={`set-${item.start}`}
            className="qnb-set"
            style={{ '--qnb-set-progress': `${(doneCount / indexes.length) * 100}%` }}
            role="group"
            aria-label={label}
          >
            {indexes.map((index) => renderBubble(index, 'qnb-set-item'))}
          </div>
        );
      })}
    </div>
  );
}
