import { apiAuth } from './api.js';

// True while the account is locked out of signing in after too many wrong passwords
export function isLoginLocked(user, now = Date.now()) {
  const until = user?.loginLockedUntil ? new Date(user.loginLockedUntil).getTime() : NaN;
  return Number.isFinite(until) && until > now;
}

export function lockedUntilLabel(user) {
  const until = new Date(user.loginLockedUntil);
  return `Locked until ${until.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
}

// Clears the lockout so the user can sign in again right away
export function unlockUserLogin(userId) {
  return apiAuth(`/api/auth/users/${encodeURIComponent(userId)}/unlock`, { method: 'PATCH', body: {} });
}

// The list row as it looks after a successful unlock
export function withLoginUnlocked(user) {
  return { ...user, loginLockedUntil: null, loginFailedAttempts: 0 };
}
