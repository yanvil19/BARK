import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/Modal.css';

export function Modal({ open, onClose, title, children, size = 'default', bodyClassName = '' }) {
  const modalRef = useRef(null);

  // Close on Escape key while open
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  const handleBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={modalRef}
      className={`custom-modal custom-modal--${size}`}
      onMouseDown={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="custom-modal-dialog" role="document">
        <div className="custom-modal-header">
          <h2>{title}</h2>
          <button type="button" className="custom-modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className={`custom-modal-body ${bodyClassName}`.trim()}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
