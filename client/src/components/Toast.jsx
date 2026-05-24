import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import '../styles/Toast.css';

const ToastContext = createContext(null);

function generateToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timeoutsRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (message, options = {}) => {
      const id = generateToastId();
      const {
        variant = 'error',
        title,
        durationMs = 4000,
      } = options;

      setToasts((prev) => [{ id, message, variant, title }, ...prev].slice(0, 5));

      if (durationMs > 0) {
        const timeout = setTimeout(() => dismiss(id), durationMs);
        timeoutsRef.current.set(id, timeout);
      }

      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

function ToastViewport({ toasts, onDismiss }) {
  return (
    <div className="toast-viewport" role="region" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant}`} role="status" aria-live="polite">
          <div className="toast-body">
            {t.title ? <div className="toast-title">{t.title}</div> : null}
            <div className="toast-message">{t.message}</div>
          </div>
          <button type="button" className="toast-close" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

