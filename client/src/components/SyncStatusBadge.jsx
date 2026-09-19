import { useEffect, useState, useCallback } from 'react';
import { getPendingAttempts, removePendingAttempt, getOfflineProfile } from '../lib/offlineDb';
import { getStoredAuthToken } from '../lib/api';

const BASE = import.meta.env.VITE_API_URL || '';

export default function SyncStatusBadge({ onRequireLogin }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingAttempts, setPendingAttempts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState(null);

  const loadPending = useCallback(async () => {
    try {
      const attempts = await getPendingAttempts();
      setPendingAttempts(attempts || []);
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    loadPending();

    const handleOnline = () => {
      setIsOnline(true);
      loadPending();
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-attempt-queued', loadPending);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-attempt-queued', loadPending);
    };
  }, [loadPending]);

  const triggerSync = async () => {
    if (syncing || pendingAttempts.length === 0 || !navigator.onLine) return;

    setSyncing(true);
    setSyncMessage('Syncing answers...');

    try {
      const profile = await getOfflineProfile();
      const regularToken = getStoredAuthToken();
      const ticket = profile?.offlineSyncTicket;
      const authToken = regularToken || ticket;

      let successCount = 0;
      let authExpired = false;

      for (const attempt of pendingAttempts) {
        try {
          const res = await fetch(`${BASE}/api/alumni-exams/offline-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({
              clientAttemptId: attempt.clientAttemptId,
              examId: attempt.examId,
              answers: attempt.answers,
              startTime: attempt.startTime,
              endTime: attempt.endTime,
              elapsedDurationSeconds: attempt.elapsedDurationSeconds,
            }),
          });

          if (res.status === 401 || res.status === 403) {
            authExpired = true;
            break;
          }

          if (res.ok) {
            await removePendingAttempt(attempt.clientAttemptId);
            successCount += 1;
          }
        } catch (fetchErr) {
          console.error('Failed to sync attempt:', attempt.clientAttemptId, fetchErr);
        }
      }

      await loadPending();

      if (authExpired) {
        setSyncMessage('Ticket expired. Please sign in to submit saved exams.');
        if (onRequireLogin) onRequireLogin();
      } else if (successCount > 0) {
        setSyncMessage(`Successfully synced ${successCount} exam(s)!`);
        window.dispatchEvent(new CustomEvent('alumni-sync-completed'));
        setTimeout(() => setSyncMessage(null), 4000);
      } else {
        setSyncMessage(null);
      }
    } catch (err) {
      console.error('Offline sync error:', err);
      setSyncMessage('Sync failed. Will retry when connected.');
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setSyncing(false);
    }
  };

  // Auto-sync on reconnect if pending items exist
  useEffect(() => {
    if (isOnline && pendingAttempts.length > 0 && !syncing) {
      triggerSync();
    }
  }, [isOnline, pendingAttempts.length]);

  return (
    <div className="sync-status-wrapper" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      <div
        className={`sync-network-pill ${isOnline ? 'is-online' : 'is-offline'}`}
        title={isOnline ? 'Connected to internet' : 'Working offline'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: isOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
          color: isOnline ? '#16a34a' : '#ef4444',
          border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
        }}
      >
        <span
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background: isOnline ? '#16a34a' : '#ef4444',
          }}
        />
        {isOnline ? 'Online' : 'Offline'}
      </div>

      {pendingAttempts.length > 0 && (
        <button
          type="button"
          onClick={triggerSync}
          disabled={syncing || !isOnline}
          className="sync-pending-btn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            background: '#f59e0b',
            color: '#ffffff',
            border: 'none',
            cursor: isOnline && !syncing ? 'pointer' : 'not-allowed',
            opacity: syncing ? 0.7 : 1,
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
          }}
        >
          {syncing ? (
            <span>Syncing...</span>
          ) : (
            <>
              <span>{pendingAttempts.length} pending sync</span>
              {isOnline && <span style={{ textDecoration: 'underline' }}>Sync Now</span>}
            </>
          )}
        </button>
      )}

      {syncMessage && (
        <span style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
          {syncMessage}
        </span>
      )}
    </div>
  );
}
