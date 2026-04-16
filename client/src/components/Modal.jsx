import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import '../styles/Modal.css';

export function Modal({ open, onClose, title, children }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  const handleBackdropClick = (e) => {
    if (e.target === dialogRef.current) {
      onClose();
    }
  };

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialogRef}
      className="custom-modal"
      onClick={handleBackdropClick}
      onClose={onClose}
    >
      <div className="custom-modal-dialog">
        <div className="custom-modal-header">
          <h2>{title}</h2>
          <button type="button" className="custom-modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="custom-modal-body">
          {children}
        </div>
      </div>
    </dialog>,
    document.body
  );
}
