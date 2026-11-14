import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/Modal.css';

// The open modals, oldest first. Escape closes only the newest, so a modal opened from another
// (a date picker inside a form window) closes without taking the window with it.
const openModals = [];

export function Modal({ open, onClose, title, children, size = 'default', bodyClassName = '' }) {
  const modalRef = useRef(null);

  // Read through a ref, so a new onClose doesn't move this modal to the top of the stack
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Close on Escape key while open, when this is the newest open modal
  useEffect(() => {
    if (!open) return undefined;
    const entry = {};
    openModals.push(entry);
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === entry) onCloseRef.current?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      const index = openModals.indexOf(entry);
      if (index !== -1) openModals.splice(index, 1);
    };
  }, [open]);

  // Hide virtual keyboard when modal closes or unmounts
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.mathVirtualKeyboard) {
        window.mathVirtualKeyboard.hide();
      }
    };
  }, [open]);

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
