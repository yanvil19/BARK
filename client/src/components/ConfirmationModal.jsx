import { Modal } from './Modal.jsx';

export function ConfirmationModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'danger',
  busy = false,
  error = '',
  children,
}) {
  const confirmClassName = confirmVariant === 'danger' ? 'modal-btn-danger' : 'modal-btn-primary';

  return (
    <Modal open={open} onClose={onClose} title={title} size="compact" bodyClassName="custom-modal-body--compact">
      <div className="modal-confirmation">
        {message ? <div className="modal-confirmation-message">{message}</div> : null}
        {children ? <div className="modal-confirmation-extra">{children}</div> : null}
      </div>
      {error ? <p className="modal-error">{error}</p> : null}
      <div className="modal-actions">
        <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </button>
        <button type="button" className={confirmClassName} onClick={onConfirm} disabled={busy}>
          {busy ? 'Please wait...' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
