import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import '../../styles/Login.css';
import PageHeader from '../../components/PageHeader.jsx';

// [FIX - SESSION EXPIRED MESSAGE]
function clearSessionExpiredFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('session')) return;
  url.searchParams.delete('session');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function Login({ onLogin, onNavigate }) {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot_email' | 'forgot_otp' | 'forgot_new'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSessionExpired, setShowSessionExpired] = useState(false);

  // [FIX - SESSION EXPIRED MESSAGE]
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'expired') {
      setShowSessionExpired(true);
      clearSessionExpiredFromUrl();
    }
  }, []);

  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      // [FIX - SESSION EXPIRED MESSAGE]
      clearSessionExpiredFromUrl();
      setShowSessionExpired(false);
      onLogin(data.token);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotEmail(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: resetEmail } });
      setSuccess('If this email is registered, you will receive a reset code shortly.');
      setMode('forgot_otp');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email: resetEmail } });
      setSuccess('If this email is registered, you will receive a reset code shortly.');
    } catch (err) {
      setError(err.message || 'Request failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitResetPassword(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!resetOtp || String(resetOtp).trim().length !== 6) {
      setError('Please enter the 6-digit code.');
      return;
    }

    if (!resetNewPassword || resetNewPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      const res = await api('/api/auth/reset-password', {
        method: 'POST',
        body: { email: resetEmail, otp: String(resetOtp).trim(), newPassword: resetNewPassword },
      });
      setSuccess(res?.message || 'Password reset successful.');

      setMode('login');
      setEmail(resetEmail);
      setPassword('');
      setResetOtp('');
      setResetNewPassword('');
      setResetConfirmPassword('');
    } catch (err) {
      setError(err.message || 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  function startForgotPassword() {
    setError('');
    setSuccess('');
    setResetEmail(email || '');
    setResetOtp('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setMode('forgot_email');
  }

  function cancelForgotPassword() {
    setError('');
    setSuccess('');
    setMode('login');
  }

  return (
    <main className="login-page-container">
      <PageHeader
        className="shared-page-header--bleed-lr"
        title="Login"
        subtitle="Access your account to manage your activities, view updates, and continue where you left off. Enter your credentials below to get started."
      />

      <div className="login-shell">
        <section className="login-card">
          <div className="login-card-header">
            <h3>
              {mode === 'login' ? 'Login To Your Account' : 'Reset Your Password'}
            </h3>
          </div>

          <div className="login-card-body">
            {mode === 'login' ? (
              <form className="login-form" onSubmit={handleSubmit}>
                {/* [FIX - SESSION EXPIRED MESSAGE] */}
                {showSessionExpired ? (
                  <div
                    className="login-session-expired-banner"
                    role="status"
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      color: '#92400e',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      fontSize: '13px',
                      margin: '0 0 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Your session has expired. Please log in again.</span>
                    <button
                      type="button"
                      className="login-inline-link"
                      onClick={() => {
                        setShowSessionExpired(false);
                        if (typeof onNavigate === 'function') onNavigate('Dashboard');
                      }}
                    >
                      Back to Home
                    </button>
                  </div>
                ) : null}

                <div className="login-form-group">
                  <label htmlFor="login-email">Email Address</label>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (showSessionExpired) setShowSessionExpired(false);
                    }}
                    placeholder="ex. juandelacruz@gmail.com"
                  />
                </div>
                <div className="login-form-group">
                  <label htmlFor="login-password">Password</label>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (showSessionExpired) setShowSessionExpired(false);
                    }}
                    placeholder="Enter password"
                  />
                </div>

                <div className="login-forgot-row">
                  <button type="button" className="login-inline-link" onClick={startForgotPassword}>
                    Forgot Password?
                  </button>
                </div>

                {success ? <p className="login-success-message">{success}</p> : null}
                {error ? <p className="login-error-message">{error}</p> : null}

                <div className="login-register-inline">
                  <span>Don't have an account?</span>
                  <button
                    type="button"
                    className="login-inline-link"
                    onClick={() => {
                      if (typeof onNavigate === 'function') onNavigate('Register');
                    }}
                  >
                    Sign Up
                  </button>
                </div>

                <div className="login-footer">
                  <button type="submit" className="login-submit-btn" disabled={busy}>
                    {busy ? 'Logging in...' : 'Log In'}
                  </button>
                </div>
              </form>
            ) : mode === 'forgot_email' ? (
              <form className="login-form" onSubmit={submitForgotEmail}>
                <p className="login-helper-text">
                  Enter your email and we’ll send you a 6-digit reset code (if the email is registered).
                </p>
                <div className="login-form-group">
                  <label htmlFor="reset-email">Email Address</label>
                  <input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="ex. juandelacruz@gmail.com"
                  />
                </div>

                {success ? <p className="login-success-message">{success}</p> : null}
                {error ? <p className="login-error-message">{error}</p> : null}

                <div className="login-footer login-footer-split">
                  <button type="button" className="login-cancel-btn" onClick={cancelForgotPassword} disabled={busy}>
                    Back
                  </button>
                  <button type="submit" className="login-submit-btn" disabled={busy}>
                    {busy ? 'Sending...' : 'Send Code'}
                  </button>
                </div>
              </form>
            ) : mode === 'forgot_otp' ? (
              <form className="login-form" onSubmit={(e) => { e.preventDefault(); setMode('forgot_new'); }}>
                <p className="login-helper-text">
                  Enter the 6-digit code sent to <strong>{resetEmail}</strong>.
                </p>
                <div className="login-form-group">
                  <label htmlFor="reset-otp">Reset Code</label>
                  <input
                    id="reset-otp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={resetOtp}
                    onChange={(e) => setResetOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                    placeholder="6-digit code"
                  />
                </div>

                <div className="login-resend-row">
                  <span>Didn’t get a code?</span>
                  <button type="button" className="login-inline-link" onClick={resendCode} disabled={busy}>
                    Resend code
                  </button>
                </div>

                {success ? <p className="login-success-message">{success}</p> : null}
                {error ? <p className="login-error-message">{error}</p> : null}

                <div className="login-footer login-footer-split">
                  <button type="button" className="login-cancel-btn" onClick={() => setMode('forgot_email')} disabled={busy}>
                    Back
                  </button>
                  <button type="submit" className="login-submit-btn" disabled={busy || String(resetOtp).trim().length !== 6}>
                    Continue
                  </button>
                </div>
              </form>
            ) : (
              <form className="login-form" onSubmit={submitResetPassword}>
                <p className="login-helper-text">
                  Set your new password for <strong>{resetEmail}</strong>.
                </p>
                <div className="login-form-group">
                  <label htmlFor="reset-new-password">New Password</label>
                  <input
                    id="reset-new-password"
                    type="password"
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="Enter new password"
                  />
                </div>
                <div className="login-form-group">
                  <label htmlFor="reset-confirm-password">Confirm New Password</label>
                  <input
                    id="reset-confirm-password"
                    type="password"
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                </div>

                {success ? <p className="login-success-message">{success}</p> : null}
                {error ? <p className="login-error-message">{error}</p> : null}

                <div className="login-footer login-footer-split">
                  <button type="button" className="login-cancel-btn" onClick={() => setMode('forgot_otp')} disabled={busy}>
                    Back
                  </button>
                  <button type="submit" className="login-submit-btn" disabled={busy}>
                    {busy ? 'Saving...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
