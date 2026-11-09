import '../styles/components/QuestionNavBubbles.css';
import { LOCK_ICON } from './ExamRuleIcons.jsx';

// Numbered question bubbles: the one navigator used wherever questions are
// stepped through one at a time (the exam runners, the exam preview and test
// run, the question form, and the read-only question set views). The look is
// the alumni exam runner's.
//
// - A standalone question is a circle.
// - Neighbouring questions of one set share a capsule, its bubbles a little
//   apart. A set too long for the row wraps inside its capsule.
// - A done question (answered in an exam, ready in an import review) is shaded,
//   each bubble on its own, in a set too.
// - The current question is navy with a yellow number. A question with flags
//   (import review) has a red number and a red badge with its flag count.
// - A question whose time is up (question timers) has a grey lock badge.
// - Once an exam is marked, a right answer is green and a wrong or blank one red.
//
// Props:
// - questions, currentIdx, onSelect(index)
// - getStatus(question, index) → { done, flags, locked, result: 'correct' | 'wrong' };
//   leave it out when there is
//   nothing to track (previews and read-only views)
// - doneLabel: read out for a done question ("answered", "ready")
// - intro: { active, onSelect, label = '0', ariaLabel = 'Introduction' } adds a
//   bubble before question 1 for an introduction (an exam's description and
//   instructions)
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
  intro = null,
}) {
  const statuses = questions.map((question, index) => {
    const status = typeof getStatus === 'function' ? getStatus(question, index) : null;
    return {
      done: Boolean(status?.done),
      flags: Number(status?.flags) || 0,
      locked: Boolean(status?.locked),
      result: status?.result === 'correct' || status?.result === 'wrong' ? status.result : null,
    };
  });

  function describe(index) {
    const { done, flags, locked, result } = statuses[index];
    if (flags > 0) return `Question ${index + 1}, ${flags} flag${flags === 1 ? '' : 's'}`;
    const parts = [`Question ${index + 1}`];
    if (result) parts.push(result);
    else if (done) parts.push(doneLabel);
    if (locked) parts.push('time is up');
    return parts.join(', ');
  }

  function renderBubble(index, baseClass) {
    const { done, flags, locked, result } = statuses[index];
    const isActive = index === currentIdx;

    let className = baseClass;
    if (isActive) className += ' is-active';
    else if (flags > 0) className += ' is-flagged';
    else if (result) className += ` is-${result}`;
    else if (done) className += ' is-done';
    if (locked) className += ' is-locked';

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
        {locked && flags === 0 && <span className="qnb-lock-badge" aria-hidden="true">{LOCK_ICON}</span>}
      </button>
    );
  }

  return (
    <div className={`qnb-bar${className ? ` ${className}` : ''}`}>
      {intro && (
        <button
          type="button"
          className={`qnb-circle qnb-intro${intro.active ? ' is-active' : ''}`}
          onClick={() => intro.onSelect?.()}
          aria-label={intro.ariaLabel || 'Introduction'}
          aria-current={intro.active ? 'step' : undefined}
          title={intro.ariaLabel || 'Introduction'}
        >
          {intro.label ?? '0'}
        </button>
      )}
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
