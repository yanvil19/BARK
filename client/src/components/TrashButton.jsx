import '../styles/components/TrashButton.css';

// Trash can icon, shared by every delete and remove button
export function TrashIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" />
    </svg>
  );
}

// Icon-only delete button. The label is read by screen readers and shown on hover.
export default function TrashButton({ label, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`trash-btn ${className}`.trim()}
      title={label}
      aria-label={label}
      {...props}
    >
      <TrashIcon />
    </button>
  );
}
