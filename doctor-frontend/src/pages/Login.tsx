import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, { username, password });
      const { token, user } = response.data;

      if (user.role !== 'Doctor') {
        setError('This portal is for doctors only. Use the main system for other roles.');
        return;
      }

      login(token, user);
      const redirectTo = (location.state as { from?: string } | null)?.from || '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else {
        setError('An unexpected error occurred. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dr-auth-layout">
      <style>{AUTH_STYLES}</style>
      <div className="dr-auth-shell">
        <div className="dr-illustration-panel">
          <div className="dr-logo-row">
            <div className="dr-logo-icon">
              <BrandMark />
            </div>
            <div className="dr-brand-text">
              <span className="dr-brand-name">E-POCH</span>
              <span className="dr-brand-sub">MEDICAL SYSTEM</span>
            </div>
          </div>

          <h1 className="dr-welcome-title">Doctor Portal</h1>
          <p className="dr-welcome-sub">Sign in to reach your queue, consultations, and prescriptions.</p>

          <div className="dr-illustration">
            <StethoscopeIllustration />
          </div>

          <div className="dr-secure-note">
            <ShieldIcon />
            <span>Your data is secure and encrypted</span>
          </div>
        </div>

        <div className="dr-form-panel">
          <h2 className="dr-form-title">Sign In</h2>
          <p className="dr-form-sub">Enter your doctor credentials to continue</p>

          <form onSubmit={handleLogin}>
            <div className="dr-input-group">
              <label htmlFor="username">Username</label>
              <div className="dr-input-wrapper">
                <span className="dr-input-icon">
                  <MailIcon />
                </span>
                <input
                  id="username"
                  type="text"
                  className="dr-input-field"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="dr-input-group">
              <label htmlFor="password">Password</label>
              <div className="dr-input-wrapper">
                <span className="dr-input-icon">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="dr-input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="dr-input-icon dr-input-icon--right"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            {error && <div className="dr-error text-center mb-4">{error}</div>}

            <button type="submit" className="dr-btn dr-btn-primary" style={{ width: '100%' }} disabled={loading}>
              <LoginArrowIcon />
              {loading ? 'Authenticating…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ---------------- Icons (inline SVG, no external deps) ---------------- */

const MailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
  </svg>
);
const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.9 13.9 0 0 1-1.67 2.68M6.61 6.61C3.9 8.36 2 12 2 12s3.5 7 10 7a9.5 9.5 0 0 0 5.39-1.61M14.12 14.12a3 3 0 1 1-4.24-4.24" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);
const LoginArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />
  </svg>
);
const ShieldIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="m9 12 2 2 4-4" />
  </svg>
);
const BrandMark = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12h4l1.5-4L12 16l1.5-5L15 12h5" />
  </svg>
);
const StethoscopeIllustration = () => (
  <svg viewBox="0 0 320 220" width="100%" style={{ height: 'auto' }} xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="40" width="140" height="140" rx="6" fill="#e6eefc" />
    <path d="M70 70v30a25 25 0 0 0 50 0V70" stroke="#3b82f6" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="70" cy="65" r="6" fill="#3b82f6" />
    <circle cx="120" cy="65" r="6" fill="#3b82f6" />
    <path d="M120 100v20a20 20 0 0 0 20 20" stroke="#3b82f6" strokeWidth="4" fill="none" strokeLinecap="round" />
    <circle cx="145" cy="145" r="12" fill="#3b82f6" />
    <rect x="60" y="150" width="80" height="14" rx="7" fill="#c7dafc" />
  </svg>
);

/* ---------------- Styles (scoped by dr- prefix) ---------------- */
const AUTH_STYLES = `
.dr-auth-layout { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #eef3fb; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.dr-auth-shell { display: flex; width: 100%; max-width: 900px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(30,60,120,0.12); background: white; }
.dr-illustration-panel { flex: 1; background: linear-gradient(180deg,#eaf1fd,#f5f8fe); padding: 40px 36px; display: flex; flex-direction: column; }
.dr-form-panel { flex: 1; padding: 40px 36px; display: flex; flex-direction: column; justify-content: center; }
.dr-logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
.dr-logo-icon { width: 40px; height: 40px; border-radius: 10px; background: #2563eb; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
.dr-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.dr-brand-name { font-size: 18px; font-weight: 700; color: #2563eb; letter-spacing: 0.02em; }
.dr-brand-sub { font-size: 10.5px; color: #64748b; font-weight: 600; letter-spacing: 0.05em; }
.dr-welcome-title { font-size: 26px; font-weight: 700; color: #0f172a; margin: 0 0 6px; }
.dr-welcome-sub { color: #64748b; font-size: 14px; margin: 0 0 20px; }
.dr-illustration { flex: 1; display: flex; align-items: center; justify-content: center; }
.dr-secure-note { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 13px; margin-top: 16px; }
.dr-form-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.dr-form-sub { color: #64748b; font-size: 14px; margin: 0 0 24px; }
.dr-input-group { margin-bottom: 18px; }
.dr-input-group label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
.dr-input-wrapper { position: relative; display: flex; align-items: center; }
.dr-input-icon { position: absolute; left: 12px; color: #94a3b8; display: flex; }
.dr-input-icon--right { left: auto; right: 12px; background: none; border: none; cursor: pointer; padding: 0; }
.dr-input-field { width: 100%; padding: 11px 12px 11px 38px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color .15s; }
.dr-input-field:focus { border-color: #2563eb; }
.dr-error { color: #dc2626; font-size: 13px; }
.dr-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
.dr-btn-primary { background: #2563eb; color: white; }
.dr-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.dr-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.mb-4 { margin-bottom: 16px; }
.text-center { text-align: center; }
@media (max-width: 720px) {
  .dr-auth-shell { flex-direction: column; }
  .dr-illustration-panel { display: none; }
}
`;

export default Login;
