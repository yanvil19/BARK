// The header of a list page's side panel. The expand button is a tab on the panel's left edge,
// the side the panel widens toward, so it moves with the edge as the columns glide; then the
// title and buttons beside it that switch what the panel shows (none when views is empty);
// children (such as Approve Questions' bulk navigation) come before the full-screen and close
// buttons on the right. With onToggleFullscreen it has the full-screen button; the page puts
// is-fullscreen on the panel, which then zooms to cover the whole window, navbar and footer
// included (hooks/usePanelLayout.js keeps both states and plays the zoom). Its styles are in
// styles/shared/QuestionApprovals.css.
export default function PanelHeader({
  title,
  views = [],
  view,
  onViewChange,
  isExpanded,
  onToggleExpanded,
  isFullscreen = false,
  onToggleFullscreen,
  onClose,
  closeLabel,
  children,
}) {
  const expandLabel = isExpanded ? 'Collapse Sidebar' : 'Expand Sidebar';
  const fullscreenLabel = isFullscreen ? 'Exit full screen' : 'Full screen';

  return (
    <div className="ca-sidebar-header">
      {/* A tab on the panel's left edge, pointing the way the edge will move: < widens the
          panel over the list, > gives the list its room back. Widening means nothing while the
          panel covers the window. */}
      {!isFullscreen && (
        <button
          type="button"
          className="ca-sidebar-width-btn"
          onClick={onToggleExpanded}
          title={expandLabel}
          aria-label={expandLabel}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={isExpanded ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'} />
          </svg>
        </button>
      )}
      <div className="ca-panel-heading">
        <h2 className="ca-sidebar-title">{title}</h2>
        {views.length > 0 && (
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
        )}
      </div>
      {children}
      <div className="ca-sidebar-header-actions">
        {onToggleFullscreen && (
          <button
            type="button"
            className="ca-panel-btn ca-sidebar-expand-btn ca-sidebar-fullscreen-btn"
            onClick={onToggleFullscreen}
            title={fullscreenLabel}
            aria-label={fullscreenLabel}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {isFullscreen ? (
                <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
              ) : (
                <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
              )}
            </svg>
          </button>
        )}
        <button type="button" className="ca-panel-btn ca-sidebar-close" aria-label={closeLabel} title="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
