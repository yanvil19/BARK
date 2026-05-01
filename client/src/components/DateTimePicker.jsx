// npm install react-datepicker date-fns
// Import the base styles in your main entry file:
// import "react-datepicker/dist/react-datepicker.css";

import { useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import '../styles/DateTimePicker.css';

export default function DateTimePicker({ value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  // Hold a draft date inside the modal — only commit on Apply
  const [draft, setDraft] = useState(value ? new Date(value) : new Date());

  const handleOpen = () => {
    setDraft(value ? new Date(value) : new Date());
    setIsOpen(true);
  };

  const handleApply = () => {
    onChange(draft.toISOString());
    setIsOpen(false);
  };

  const handleCancel = () => {
    setIsOpen(false);
  };

  const displayValue = value
    ? new Date(value).toLocaleString('en-PH', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : 'Select Date & Time';

  return (
    <>
      {/* ── Trigger ── */}
      <div className="dtp-container">
        <div className="dtp-input" onClick={handleOpen}>
          <span className="dtp-val">{displayValue}</span>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
            <path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
        </div>
      </div>

      {/* ── Modal ── */}
      {isOpen && (
        <div className="dtp-overlay" onMouseDown={handleCancel}>
          <div className="dtp-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dtp-modal-header">
              <span className="dtp-modal-title">Select Date & Time</span>
            </div>

            <div className="dtp-modal-body">
              <DatePicker
                selected={draft}
                onChange={(date) => date && setDraft(date)}
                showTimeSelect
                timeFormat="hh:mm aa"
                timeIntervals={20}
                dateFormat="MMM d, yyyy h:mm aa"
                timeCaption="Time"
                inline  // renders calendar directly, no input/popper
              />
            </div>

            {/* Selected datetime preview */}
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
      )}
    </>
  );
}