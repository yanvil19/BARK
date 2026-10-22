import { useEffect, useRef } from 'react';
import { api } from '../lib/api.js';

const HEARTBEAT_INTERVAL = 30 * 1000; // Ping every 60 seconds
const IDLE_TIMEOUT = 60 * 1000;       // Considered idle if no user interaction for 60 seconds

export function useHeartbeat(user) {
  const lastActivityRef = useRef(Date.now());
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    if (!user?._id) return;

    // Track user input to know whether the user is active or idle
    const registerActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach((evt) =>
      window.addEventListener(evt, registerActivity, { passive: true })
    );

    const sendHeartbeat = async () => {
      // 1. Avoid pinging if tab/window is unfocused or hidden
      if (typeof document !== 'undefined' && document.hidden) return;

      // 2. Throttle / avoid pinging if user has been idle for more than IDLE_TIMEOUT
      const isIdle = Date.now() - lastActivityRef.current > IDLE_TIMEOUT;
      if (isIdle) return;

      try {
        await api('/api/user/heartbeat', { method: 'POST' });
      } catch (err) {
        // Silently catch to avoid disrupting application flow
        console.debug('Heartbeat ping failed:', err);
      }
    };

    // Immediate ping on login / initial load
    sendHeartbeat();

    // Regular interval
    const intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // Immediate ping when user switches back to this tab
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        lastActivityRef.current = Date.now();
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMountedRef.current = false;
      clearInterval(intervalId);
      activityEvents.forEach((evt) =>
        window.removeEventListener(evt, registerActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?._id]);
}
