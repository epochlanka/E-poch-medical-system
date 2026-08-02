import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { API_BASE_URL } from '../lib/api';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

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
      const response = await axios.post(`${API_BASE_URL}/api/v1/auth/login`, {
        username,
        password
      });

      const { token, user } = response.data;
      login(token, user);

      const redirectTo = (location.state as { from?: string } | null)?.from || '/dashboard';
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      if (err.response?.data?.message) {
        setError(err.response.data.message);
      } else if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('An unexpected error occurred. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mc-auth-layout">
      <style>{MC_STYLES}</style>
      <div className="mc-auth-shell">
        {/* Left illustration / welcome panel */}
        <div className="mc-illustration-panel">
          <div className="mc-logo-row">
            <div className="mc-logo-icon">
              <HeartPulseIcon />
            </div>
            <div className="mc-brand-text">
              <span className="mc-brand-name">Medi<b>Care</b></span>
              <span className="mc-brand-sub">Clinic &amp; Dispensary</span>
            </div>
          </div>

          <h1 className="mc-welcome-title">Welcome Back!</h1>
          <p className="mc-welcome-sub">Sign in to continue to your clinic dashboard</p>

          <div className="mc-illustration">
            <ClinicIllustration />
          </div>

          <div className="mc-secure-note">
            <ShieldIcon />
            <span>Your data is secure and encrypted</span>
          </div>
        </div>

        {/* Right form panel */}
        <div className="mc-form-panel">
          <h2 className="mc-form-title">Sign In</h2>
          <p className="mc-form-sub">Enter your credentials to access your account</p>

          <form onSubmit={handleLogin}>
            <div className="mc-input-group">
              <label htmlFor="username">Email or Username</label>
              <div className="mc-input-wrapper">
                <span className="mc-input-icon">
                  <MailIcon />
                </span>
                <input
                  id="username"
                  type="text"
                  className="mc-input-field"
                  placeholder="Enter your email or username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="mc-input-group">
              <label htmlFor="password">Password</label>
              <div className="mc-input-wrapper">
                <span className="mc-input-icon">
                  <LockIcon />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className="mc-input-field"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="button"
                  className="mc-input-icon mc-input-icon--right"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </div>

            <div className="mc-row-between">
              <label className="mc-checkbox-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                <span className="mc-checkbox-box">
                  {rememberMe && <CheckIcon />}
                </span>
                Remember me
              </label>
              <a href="#" className="mc-link">Forgot password?</a>
            </div>

            {error && <div className="mc-error text-center mb-4">{error}</div>}

            <button
              type="submit"
              className="mc-btn mc-btn-primary"
              style={{ width: '100%' }}
              disabled={loading}
            >
              <LoginArrowIcon />
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>

            <div className="mc-divider"><span>or continue with</span></div>

            <button type="button" className="mc-btn mc-btn-social" disabled={loading}>
              <GoogleIcon /> Continue with Google
            </button>
            <button type="button" className="mc-btn mc-btn-social" disabled={loading}>
              <MicrosoftIcon /> Continue with Microsoft
            </button>

            <p className="mc-signup-line">
              Don't have an account? <a href="#" className="mc-link">Sign up</a>
            </p>
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
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
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
const HeartPulseIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 14c1.5-1.5 3-3.5 3-6a4.5 4.5 0 0 0-8-2.5A4.5 4.5 0 0 0 6 8c0 2.5 1.5 4.5 3 6l5 6 5-6Z" />
    <path d="M3 12h4l1.5-3L11 15l1.5-4L14 12h3" />
  </svg>
);
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.85A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.85Z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.85C6.71 7.3 9.14 5.38 12 5.38Z" />
  </svg>
);
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24">
    <rect x="2" y="2" width="9" height="9" fill="#F35325" /><rect x="13" y="2" width="9" height="9" fill="#81BC06" />
    <rect x="2" y="13" width="9" height="9" fill="#05A6F0" /><rect x="13" y="13" width="9" height="9" fill="#FFBA08" />
  </svg>
);

const ClinicIllustration = () => (
  <svg viewBox="0 0 320 220" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg">
    <rect x="30" y="40" width="140" height="140" rx="6" fill="#e6eefc" />
    <rect x="55" y="60" width="90" height="30" rx="4" fill="#3b82f6" />
    <text x="100" y="80" fontSize="12" fill="white" textAnchor="middle" fontFamily="sans-serif">CLINIC</text>
    <circle cx="150" cy="115" r="14" fill="#bfd6fb" />
    <path d="M143 115h14M150 108v14" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
    <rect x="70" y="120" width="20" height="60" fill="#c7dafc" />
    <rect x="110" y="120" width="20" height="60" fill="#c7dafc" />
    <circle cx="70" cy="150" r="18" fill="#fbcfa0" />
    <rect x="55" y="165" width="30" height="45" rx="6" fill="white" />
    <circle cx="150" cy="155" r="16" fill="#3a2e2e" />
    <rect x="135" y="170" width="30" height="45" rx="6" fill="#4f7cf6" />
  </svg>
);

/* ---------------- Styles (scoped by mc- prefix) ---------------- */
const MC_STYLES = `
.mc-auth-layout { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #eef3fb; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
.mc-auth-shell { display: flex; width: 100%; max-width: 900px; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 50px rgba(30,60,120,0.12); background: white; }
.mc-illustration-panel { flex: 1; background: linear-gradient(180deg,#eaf1fd,#f5f8fe); padding: 40px 36px; display: flex; flex-direction: column; }
.mc-form-panel { flex: 1; padding: 40px 36px; display: flex; flex-direction: column; justify-content: center; }
.mc-form-panel--full { align-items: center; }
.mc-logo-row { display: flex; align-items: center; gap: 10px; margin-bottom: 32px; }
.mc-logo-row--center { justify-content: center; }
.mc-logo-icon { width: 40px; height: 40px; border-radius: 10px; background: #2563eb; display: flex; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
.mc-brand-text { display: flex; flex-direction: column; line-height: 1.1; }
.mc-brand-name { font-size: 18px; font-weight: 700; color: #1e293b; }
.mc-brand-name b { color: #2563eb; font-weight: 700; }
.mc-brand-sub { font-size: 11px; color: #64748b; }
.mc-welcome-title { font-size: 26px; font-weight: 700; color: #0f172a; margin: 0 0 6px; }
.mc-welcome-sub { color: #64748b; font-size: 14px; margin: 0 0 20px; }
.mc-illustration { flex: 1; display: flex; align-items: center; justify-content: center; }
.mc-secure-note { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 13px; margin-top: 16px; }
.mc-form-title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.mc-form-sub { color: #64748b; font-size: 14px; margin: 0 0 24px; }
.mc-input-group { margin-bottom: 18px; }
.mc-input-group label { display: block; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 6px; }
.mc-input-wrapper { position: relative; display: flex; align-items: center; }
.mc-input-icon { position: absolute; left: 12px; color: #94a3b8; display: flex; }
.mc-input-icon--right { left: auto; right: 12px; background: none; border: none; cursor: pointer; padding: 0; }
.mc-input-field { width: 100%; padding: 11px 12px 11px 38px; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box; transition: border-color .15s; }
.mc-input-field:focus { border-color: #2563eb; }
.mc-row-between { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.mc-checkbox-row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #334155; cursor: pointer; }
.mc-checkbox-row input { display: none; }
.mc-checkbox-box { width: 18px; height: 18px; border-radius: 4px; border: 1px solid #cbd5e1; display: flex; align-items: center; justify-content: center; color: white; background: white; }
.mc-checkbox-row input:checked ~ .mc-checkbox-box { background: #2563eb; border-color: #2563eb; }
.mc-link { color: #2563eb; font-size: 13px; text-decoration: none; font-weight: 500; }
.mc-link:hover { text-decoration: underline; }
.mc-error { color: #dc2626; font-size: 13px; }
.mc-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; border: none; }
.mc-btn-primary { background: #2563eb; color: white; }
.mc-btn-primary:hover:not(:disabled) { background: #1d4ed8; }
.mc-btn:disabled { opacity: 0.7; cursor: not-allowed; }
.mc-btn-social { width: 100%; background: white; border: 1px solid #e2e8f0; color: #334155; margin-bottom: 10px; }
.mc-btn-social:hover:not(:disabled) { background: #f8fafc; }
.mc-divider { text-align: center; font-size: 12px; color: #94a3b8; margin: 20px 0; position: relative; }
.mc-divider::before, .mc-divider::after { content: ''; position: absolute; top: 50%; width: 40%; height: 1px; background: #e2e8f0; }
.mc-divider::before { left: 0; }
.mc-divider::after { right: 0; }
.mc-divider span { background: white; padding: 0 8px; }
.mc-signup-line { text-align: center; font-size: 13px; color: #64748b; margin-top: 16px; }
.mc-muted { color: #64748b; }
.mb-4 { margin-bottom: 16px; }
.text-center { text-align: center; }
@media (max-width: 720px) {
  .mc-auth-shell { flex-direction: column; }
  .mc-illustration-panel { display: none; }
}
`;

export default Login;