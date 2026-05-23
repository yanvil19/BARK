import { Modal } from './Modal.jsx';

export function FeedbackModal({
  open,
  onClose,
  title,
  message,
  tone = 'info',
  dismissLabel = 'Okay',
  showDismissButton = true,
  children,
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="compact" bodyClassName="custom-modal-body--compact">
      <div className={`modal-feedback modal-feedback--${tone}`}>
        {message ? <div className="modal-feedback-message">{message}</div> : null}
        {children ? <div className="modal-feedback-extra">{children}</div> : null}
      </div>

      {showDismissButton ? (
        <div className="modal-actions">
          <button type="button" className="modal-btn-primary" onClick={onClose}>
            {dismissLabel}
          </button>
        </div>
      ) : null}
    </Modal>
  );
}
