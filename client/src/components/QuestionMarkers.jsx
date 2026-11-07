import { getStatusLabel } from '../utils/statusLabels.js';

// The small round markers on question cards and the legend that explains them, shared by
// Approve Questions and My Questions. Their styles are in styles/shared/QuestionApprovals.css.

export function MarkerIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

const STATE_MARKERS = {
  draft: { legend: 'Draft', icon: <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /> },
  pending_chair: { legend: 'Pending', icon: <path d="M12 6v6l4 2" /> },
  restored: { legend: 'Restored', icon: <><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4v5h5" /></> },
  returned: { legend: 'Returned', icon: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 6 6v4" /></> },
  approved: { legend: 'Approved', icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  rejected: { legend: 'Rejected', icon: <path d="M6 6l12 12M18 6L6 18" /> },
};

export const USED_IN_EXAM_ICON = <MarkerIcon><path d="M6 3h9l4 4v14H6z" /><path d="M9.5 12h6M9.5 16h6" /></MarkerIcon>;
export const EVALUATING_DOT = <span className="ca-evaluating-dot" />;

// A small round marker on a question card. Without a label it is only a sample in the legend.
export function Marker({ className, label, children }) {
  return (
    <span
      className={`ca-marker ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      title={label}
    >
      {children}
    </span>
  );
}

export function StateMarker({ state }) {
  return (
    <Marker className={`ca-state--${state}`} label={getStatusLabel(state)}>
      <MarkerIcon>{STATE_MARKERS[state]?.icon}</MarkerIcon>
    </Marker>
  );
}

// Says what the markers on the question cards mean, so the cards need no long labels
export function CardLegend({ states, showEvaluating = false }) {
  const items = [
    { text: 'Questions', className: 'ca-marker--count', content: '#' },
    ...states.map((state) => ({
      text: STATE_MARKERS[state].legend,
      className: `ca-state--${state}`,
      content: <MarkerIcon>{STATE_MARKERS[state].icon}</MarkerIcon>,
    })),
    { text: 'Used in exam', className: 'ca-marker--used', content: USED_IN_EXAM_ICON },
    ...(showEvaluating ? [{ text: 'Being evaluated', className: 'ca-marker--evaluating', content: EVALUATING_DOT }] : []),
  ];

  return (
    <div className="ca-legend" role="group" aria-label="What the question markers mean">
      {items.map(({ text, className, content }) => (
        <span key={text} className="ca-legend-item">
          <Marker className={className}>{content}</Marker>
          {text}
        </span>
      ))}
    </div>
  );
}
