import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import '../styles/components/ChangeCredentialsModal.css';

function formatDateTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ChangeCredentialsModal({ open, onClose, me, onUpdated }) {
  const [newEmail, setNewEmail] = useState('');
  const [confirmNewEmail, setConfirmNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [status, setStatus] = useState({ kind: '', message: '' }); // kind: success|error
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [serverEmailNextAt, setServerEmailNextAt] = useState(null);
  const [serverPasswordNextAt, setServerPasswordNextAt] = useState(null);
  const [serverEmailCooldownDays, setServerEmailCooldownDays] = useState(null);
  const [serverPasswordCooldownDays, setServerPasswordCooldownDays] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: '', message: '' });
    setServerEmailNextAt(null);
    setServerPasswordNextAt(null);
    setServerEmailCooldownDays(null);
    setServerPasswordCooldownDays(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await apiAuth('/api/auth/me');
        if (cancelled) return;
        const emailDays = meRes?.emailCooldownDays;
        const passDays = meRes?.passwordCooldownDays;
        if (emailDays !== undefined && emailDays !== null && emailDays !== '') {
          setServerEmailCooldownDays(Number(emailDays));
        }
        if (passDays !== undefined && passDays !== null && passDays !== '') {
          setServerPasswordCooldownDays(Number(passDays));
        }
      } catch {
        // Ignore - modal can still operate without displaying cooldown days.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const emailCooldownDays = useMemo(() => {
    const raw = serverEmailCooldownDays ?? me?.emailCooldownDays;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [me?.emailCooldownDays, serverEmailCooldownDays]);

  const passwordCooldownDays = useMemo(() => {
    const raw = serverPasswordCooldownDays ?? me?.passwordCooldownDays;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [me?.passwordCooldownDays, serverPasswordCooldownDays]);

  function formatDays(value) {
    if (value === null || value === undefined) return '';
    const n = Math.max(Math.trunc(Number(value) || 0), 0);
    const label = n === 1 ? 'day' : 'days';
    return `${n} ${label}`;
  }

  const emailNextAt = useMemo(() => {
    const raw = serverEmailNextAt || me?.nextEmailChangeAllowedAt;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [me?.nextEmailChangeAllowedAt, serverEmailNextAt]);

  const passwordNextAt = useMemo(() => {
    const raw = serverPasswordNextAt || me?.nextPasswordChangeAllowedAt;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [me?.nextPasswordChangeAllowedAt, serverPasswordNextAt]);

  const now = Date.now();
  const emailCooldownActive = !!(emailNextAt && now < emailNextAt.getTime());
  const passwordCooldownActive = !!(passwordNextAt && now < passwordNextAt.getTime());

  const emailSectionDisabled = emailCooldownActive;
  const passwordSectionDisabled = passwordCooldownActive;

  async function handleSaveEmail() {
    setStatus({ kind: '', message: '' });
    setServerEmailNextAt(null);

    if (emailSectionDisabled) {
      setStatus({ kind: 'error', message: 'Email changes are currently on cooldown.' });
      return;
    }

    const email = newEmail.trim().toLowerCase();
    const email2 = confirmNewEmail.trim().toLowerCase();
    if (!email || !email2) {
      setStatus({ kind: 'error', message: 'Please fill out both new email fields.' });
      return;
    }
    if (email !== email2) {
      setStatus({ kind: 'error', message: 'New email and confirmation do not match.' });
      return;
    }

    setSavingEmail(true);
    try {
      const res = await apiAuth('/api/auth/update-credentials', { method: 'PATCH', body: { newEmail: email } });
      setStatus({ kind: 'success', message: res?.message || 'Email updated.' });
      setNewEmail('');
      setConfirmNewEmail('');
      await onUpdated?.();
    } catch (err) {
      const nextEmail = err?.data?.nextEmailChangeAt || err?.data?.emailNextAt;
      if (nextEmail) setServerEmailNextAt(nextEmail);

      const message =
        err?.data?.message ||
        err?.message ||
        'Failed to update email.';
      setStatus({ kind: 'error', message });
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleSavePassword() {
    setStatus({ kind: '', message: '' });
    setServerPasswordNextAt(null);

    if (passwordSectionDisabled) {
      setStatus({ kind: 'error', message: 'Password changes are currently on cooldown.' });
      return;
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setStatus({ kind: 'error', message: 'Please fill out all password fields.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus({ kind: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiAuth('/api/auth/update-credentials', {
        method: 'PATCH',
        body: { currentPassword, newPassword },
      });
      setStatus({ kind: 'success', message: res?.message || 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await onUpdated?.();
    } catch (err) {
      const nextPass = err?.data?.nextPasswordChangeAt || err?.data?.passwordNextAt;
      if (nextPass) setServerPasswordNextAt(nextPass);

      const message =
        err?.data?.message ||
        err?.message ||
        'Failed to update password.';
      setStatus({ kind: 'error', message });
    } finally {
      setSavingPassword(false);
    }
  }

  const canSaveEmail =
    !emailSectionDisabled &&
    !savingEmail &&
    !!newEmail.trim() &&
    !!confirmNewEmail.trim();

  const canSavePassword =
    !passwordSectionDisabled &&
    !savingPassword &&
    !!currentPassword &&
    !!newPassword &&
    !!confirmNewPassword;

  return (
    <Modal open={open} onClose={onClose} title="Change Email & Password">
      <div className="change-credentials-form">
        <section className="change-credentials-section">
          <div className="change-credentials-section-header">
            <h3>Change Email</h3>
            {emailCooldownDays !== null && (
              <p className="cooldown-note">Cooldown: {formatDays(emailCooldownDays)}</p>
            )}
            {emailCooldownActive && (
              <p className="cooldown-note">
                Email changes are on cooldown until {formatDateTime(emailNextAt)}.
              </p>
            )}
          </div>

          <fieldset disabled={emailSectionDisabled} className="change-credentials-fieldset">
            <div className="modal-form-grid">
              <div className="modal-form-group">
                <label htmlFor="newEmail">New email</label>
                <input
                  id="newEmail"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
              <div className="modal-form-group">
                <label htmlFor="confirmNewEmail">Confirm new email</label>
                <input
                  id="confirmNewEmail"
                  type="email"
                  value={confirmNewEmail}
                  onChange={(e) => setConfirmNewEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="email"
                />
              </div>
            </div>
          </fieldset>

          <div className="change-credentials-section-actions">
            <button
              type="button"
              className="modal-btn-primary"
              onClick={handleSaveEmail}
              disabled={!canSaveEmail}
              aria-disabled={!canSaveEmail}
            >
              {savingEmail ? 'Saving...' : 'Save Email'}
            </button>
          </div>
        </section>

        <section className="change-credentials-section">
          <div className="change-credentials-section-header">
            <h3>Change Password</h3>
            {passwordCooldownDays !== null && (
              <p className="cooldown-note">Cooldown: {formatDays(passwordCooldownDays)}</p>
            )}
            {passwordCooldownActive && (
              <p className="cooldown-note">
                Password changes are on cooldown until {formatDateTime(passwordNextAt)}.
              </p>
            )}
          </div>

          <fieldset disabled={passwordSectionDisabled} className="change-credentials-fieldset">
            <div className="modal-form-grid">
              <div className="modal-form-group full-width">
                <label htmlFor="currentPassword">Current password</label>
                <input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <div className="modal-form-group">
                <label htmlFor="newPassword">New password</label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <div className="modal-form-group">
                <label htmlFor="confirmNewPassword">Confirm new password</label>
                <input
                  id="confirmNewPassword"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
            </div>
          </fieldset>

          <div className="change-credentials-section-actions">
            <button
              type="button"
              className="modal-btn-primary"
              onClick={handleSavePassword}
              disabled={!canSavePassword}
              aria-disabled={!canSavePassword}
            >
              {savingPassword ? 'Saving...' : 'Save Password'}
            </button>
          </div>
        </section>

        {status.message && (
          <div className={`change-credentials-status ${status.kind}`}>
            {status.message}
          </div>
        )}

        <div className="modal-actions">
          {/* Cancel button removed for cleaner UX; users can close via modal X */}
        </div>
      </div>
    </Modal>
  );
}

