// The header of a list page's side panel: the title, buttons beside it that switch what the panel
// shows, and the expand and close buttons. Its styles are in styles/shared/QuestionApprovals.css.
export default function PanelHeader({
  title,
  views,
  view,
  onViewChange,
  isExpanded,
  onToggleExpanded,
  onClose,
  closeLabel,
}) {
  const expandLabel = isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar';

  return (
    <div className="ca-sidebar-header">
      <div className="ca-panel-heading">
        <h2 className="ca-sidebar-title">{title}</h2>
        <div className="ca-view-toggle ca-panel-toggle" role="group" aria-label="Show in this panel">
          {views.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={view === value ? 'is-active' : ''}
              onClick={() => onViewChange(value)}
              aria-pressed={view === value}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="ca-sidebar-header-actions">
        <button
          type="button"
          className="ca-sidebar-expand-btn"
          onClick={onToggleExpanded}
          title={expandLabel}
          aria-label={expandLabel}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {isExpanded ? (
              <>
                <path d="M4 14h6v6" />
                <path d="M20 10h-6V4" />
                <path d="M14 10l7-7" />
                <path d="M10 14l-7 7" />
              </>
            ) : (
              <>
                <path d="M15 3h6v6" />
                <path d="M9 21H3v-6" />
                <path d="M21 3l-7 7" />
                <path d="M3 21l7-7" />
              </>
            )}
          </svg>
        </button>
        <button type="button" className="ca-sidebar-close" aria-label={closeLabel} onClick={onClose}>x</button>
      </div>
    </div>
  );
}
