import { useEffect, useMemo, useState } from 'react';
import { apiAuth } from '../lib/api.js';
import { Modal } from './Modal.jsx';
import '../styles/ChangeCredentialsModal.css';

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

function computeNextAt(lastChange, days) {
  if (!lastChange) return null;
  const t = new Date(lastChange).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + days * 24 * 60 * 60 * 1000);
}

export default function ChangeCredentialsModal({ open, onClose, me, onUpdated }) {
  const [newEmail, setNewEmail] = useState('');
  const [confirmNewEmail, setConfirmNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [status, setStatus] = useState({ kind: '', message: '' }); // kind: success|error
  const [saving, setSaving] = useState(false);

  const [serverEmailNextAt, setServerEmailNextAt] = useState(null);
  const [serverPasswordNextAt, setServerPasswordNextAt] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: '', message: '' });
    setServerEmailNextAt(null);
    setServerPasswordNextAt(null);
  }, [open]);

  const emailNextAt = useMemo(() => {
    if (serverEmailNextAt) return new Date(serverEmailNextAt);
    return computeNextAt(me?.lastEmailChange, 30);
  }, [me?.lastEmailChange, serverEmailNextAt]);

  const passwordNextAt = useMemo(() => {
    if (serverPasswordNextAt) return new Date(serverPasswordNextAt);
    return computeNextAt(me?.lastPasswordChange, 7);
  }, [me?.lastPasswordChange, serverPasswordNextAt]);

  const now = Date.now();
  const emailCooldownActive = !!(emailNextAt && now < emailNextAt.getTime());
  const passwordCooldownActive = !!(passwordNextAt && now < passwordNextAt.getTime());

  const emailSectionDisabled = emailCooldownActive;
  const passwordSectionDisabled = passwordCooldownActive;

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus({ kind: '', message: '' });
    setServerEmailNextAt(null);
    setServerPasswordNextAt(null);

    const wantsEmailChange = !emailSectionDisabled && (newEmail.trim() || confirmNewEmail.trim());
    const wantsPasswordChange = !passwordSectionDisabled && (currentPassword || newPassword || confirmNewPassword);

    if (!wantsEmailChange && !wantsPasswordChange) {
      setStatus({ kind: 'error', message: 'Enter a new email and/or password to update.' });
      return;
    }

    const body = {};

    if (wantsEmailChange) {
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
      body.newEmail = email;
    }

    if (wantsPasswordChange) {
      if (!currentPassword || !newPassword || !confirmNewPassword) {
        setStatus({ kind: 'error', message: 'Please fill out all password fields.' });
        return;
      }
      if (newPassword !== confirmNewPassword) {
        setStatus({ kind: 'error', message: 'New password and confirmation do not match.' });
        return;
      }
      body.currentPassword = currentPassword;
      body.newPassword = newPassword;
    }

    setSaving(true);
    try {
      const res = await apiAuth('/api/auth/update-credentials', { method: 'PATCH', body });
      setStatus({ kind: 'success', message: res?.message || 'Credentials updated.' });
      setNewEmail('');
      setConfirmNewEmail('');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      await onUpdated?.();
    } catch (err) {
      const nextEmail = err?.data?.nextEmailChangeAt || err?.data?.emailNextAt;
      const nextPass = err?.data?.nextPasswordChangeAt || err?.data?.passwordNextAt;
      if (nextEmail) setServerEmailNextAt(nextEmail);
      if (nextPass) setServerPasswordNextAt(nextPass);

      const message =
        err?.data?.message ||
        err?.message ||
        'Failed to update credentials.';
      setStatus({ kind: 'error', message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Change Email & Password">
      <form onSubmit={handleSubmit} className="change-credentials-form">
        <section className="change-credentials-section">
          <div className="change-credentials-section-header">
            <h3>Change Email</h3>
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
        </section>

        <section className="change-credentials-section">
          <div className="change-credentials-section-header">
            <h3>Change Password</h3>
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
        </section>

        {status.message && (
          <div className={`change-credentials-status ${status.kind}`}>
            {status.message}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-btn-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="modal-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

