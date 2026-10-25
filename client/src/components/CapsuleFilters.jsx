import '../styles/components/CapsuleFilters.css';

// Row of pill-shaped filter buttons with an optional count badge.
// options: [{ value, label, count? }] — exactly one option is active (matches `value`).
export default function CapsuleFilters({ options, value, onChange, ariaLabel = 'Filters', className = '' }) {
  return (
    <div className={`capsule-filters ${className}`} role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={`capsule-filter${isActive ? ' capsule-filter--active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className="capsule-filter-count">{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
