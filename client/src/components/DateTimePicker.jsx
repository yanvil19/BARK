// npm install react-datepicker date-fns
// Import the base styles in your main entry file:
// import "react-datepicker/dist/react-datepicker.css";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/DateTimePicker.css';

export default function DateTimePicker({ value, onChange, onCancel, autoOpen = false }) {
  const [isOpen, setIsOpen] = useState(autoOpen);
  // Hold a draft date inside the modal — only commit on Apply
  const [draft, setDraft] = useState(value ? new Date(value) : new Date());
  const [timeIntervals, setTimeIntervals] = useState(1);

  useEffect(() => {
    if (!autoOpen) return;
    setDraft(value ? new Date(value) : new Date());
    setIsOpen(true);
  }, [autoOpen, value]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        onCancel?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onCancel]);

  const handleOpen = () => {
    setDraft(value ? new Date(value) : new Date());
    setTimeIntervals(1);
    setIsOpen(true);
  };

  const handleApply = () => {
    onChange(draft.toISOString());
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
    if (onCancel) onCancel();
  };

  const displayValue = value
    ? new Date(value).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : 'Select Date & Time';

  const modal = isOpen ? (
    <div
      className="dtp-overlay"
      onMouseDown={handleCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Select date and time"
    >
      <div className="dtp-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dtp-modal-header">
          <span className="dtp-modal-title">Select Date & Time</span>
        </div>

        <div className="dtp-modal-body">
          <DatePicker
            key={`${timeIntervals}`}
            selected={draft}
            onChange={(date) => date && setDraft(date)}
            showTimeSelect
            timeFormat="hh:mm aa"
            timeIntervals={timeIntervals}
            dateFormat="MMM d, yyyy h:mm aa"
            timeCaption="Time"
            minDate={new Date()}
            inline
          />
        </div>

        <div className="dtp-intervals" aria-label="Time interval presets">
          <div className="dtp-interval-row" aria-label="Interval options">
            <span className="dtp-intervals-label">Interval</span>
            {[
              { minutes: 1, label: '1 min' },
              { minutes: 10, label: '10 min' },
              { minutes: 20, label: '20 min' },
              { minutes: 30, label: '30 min' },
              { minutes: 60, label: '60 min' },
            ].map((opt) => (
              <button
                key={opt.minutes}
                type="button"
                className={`dtp-interval-btn${timeIntervals === opt.minutes ? ' is-active' : ''}`}
                onClick={() => setTimeIntervals(opt.minutes)}
              >
                {opt.label}
              </button>
            ))}
          </div>

        </div>

        <div className="dtp-modal-preview">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <span>
            {draft.toLocaleString('en-PH', {
              weekday: 'short', month: 'long', day: 'numeric',
              year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
            })}
          </span>
        </div>

        <div className="dtp-modal-footer">
          <button type="button" className="dtp-btn-cancel" onClick={handleCancel}>Cancel</button>
          <button type="button" className="dtp-btn-apply" onClick={handleApply}>Apply</button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {!autoOpen && (
        <div className="dtp-container">
          <div className="dtp-input" onClick={handleOpen}>
            <span className="dtp-val">{displayValue}</span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <path d="M16 2v4M8 2v4M3 10h18"/>
            </svg>
          </div>
        </div>
      )}

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
