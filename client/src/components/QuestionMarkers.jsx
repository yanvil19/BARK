import { getStatusLabel } from '../utils/statusLabels.js';

// The small round markers on list cards and the legend that explains them, shared by
// Approve Questions, My Questions, Board Exams and Manage Subjects. Their styles are in
// styles/shared/QuestionApprovals.css.

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

export const EXAM_STATUSES = {
  draft: { label: 'Draft', icon: <path d="M4 20l1-4L16 5l3 3L8 19l-4 1z" /> },
  published: { label: 'Published', icon: <path d="M21 3L3 11l7 3 3 7 8-18z" /> },
  // A faint ring with two opposite arcs running round it (ca-ongoing-spin in QuestionApprovals.css).
  // Two arcs, not one, so the icon's weight stays on the centre at every angle.
  ongoing: {
    label: 'Ongoing',
    icon: (
      <>
        <circle cx="12" cy="12" r="8" opacity="0.3" />
        <path className="ca-ongoing-spin" d="M12 4a8 8 0 0 1 8 8M12 20a8 8 0 0 1-8-8" />
      </>
    ),
  },
  finished: { label: 'Finished', icon: <path d="M5 12.5l4.5 4.5L19 7.5" /> },
  archived: { label: 'Archived', icon: <><path d="M3 4h18v4H3z" /><path d="M5 8v12h14V8" /><path d="M10 12h4" /></> },
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

// A status spelled out with its icon, for where no legend explains the markers
export function StatePill({ state }) {
  return (
    <span className={`ca-status-pill ca-state--${state}`}>
      <MarkerIcon>{STATE_MARKERS[state]?.icon}</MarkerIcon>
      {getStatusLabel(state)}
    </span>
  );
}

export function ExamStatePill({ status }) {
  return (
    <span className={`ca-status-pill ca-exam-state--${status}`}>
      <MarkerIcon>{EXAM_STATUSES[status]?.icon}</MarkerIcon>
      {EXAM_STATUSES[status]?.label || status}
    </span>
  );
}

// Says what the markers on the cards mean, so the cards need no long labels.
// items are { text, className, content }, a marker sample and its meaning, or { separator: true }
// for a small dot between groups. Given onToggle, an item with a filterKey is also a switch that
// shows or hides its cards (mix and match); hiddenKeys holds the keys switched off, which are
// faded and crossed out.
export function MarkerLegend({ items, ariaLabel, hiddenKeys, onToggle, className = '' }) {
  return (
    <div className={`ca-legend ${className}`.trim()} role="group" aria-label={ariaLabel}>
      {items.map(({ text, className, content, filterKey, separator }, index) => {
        if (separator) return <span key={`separator-${index}`} className="ca-legend-sep" aria-hidden="true" />;
        const marker = <Marker className={className}>{content}</Marker>;
        if (!onToggle || !filterKey) {
          return (
            <span key={text} className="ca-legend-item">
              {marker}
              {text}
            </span>
          );
        }
        const off = Boolean(hiddenKeys?.has(filterKey));
        return (
          <button
            key={text}
            type="button"
            className={`ca-legend-item ca-legend-toggle${off ? ' is-off' : ''}`}
            aria-pressed={!off}
            title={off ? `Hidden: click to show ${text}` : `Shown: click to hide ${text}`}
            onClick={() => onToggle(filterKey)}
          >
            {marker}
            <span className="ca-legend-text">{text}</span>
          </button>
        );
      })}
    </div>
  );
}

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

  return <MarkerLegend items={items} ariaLabel="What the question markers mean" />;
}
