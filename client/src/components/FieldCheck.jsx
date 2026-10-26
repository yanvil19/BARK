import '../styles/components/FieldCheck.css';

// Grey circle + check beside a field label or tab; turns green once valid / complete
export default function FieldCheck({ valid, validText = 'Valid', invalidText = 'Not yet valid' }) {
  return (
    <span
      className={`field-check${valid ? ' is-valid' : ''}`}
      role="img"
      aria-label={valid ? validText : invalidText}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 8.5l2.5 2.5L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}
