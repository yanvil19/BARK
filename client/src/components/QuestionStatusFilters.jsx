import { Marker, StateMarker, USED_IN_EXAM_ICON } from './QuestionMarkers.jsx';
import '../styles/components/QuestionStatusFilters.css';

export default function QuestionStatusFilters({
  options,
  value,
  activeValues,
  onChange,
  totalCount,
  clearValue = 'all',
  ariaLabel = 'Filter questions by status',
  doubleClickClear = false,
}) {
  const states = options.filter((option) => option.state && (option.barCount ?? option.count) > 0);
  const selectedValues = Array.isArray(activeValues)
    ? activeValues
    : value === clearValue || !value ? [] : [value];
  const hasActiveFilters = selectedValues.length > 0;
  const clearFilters = () => onChange(clearValue);

  return (
    <section
      className="question-status-filters"
      aria-label={ariaLabel}
      title={doubleClickClear ? 'Double-click a status to show everything.' : undefined}
    >
      {states.length > 0 && (
        <div
          className="question-status-filters-bar"
          role="group"
          aria-label={`Filter by question status; ${totalCount} questions across ${states.length} statuses`}
        >
          {states.map((option) => {
            const isActive = selectedValues.includes(option.value);
            return (
              <button
                type="button"
                key={option.value}
                className={`question-status-filters-segment question-status-filters-segment--${option.state}${isActive ? ' is-active' : ''}${hasActiveFilters && !isActive ? ' is-dim' : ''}`}
                style={{ flexGrow: option.barCount ?? option.count, flexBasis: 0 }}
                aria-label={`${option.label}: ${option.barCount ?? option.count}`}
                aria-pressed={isActive}
                onClick={() => onChange(option.value)}
                onDoubleClick={doubleClickClear ? clearFilters : undefined}
              />
            );
          })}
        </div>
      )}

      <div className="question-status-filters-legend" role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const isActive = selectedValues.includes(option.value);
          const marker = option.value === 'approved_used' ? (
            <Marker className="ca-marker--used">{USED_IN_EXAM_ICON}</Marker>
          ) : option.state ? (
            <StateMarker state={option.state} />
          ) : null;

          return (
            <button
              key={option.value}
              type="button"
              className={`question-status-filters-item${isActive ? ' is-active' : ''}${hasActiveFilters && !isActive ? ' is-dim' : ''}`}
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              onDoubleClick={doubleClickClear ? clearFilters : undefined}
            >
              {marker}
              <span>{option.label}</span>
              <span className="question-status-filters-count">{option.count}</span>
            </button>
          );
        })}
        {hasActiveFilters && (
          <button
            type="button"
            className="question-status-filters-clear"
            onClick={clearFilters}
          >
            Show everything
          </button>
        )}
      </div>
    </section>
  );
}
