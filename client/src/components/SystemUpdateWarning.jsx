import { useEffect, useState } from 'react';
import { apiAuth } from '../lib/api';
import { Modal } from './Modal';

export default function SystemUpdateWarning({ me }) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (!me || !['dean', 'program_chair', 'professor'].includes(me.role)) return;

    let sse;
    let interval;

    const fetchStatusAndConnect = async () => {
      try {
        // 1. Fetch current status in case we reconnected
        const res = await apiAuth('/api/admin/settings/status');
        if (res?.isPending && res?.expiresAt) {
          startCountdown(res.expiresAt);
        } else {
          setShowWarning(false);
          setIsDismissed(false);
          clearInterval(interval);
        }
      } catch (err) {
        console.error('Failed to fetch settings status', err);
      }

      // 2. Connect to SSE
      sse = new EventSource(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/sse/faculty`, {
        withCredentials: true,
      });

      sse.addEventListener('update_warning', (e) => {
        const data = JSON.parse(e.data);
        setIsDismissed(false); // Reset dismissal on new update
        startCountdown(data.expiresAt);
      });

      sse.addEventListener('update_cancelled', () => {
        setShowWarning(false);
        setIsDismissed(false);
        clearInterval(interval);
      });

      sse.addEventListener('update_applied', () => {
        window.location.reload();
      });

      sse.onerror = (err) => {
        console.error('SSE connection error, will auto-reconnect...', err);
        // The browser auto-reconnects, but when it does, it won't re-run our fetchStatus.
        // We could handle manual reconnect here if needed.
      };
    };

    fetchStatusAndConnect();

    function startCountdown(expiresAt) {
      clearInterval(interval);
      setShowWarning(true);
      const updateTimer = () => {
        const remaining = new Date(expiresAt).getTime() - Date.now();
        if (remaining <= 0) {
          setTimeRemaining(0);
          clearInterval(interval);
        } else {
          setTimeRemaining(Math.ceil(remaining / 1000));
        }
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }

    return () => {
      if (sse) sse.close();
      clearInterval(interval);
    };
  }, [me]);

  if (!me || !['dean', 'program_chair', 'professor'].includes(me.role)) return null;

  if (isDismissed && timeRemaining > 0) {
    return (
      <div 
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#b42318',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '12px',
          fontWeight: 'bold',
          zIndex: 9999,
          boxShadow: '0 10px 25px rgba(180, 35, 24, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }} 
        onClick={() => setIsDismissed(false)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        System Update in {timeRemaining}s
      </div>
    );
  }

  return (
    <Modal
      open={showWarning && !isDismissed}
      onClose={() => setIsDismissed(true)}
      title="System Update Pending"
      size="compact"
    >
      <div className="modal-confirmation">
        <div className="modal-confirmation-message" style={{ color: '#b42318' }}>
          <strong>Please save your work immediately.</strong>
        </div>
        <div className="modal-confirmation-extra">
          A system update will be applied in <strong>{timeRemaining}</strong> seconds. 
          Your page will automatically refresh once the update is applied.
        </div>
      </div>
      <div className="modal-actions">
        <button 
          type="button" 
          className="modal-btn-cancel" 
          onClick={() => setIsDismissed(true)}
        >
          Dismiss & Continue Working
        </button>
      </div>
    </Modal>
  );
}
