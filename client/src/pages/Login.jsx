import { useEffect, useState, useRef } from 'react';
import { api } from '../lib/api.js';
import '../styles/Login.css';

// [FIX - SESSION EXPIRED MESSAGE]
function clearSessionExpiredFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('session')) return;
  url.searchParams.delete('session');
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

// ── Eye Toggle Icon ───────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

// (Removed ShieldWatermark as requested)

export default function Login({ onLogin, onNavigate }) {
  const [mode, setMode] = useState('login'); // 'login' | 'forgot_email' | 'forgot_otp' | 'forgot_new'

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showSessionExpired, setShowSessionExpired] = useState(false);
  const [showAccountDeactivated, setShowAccountDeactivated] = useState(false);

  const wrapperRef = useRef(null);

  // [FIX - SESSION EXPIRED MESSAGE]
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('session') === 'expired') {
      setShowSessionExpired(true);
      clearSessionExpiredFromUrl();
    } else if (params.get('session') === 'deactivated') {
      setShowAccountDeactivated(true);
      clearSessionExpiredFromUrl();
    }
  }, []);

  // Theme support consistent with landing page
  useEffect(() => {
    document.documentElement.classList.add('landing-theme');
    return () => document.documentElement.classList.remove('landing-theme');
  }, []);

  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetNew, setShowResetNew] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Exact 3D tilt background effect from landing page
  const handleMouseMove = (e) => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    wrapperRef.current.style.setProperty('--mouse-x', `${x}px`);
    wrapperRef.current.style.setProperty('--mouse-y', `${y}px`);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const percentX = (x - centerX) / centerX;
    const percentY = (y - centerY) / centerY;

    wrapperRef.current.style.setProperty('--rotate-x', `${-percentY * 6}deg`);
    wrapperRef.current.style.setProperty('--rotate-y', `${percentX * 6}deg`);
  };

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
      clearSessionExpiredFromUrl();
      setShowSessionExpired(false);
      onLogin();
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
    <div className="lp-wrapper" ref={wrapperRef} onMouseMove={handleMouseMove}>
      {/* ── Background Elements (Reused Landing Page Behavior) ── */}
      <div className="lp-static-bg" aria-hidden="true" />
      <div className="lp-grid-3d-wrapper" aria-hidden="true">
        <div className="lp-base-dots" />
        <div className="lp-interactive-grid" />
      </div>

      {/* ── Wide Split Card Container ──────────────────────── */}
      <main className="lp-card" role="main">

        {/* ── LEFT PANE: Branding / Info ──────────────────── */}
        <div className="lp-info-panel">
          <div className="lp-info-content">
            <span className="lp-info-kicker">National University Reviewer</span>
            <h2 className="lp-info-title">
              Board Exam &<br />
              Review Kit
            </h2>
            <h3 className="lp-info-start">Let's Get Started</h3>
            <p className="lp-info-desc">
              Access your account to manage your activities, view updates, and continue where you left off. Enter your credentials below to get started.
            </p>
          </div>
        </div>

        {/* ── RIGHT PANE: Interactive Form ────────────────── */}
        <div className="lp-form-panel">
          <div className="lp-form-header">
            <h1 className="lp-form-title">Login To Your Account</h1>
          </div>

          {/* ── LOGIN MODE ────────────────────────────────── */}
          {mode === 'login' && (
            <form className="lp-form" onSubmit={handleSubmit} noValidate>

              {/* Session / Alert Banners */}
              {showSessionExpired && (
                <div className="lp-banner lp-banner--warn" role="status">
                  <span>Your session has expired. Please sign in again.</span>
                  <button
                    type="button"
                    className="lp-banner-link"
                    onClick={() => {
                      setShowSessionExpired(false);
                      if (typeof onNavigate === 'function') onNavigate('Dashboard');
                    }}
                  >
                    Go Home
                  </button>
                </div>
              )}

              {showAccountDeactivated && (
                <div className="lp-banner lp-banner--danger" role="status">
                  <span>Account is deactivated. Contact admins for assistance.</span>
                  <button
                    type="button"
                    className="lp-banner-link lp-banner-link--danger"
                    onClick={() => {
                      setShowAccountDeactivated(false);
                      if (typeof onNavigate === 'function') onNavigate('Dashboard');
                    }}
                  >
                    Go Home
                  </button>
                </div>
              )}

              <div className="lp-field">
                <label className="lp-label" htmlFor="login-email">Email Address</label>
                <input
                  id="login-email"
                  className="lp-input"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (showSessionExpired) setShowSessionExpired(false);
                    if (showAccountDeactivated) setShowAccountDeactivated(false);
                  }}
                  placeholder="ex. juandelacruz@nu-laguna.edu.ph"
                  autoComplete="email"
                />
              </div>

              <div className="lp-field">
                <label className="lp-label" htmlFor="login-password">Password</label>
                <div className="lp-input-wrap">
                  <input
                    id="login-password"
                    className="lp-input lp-input--padded-r"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (showSessionExpired) setShowSessionExpired(false);
                      if (showAccountDeactivated) setShowAccountDeactivated(false);
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="lp-eye-btn"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div className="lp-forgot-row">
                <button type="button" className="lp-text-link" onClick={startForgotPassword}>
                  Forgot password?
                </button>
              </div>

              {success && <p className="lp-msg lp-msg--success">{success}</p>}
              {error && <p className="lp-msg lp-msg--error">{error}</p>}

              <button
                type="submit"
                className="lp-submit-btn"
                disabled={busy}
                id="login-submit-btn"
              >
                <span className="lp-btn-shimmer" aria-hidden="true" />
                {busy ? 'Signing in…' : 'Log In'}
              </button>
            </form>
          )}

          {/* ── FORGOT PASSWORD: ENTER EMAIL ───────────────── */}
          {mode === 'forgot_email' && (
            <form className="lp-form" onSubmit={submitForgotEmail} noValidate>
              <p className="lp-helper">
                Enter your registered email and we'll send you a 6-digit reset code.
              </p>

              <div className="lp-field">
                <label className="lp-label" htmlFor="reset-email">Email Address</label>
                <input
                  id="reset-email"
                  className="lp-input"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="ex. juandelacruz@nu-laguna.edu.ph"
                  autoComplete="email"
                />
              </div>

              {success && <p className="lp-msg lp-msg--success">{success}</p>}
              {error && <p className="lp-msg lp-msg--error">{error}</p>}

              <div className="lp-btn-row">
                <button type="button" className="lp-cancel-btn" onClick={cancelForgotPassword} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="lp-submit-btn lp-submit-btn--flex" disabled={busy}>
                  <span className="lp-btn-shimmer" aria-hidden="true" />
                  {busy ? 'Sending…' : 'Send Code'}
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD: ENTER OTP ─────────────────── */}
          {mode === 'forgot_otp' && (
            <form className="lp-form" onSubmit={(e) => { e.preventDefault(); setMode('forgot_new'); }} noValidate>
              <p className="lp-helper">
                Enter the 6-digit code sent to <strong>{resetEmail}</strong>.
              </p>

              <div className="lp-field">
                <label className="lp-label" htmlFor="reset-otp">Reset Code</label>
                <input
                  id="reset-otp"
                  className="lp-input lp-input--otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={resetOtp}
                  onChange={(e) => setResetOtp(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  placeholder="••••••"
                />
              </div>

              <div className="lp-resend-row">
                <span>Didn't receive a code?</span>
                <button type="button" className="lp-text-link" onClick={resendCode} disabled={busy}>
                  Resend
                </button>
              </div>

              {success && <p className="lp-msg lp-msg--success">{success}</p>}
              {error && <p className="lp-msg lp-msg--error">{error}</p>}

              <div className="lp-btn-row">
                <button type="button" className="lp-cancel-btn" onClick={() => setMode('forgot_email')} disabled={busy}>
                  Back
                </button>
                <button
                  type="submit"
                  className="lp-submit-btn lp-submit-btn--flex"
                  disabled={busy || String(resetOtp).trim().length !== 6}
                >
                  <span className="lp-btn-shimmer" aria-hidden="true" />
                  Continue
                </button>
              </div>
            </form>
          )}

          {/* ── FORGOT PASSWORD: NEW PASSWORD ──────────────── */}
          {mode === 'forgot_new' && (
            <form className="lp-form" onSubmit={submitResetPassword} noValidate>
              <p className="lp-helper">
                Set a new password for <strong>{resetEmail}</strong>.
              </p>

              <div className="lp-field">
                <label className="lp-label" htmlFor="reset-new-password">New Password</label>
                <div className="lp-input-wrap">
                  <input
                    id="reset-new-password"
                    className="lp-input lp-input--padded-r"
                    type={showResetNew ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="lp-eye-btn"
                    onClick={() => setShowResetNew((v) => !v)}
                    aria-label={showResetNew ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showResetNew} />
                  </button>
                </div>
              </div>

              <div className="lp-field">
                <label className="lp-label" htmlFor="reset-confirm-password">Confirm New Password</label>
                <div className="lp-input-wrap">
                  <input
                    id="reset-confirm-password"
                    className="lp-input lp-input--padded-r"
                    type={showResetConfirm ? 'text' : 'password'}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="lp-eye-btn"
                    onClick={() => setShowResetConfirm((v) => !v)}
                    aria-label={showResetConfirm ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon open={showResetConfirm} />
                  </button>
                </div>
              </div>

              {success && <p className="lp-msg lp-msg--success">{success}</p>}
              {error && <p className="lp-msg lp-msg--error">{error}</p>}

              <div className="lp-btn-row">
                <button type="button" className="lp-cancel-btn" onClick={() => setMode('forgot_otp')} disabled={busy}>
                  Back
                </button>
                <button type="submit" className="lp-submit-btn lp-submit-btn--flex" disabled={busy}>
                  <span className="lp-btn-shimmer" aria-hidden="true" />
                  {busy ? 'Saving…' : 'Reset Password'}
                </button>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  );
}
