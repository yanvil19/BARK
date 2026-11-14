import SafeHtml, { truncateHtml } from './SafeHtml.jsx';

// A set's questions, hung under its card in a question list (the ca- list and panel pages) and
// joined to the card by a thick line. The set stays one item in the list: its card opens and
// selects it as a whole, and a row opens it at that question. While the set is open its line is
// darker and the question shown in the panel is marked.
//
// Props:
// - members: the set's questions, in set order
// - open: whether the set is the one in the panel; activeIndex: the member shown there
// - onOpenMember(index)
// - cardIndex: the set card's place on the page, so the rows come in right after it
// - numberOf(member, index): the number in a row's circle, 1 to N within the set unless a list
//   numbers its questions another way (Question Settings uses the exam's numbers)
// - renderAside(member, index): more on the right of a row, such as its points and time
// - rowClassName(member, index): an extra class for a row, such as one for a bad value
export default function SetMemberRows({
  members = [],
  open = false,
  activeIndex = -1,
  onOpenMember,
  cardIndex = 0,
  numberOf = null,
  renderAside = null,
  rowClassName = null,
}) {
  if (members.length === 0) return null;

  return (
    <ol
      className={`ca-set-rows${open ? ' is-open-set' : ''}`}
      style={{ '--card-index': cardIndex }}
      aria-label={`The set's ${members.length} questions`}
    >
      {members.map((member, index) => {
        const isActive = open && index === activeIndex;
        const number = numberOf ? numberOf(member, index) : index + 1;
        const extraClass = rowClassName?.(member, index);
        const aside = renderAside?.(member, index);
        return (
          <li key={member._id}>
            <button
              type="button"
              className={['ca-set-row', isActive ? 'is-active' : '', extraClass || ''].filter(Boolean).join(' ')}
              onClick={(event) => {
                event.stopPropagation();
                onOpenMember?.(index);
              }}
              aria-label={numberOf ? `Open question ${number}` : `Open question ${number} of this set`}
              aria-current={isActive ? 'true' : undefined}
            >
              <span className="ca-set-row-number" aria-hidden="true">{number}</span>
              <SafeHtml className="ca-set-row-text" html={truncateHtml(member.description, 120)} fallback="No question text" />
              {aside && <span className="ca-set-row-aside">{aside}</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
