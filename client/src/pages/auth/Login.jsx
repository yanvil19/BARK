import { useState } from 'react';
import { api } from '../lib/api.js';
import '../styles/Login.css';

export default function Login({ onLogin, onNavigate }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      onLogin(data.token);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page-container">
      <header className="login-page-header">
        <h2>Login</h2>
        <p className="login-subtitle">
          Access your account to manage your activities, view updates, and continue where you left off. Enter your
          email and password below to get started.
        </p>
      </header>

      <div className="login-shell">
        <section className="login-card">
          <div className="login-card-header">
            <h3>Login To Your Account</h3>
          </div>

          <div className="login-card-body">
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-form-group">
                <label htmlFor="login-email">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ex. juandelacruz@gmail.com"
                />
              </div>
              <div className="login-form-group">
                <label htmlFor="login-password">Password</label>
                <input
                  id="login-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                />
              </div>

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
          </div>
        </section>
      </div>
    </main>
  );
}
