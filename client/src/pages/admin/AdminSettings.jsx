import { useEffect, useState } from 'react';
import { apiAuth } from '../../lib/api.js';
import '../../styles/AdminSettings.css';
import '../../styles/Modal.css';

export default function AdminSettings() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [emailCooldownDays, setEmailCooldownDays] = useState(30);
  const [passwordCooldownDays, setPasswordCooldownDays] = useState(7);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const settings = await apiAuth('/api/admin/settings');
        if (cancelled) return;
        setEmailCooldownDays(Number(settings.emailCooldownDays ?? 30));
        setPasswordCooldownDays(Number(settings.passwordCooldownDays ?? 7));
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

  async function onSave(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    const emailDays = Number(emailCooldownDays);
    const passDays = Number(passwordCooldownDays);
    if (!Number.isFinite(emailDays) || emailDays < 0 || emailDays > 365) {
      setError('Email cooldown days must be between 0 and 365.');
      return;
    }
    if (!Number.isFinite(passDays) || passDays < 0 || passDays > 365) {
      setError('Password cooldown days must be between 0 and 365.');
      return;
    }

    setSaving(true);
    try {
      await apiAuth('/api/admin/settings', {
        method: 'PATCH',
        body: {
          emailCooldownDays: Math.trunc(emailDays),
          passwordCooldownDays: Math.trunc(passDays),
        },
      });
      setSuccess('Settings saved.');
    } catch (err) {
      setError(err?.data?.message || err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="as-page">
      <header className="as-page-header">
        <div className="as-header">
          <div>
            <h1 className="as-title">Settings</h1>
            <p className="as-subtitle">Configure system cooldowns for credential changes.</p>
          </div>
        </div>
      </header>

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
                disabled={loading || saving}
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
                disabled={loading || saving}
              />
              </div>
            </div>

            {(error || success) && (
              <div className={`as-status ${error ? 'error' : 'success'}`}>
                {error || success}
              </div>
            )}

            <div className="as-actions">
              <button className="modal-btn-primary" type="submit" disabled={loading || saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
