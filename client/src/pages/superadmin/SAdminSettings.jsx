import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/superadmin/SAdminSettings.css';
import '../../styles/components/Modal.css';
import PageHeader from '../../components/PageHeader.jsx';
import { Modal } from '../../components/Modal.jsx';

export default function AdminSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [emailCooldownDays, setEmailCooldownDays] = useState(30);
  const [passwordCooldownDays, setPasswordCooldownDays] = useState(7);
  const [maxUploadImages, setMaxUploadImages] = useState(5);
  const [originalSettings, setOriginalSettings] = useState(null);

  const [pendingStatus, setPendingStatus] = useState({ isPending: false });
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await apiAuth('/api/admin/settings');
        if (cancelled) return;
        const { settings, pendingStatus: pStatus } = res;
        setEmailCooldownDays(Number(settings.emailCooldownDays ?? 30));
        setPasswordCooldownDays(Number(settings.passwordCooldownDays ?? 7));
        setMaxUploadImages(Number(settings.maxUploadImages ?? 5));
        setOriginalSettings(settings);
        setPendingStatus(pStatus || { isPending: false });
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pendingStatus?.isPending || !pendingStatus?.expiresAt) {
      setTimeRemaining(0);
      return;
    }
    const interval = setInterval(() => {
      const remaining = new Date(pendingStatus.expiresAt).getTime() - Date.now();
      if (remaining <= 0) {
        setTimeRemaining(0);
        setPendingStatus({ isPending: false });
        clearInterval(interval);
        // Force refresh settings since it should be applied
        window.location.reload();
      } else {
        setTimeRemaining(Math.ceil(remaining / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingStatus]);

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const emailDays = Number(emailCooldownDays);
    const passDays = Number(passwordCooldownDays);
    const maxImages = Number(maxUploadImages);
    
    if (!Number.isFinite(emailDays) || emailDays < 0 || emailDays > 365) {
      setError('Email cooldown days must be between 0 and 365.');
      return;
    }
    if (!Number.isFinite(passDays) || passDays < 0 || passDays > 365) {
      setError('Password cooldown days must be between 0 and 365.');
      return;
    }
    if (!Number.isFinite(maxImages) || maxImages < 1 || maxImages > 50) {
      setError('Max upload images must be between 1 and 50.');
      return;
    }

    setShowConfirmModal(true);
  }

  async function confirmSave() {
    setShowConfirmModal(false);
    setSaving(true);
    setError('');
    
    try {
      const res = await apiAuth('/api/admin/settings/pending', {
        method: 'POST',
        body: {
          emailCooldownDays: Math.trunc(Number(emailCooldownDays)),
          passwordCooldownDays: Math.trunc(Number(passwordCooldownDays)),
          maxUploadImages: Math.trunc(Number(maxUploadImages)),
        },
      });
      setSuccess('Settings update pending. Will apply after countdown.');
      setPendingStatus({ isPending: true, expiresAt: res.pending.expiresAt, payload: res.pending.settingsPayload });
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to request settings update');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel() {
    setSaving(true);
    try {
      await apiAuth('/api/admin/settings/cancel', { method: 'POST' });
      setPendingStatus({ isPending: false });
      setSuccess('Pending update cancelled.');
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to cancel update');
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = originalSettings && (
    Number(emailCooldownDays) !== Number(originalSettings.emailCooldownDays ?? 30) ||
    Number(passwordCooldownDays) !== Number(originalSettings.passwordCooldownDays ?? 7) ||
    Number(maxUploadImages) !== Number(originalSettings.maxUploadImages ?? 5)
  );

  return (
    <main className="as-page">
      <PageHeader
        className="shared-page-header--bleed"
        title="Settings"
        subtitle="Configure system cooldowns for credential changes."
      />

      <div className="as-content">
        <section className="as-card">
          <h2>Account &amp; Security</h2>

          <form onSubmit={onSave} className="as-form">
            <div className="as-grid">
              <div className="as-field">
              <label htmlFor="emailCooldownDays">Email change cooldown (days)</label>
              <input
                id="emailCooldownDays"
                type="number"
                min="0"
                max="365"
                value={emailCooldownDays}
                onChange={(e) => setEmailCooldownDays(e.target.value)}
                disabled={loading || saving || pendingStatus?.isPending}
              />
              </div>

              <div className="as-field">
              <label htmlFor="passwordCooldownDays">Password change cooldown (days)</label>
              <input
                id="passwordCooldownDays"
                type="number"
                min="0"
                max="365"
                value={passwordCooldownDays}
                onChange={(e) => setPasswordCooldownDays(e.target.value)}
                disabled={loading || saving || pendingStatus?.isPending}
              />
              </div>

              <div className="as-field">
              <label htmlFor="maxUploadImages">Max upload images per question</label>
              <input
                id="maxUploadImages"
                type="number"
                min="1"
                max="50"
                value={maxUploadImages}
                onChange={(e) => setMaxUploadImages(e.target.value)}
                disabled={loading || saving || pendingStatus?.isPending}
              />
              </div>
            </div>

            {(error || success) && (
              <div className={`as-status ${error ? 'error' : 'success'}`}>
                {error || success}
              </div>
            )}

            <div className="as-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '1.5rem' }}>
              {!pendingStatus?.isPending ? (
                <button className="modal-btn-primary" type="submit" disabled={loading || saving || !hasChanges}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : (
                <>
                  <button className="modal-btn-danger" type="button" onClick={handleCancel} disabled={saving}>
                    {saving ? 'Cancelling...' : 'Cancel Pending Update'}
                  </button>
                  <span style={{ color: '#d32f2f', fontWeight: 'bold' }}>
                    Applying in {timeRemaining}s...
                  </span>
                </>
              )}
            </div>
          </form>
        </section>
      </div>

      <Modal
        open={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm Settings Update"
        size="compact"
      >
        <div className="modal-confirmation">
          <div className="modal-confirmation-message">
            Are you sure you want to apply this change?
          </div>
          <div className="modal-confirmation-extra" style={{ color: '#666', marginTop: '0.5rem' }}>
            Active faculty users will receive a 1-minute warning before the update is applied.
          </div>
        </div>
        <div className="modal-actions" style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button type="button" className="modal-btn-cancel" onClick={() => setShowConfirmModal(false)}>
            Cancel
          </button>
          <button type="button" className="modal-btn-primary" onClick={confirmSave}>
            Confirm
          </button>
        </div>
      </Modal>
    </main>
  );
}
