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
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [status, setStatus] = useState({ kind: '', message: '' }); // kind: success|error
  const [savingPassword, setSavingPassword] = useState(false);
  const [requestingOtp, setRequestingOtp] = useState(false);

  const [serverPasswordNextAt, setServerPasswordNextAt] = useState(null);
  const [serverPasswordCooldownDays, setServerPasswordCooldownDays] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStatus({ kind: '', message: '' });
    setServerPasswordNextAt(null);
    setServerPasswordCooldownDays(null);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setOtp('');
    setOtpRequested(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const meRes = await apiAuth('/api/auth/me');
        if (cancelled) return;
        const passDays = meRes?.passwordCooldownDays;
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

  const passwordNextAt = useMemo(() => {
    const raw = serverPasswordNextAt || me?.nextPasswordChangeAllowedAt;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [me?.nextPasswordChangeAllowedAt, serverPasswordNextAt]);

  const now = Date.now();
  const passwordCooldownActive = !!(passwordNextAt && now < passwordNextAt.getTime());

  const passwordSectionDisabled = passwordCooldownActive;

  async function handleRequestOtp() {
    setStatus({ kind: '', message: '' });
    
    if (passwordSectionDisabled) {
      setStatus({ kind: 'error', message: 'Password changes are currently on cooldown.' });
      return;
    }

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setStatus({ kind: 'error', message: 'Please fill out all password fields first.' });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setStatus({ kind: 'error', message: 'New password and confirmation do not match.' });
      return;
    }
    if (newPassword.length < 8) {
      setStatus({ kind: 'error', message: 'Password must be at least 8 characters.' });
      return;
    }

    setRequestingOtp(true);
    try {
      const res = await apiAuth('/api/auth/request-password-change-otp', {
        method: 'POST',
      });
      setStatus({ kind: 'success', message: res?.message || 'OTP sent to your email.' });
      setOtpRequested(true);
    } catch (err) {
      const message =
        err?.data?.message ||
        err?.message ||
        'Failed to request OTP.';
      setStatus({ kind: 'error', message });
    } finally {
      setRequestingOtp(false);
    }
  }

  async function handleSavePassword() {
    setStatus({ kind: '', message: '' });
    setServerPasswordNextAt(null);

    if (passwordSectionDisabled) {
      setStatus({ kind: 'error', message: 'Password changes are currently on cooldown.' });
      return;
    }

    if (!otp) {
      setStatus({ kind: 'error', message: 'Please enter the OTP sent to your email.' });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiAuth('/api/auth/update-credentials', {
        method: 'PATCH',
        body: { currentPassword, newPassword, otp },
      });
      setStatus({ kind: 'success', message: res?.message || 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setOtp('');
      setOtpRequested(false);
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

  const canRequestOtp =
    !passwordSectionDisabled &&
    !requestingOtp &&
    !!currentPassword &&
    !!newPassword &&
    !!confirmNewPassword;

  const canSavePassword =
    !passwordSectionDisabled &&
    !savingPassword &&
    otpRequested &&
    !!otp;

  return (
    <Modal open={open} onClose={onClose} title="Change Password">
      <div className="change-credentials-form">
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
                  disabled={otpRequested}
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
                  disabled={otpRequested}
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
                  disabled={otpRequested}
                />
              </div>
              
              {otpRequested && (
                <div className="modal-form-group full-width">
                  <label htmlFor="otp">Enter 6-digit OTP from Email</label>
                  <input
                    id="otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    maxLength={6}
                  />
                </div>
              )}
            </div>
          </fieldset>

          <div className="change-credentials-section-actions">
            {!otpRequested ? (
              <button
                type="button"
                className="modal-btn-primary"
                onClick={handleRequestOtp}
                disabled={!canRequestOtp}
                aria-disabled={!canRequestOtp}
              >
                {requestingOtp ? 'Sending...' : 'Request OTP'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="modal-btn-cancel"
                  onClick={() => setOtpRequested(false)}
                  style={{ marginRight: '8px' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="modal-btn-primary"
                  onClick={handleSavePassword}
                  disabled={!canSavePassword}
                  aria-disabled={!canSavePassword}
                >
                  {savingPassword ? 'Saving...' : 'Save Password'}
                </button>
              </>
            )}
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
