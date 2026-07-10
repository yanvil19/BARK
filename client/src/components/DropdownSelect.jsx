import React from 'react';
import '../styles/DropdownSelect.css';

/**
 * DropdownSelect — a reusable styled select dropdown.
 *
 * Props:
 *  - value        : currently selected value
 *  - onChange     : (e) => void   (standard change handler)
 *  - options      : [{ value, label }] — array of options
 *  - placeholder  : string — empty-value option label (optional)
 *  - disabled     : boolean
 *  - id           : string (for accessibility)
 *  - className    : extra class applied to the outer wrapper
 *  - size         : 'sm' | 'md' (default: 'md')
 */
export default function DropdownSelect({
  value = '',
  onChange,
  options = [],
  placeholder,
  disabled = false,
  id,
  className = '',
  size = 'md',
}) {
  return (
    <div className={`dd-select-wrap dd-select-wrap--${size} ${disabled ? 'dd-select-wrap--disabled' : ''} ${className}`}>
      <select
        id={id}
        className="dd-select"
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {placeholder !== undefined && (
          <option value="">{placeholder}</option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Custom chevron arrow — purely decorative */}
      <span className="dd-select-arrow" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
